import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import type { UserPublic } from '@syncflow/shared';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

export interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  user: UserPublic;
}

/** Where a session was issued from — stored on the refresh token for auditing. */
export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * How long after a rotation the just-spent refresh token is still honoured.
 *
 * Two tabs cold-loading together (or a retried request whose response was
 * lost) legitimately present the same cookie twice. Without a grace window the
 * second request looks like theft and revokes the whole family — logging the
 * user out everywhere.
 *
 * Tradeoff: the successor's raw token only exists hashed, so the late request
 * cannot be handed the *same* session. It gets a new sibling token in the same
 * family instead; the family briefly has more than one live branch. An
 * attacker replaying a stolen token within this window is indistinguishable
 * from a slow tab — but they would need the token within seconds of the
 * rotation, and every branch still dies together on logout or reuse detection.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;

type Tx = Prisma.TransactionClient;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Note: signup answers 409 for a registered email, which does enumerate
   * accounts (login deliberately does not). The UX needs "email taken", so the
   * route carries a much stricter throttle than login instead.
   */
  async signup(dto: SignupDto, meta: ClientMeta = {}): Promise<SessionResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await this.password.hash(dto.password);
    let user: User;
    try {
      user = await this.users.create({
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        color: UsersService.pickPresenceColor(),
      });
    } catch (err) {
      // Two concurrent signups both pass the lookup above; the unique index is
      // the real arbiter, and the loser must see 409 rather than a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }
    return this.issueSession(user, undefined, meta);
  }

  async login(dto: LoginDto, meta: ClientMeta = {}): Promise<SessionResult> {
    const user = await this.users.findByEmail(dto.email);
    // Same error + a verify call on the miss path to avoid leaking which emails exist.
    if (!user?.passwordHash) {
      await this.password.hash(dto.password);
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await this.password.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueSession(user, undefined, meta);
  }

  async refresh(presentedToken: string | undefined, meta: ClientMeta = {}): Promise<SessionResult> {
    if (!presentedToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.updateMany({ where: { id: record.id }, data: { revoked: true } });
      throw new UnauthorizedException('Refresh token expired');
    }
    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Claim-and-replace in one transaction. The conditional update is the
    // atomic claim: a concurrent request blocks on the row lock, then matches
    // zero rows — so exactly one request rotates a given token.
    const rotated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.refreshToken.updateMany({
        where: { id: record.id, revoked: false },
        data: { revoked: true },
      });
      if (claim.count === 0) return null;
      return this.createRefreshRecord(tx, user.id, record.familyId, meta);
    });
    if (rotated) {
      return this.buildSession(user, record.familyId, rotated);
    }

    // The token was already spent. Honour it only if the family was rotated
    // moments ago and is still alive (see REFRESH_REUSE_GRACE_MS).
    const recentSuccessor = await this.prisma.refreshToken.findFirst({
      where: {
        familyId: record.familyId,
        id: { not: record.id },
        revoked: false,
        createdAt: { gte: new Date(Date.now() - REFRESH_REUSE_GRACE_MS) },
      },
      select: { id: true },
    });
    if (recentSuccessor) {
      const sibling = await this.createRefreshRecord(this.prisma, user.id, record.familyId, meta);
      return this.buildSession(user, record.familyId, sibling);
    }

    // A spent token replayed outside the grace window: treat as theft and kill
    // the whole lineage, including access tokens it already minted.
    this.logger.warn(`Refresh token reuse detected; revoking family ${record.familyId}`);
    await this.revokeFamily(record.familyId);
    throw new UnauthorizedException('Refresh token reuse detected');
  }

  /**
   * Revoke the presented session. Every rotation spends its predecessor, so the
   * family holds at most the current token (plus grace siblings) — revoking the
   * family ends exactly this login without touching other devices.
   */
  async logout(presentedToken: string | undefined, bearerToken?: string): Promise<void> {
    if (bearerToken) {
      const claims = this.tokens.tryVerifyIgnoringExpiry(bearerToken);
      if (claims?.jti && claims.exp) {
        await this.safely('denylist access token on logout', () =>
          this.tokens.revokeAccessToken(claims.jti!, claims.exp!),
        );
      }
    }
    if (!presentedToken) return; // idempotent
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) return;
    await this.revokeFamily(record.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId }, data: { revoked: true } });
    await this.safely('revoke family access tokens', () =>
      this.tokens.revokeFamilyAccessTokens(familyId),
    );
  }

  private async issueSession(user: User, familyId: string | undefined, meta: ClientMeta): Promise<SessionResult> {
    const family = familyId ?? randomUUID();
    const refresh = await this.createRefreshRecord(this.prisma, user.id, family, meta);
    return this.buildSession(user, family, refresh);
  }

  private async createRefreshRecord(
    db: Tx | PrismaService,
    userId: string,
    familyId: string,
    meta: ClientMeta,
  ): Promise<string> {
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    await db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash,
        userAgent: meta.userAgent?.slice(0, 512),
        ip: meta.ip?.slice(0, 64),
        expiresAt: new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000),
      },
    });
    return token;
  }

  private async buildSession(user: User, familyId: string, refreshToken: string): Promise<SessionResult> {
    const { token: accessToken, jti, exp } = this.tokens.signAccessTokenWithId({
      sub: user.id,
      email: user.email,
    });
    await this.safely('track family access token', () =>
      this.tokens.trackFamilyAccessToken(familyId, jti, exp),
    );
    return {
      accessToken,
      expiresIn: this.tokens.accessTtlSeconds,
      refreshToken,
      user: this.users.toPublic(user),
    };
  }

  /**
   * Redis-backed revocation is defence in depth on top of short-lived tokens;
   * a Redis outage must not block login/logout, but it must not be silent.
   */
  private async safely(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Failed to ${what}: ${(err as Error).message}`);
    }
  }
}
