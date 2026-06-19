import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserPublic } from '@syncflow/shared';
import type { User } from '@prisma/client';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly password: PasswordService,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async signup(dto: SignupDto): Promise<SessionResult> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await this.password.hash(dto.password);
    const user = await this.users.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      color: UsersService.pickPresenceColor(),
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<SessionResult> {
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
    return this.issueSession(user);
  }

  async refresh(presentedToken: string | undefined): Promise<SessionResult> {
    if (!presentedToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!record) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.revoked) {
      // A spent token is being replayed — treat as theft and kill the whole lineage.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId },
        data: { revoked: true },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: revoke the presented token, mint a new one in the same family.
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });
    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueSession(user, record.familyId);
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return; // idempotent
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
  }

  private async issueSession(user: User, familyId?: string): Promise<SessionResult> {
    const accessToken = this.tokens.signAccessToken({ sub: user.id, email: user.email });
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: familyId ?? randomUUID(),
        tokenHash,
        expiresAt: new Date(Date.now() + this.tokens.refreshTtlSeconds * 1000),
      },
    });
    return {
      accessToken,
      expiresIn: this.tokens.accessTtlSeconds,
      refreshToken: token,
      user: this.users.toPublic(user),
    };
  }
}
