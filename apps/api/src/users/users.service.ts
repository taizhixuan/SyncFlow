import { randomInt } from 'node:crypto';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PRESENCE_PALETTE, type UserPublic } from '@syncflow/shared';
import type { User } from '@prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  color: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: { ...input, email: input.email.toLowerCase().trim() },
    });
  }

  updateProfile(
    id: string,
    data: { displayName?: string; color?: string; avatarUrl?: string | null },
  ): Promise<User> {
    if (typeof data.avatarUrl === 'string') this.assertAcceptableAvatarUrl(data.avatarUrl);
    return this.prisma.user.update({ where: { id }, data });
  }

  /**
   * Any https URL is fine (e.g. an external avatar). Plain http is accepted
   * only for our own asset bucket, which is http in local dev (MinIO); anywhere
   * else it would be mixed content and a tracking/downgrade vector.
   */
  private assertAcceptableAvatarUrl(raw: string): void {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new UnprocessableEntityException(['avatarUrl must be a valid URL']);
    }
    if (url.protocol === 'https:') return;

    const { endpoint, bucket } = this.config.get('s3', { infer: true });
    const assetBase = endpoint && bucket ? `${endpoint.replace(/\/+$/, '')}/${bucket}/` : null;
    if (url.protocol === 'http:' && assetBase && raw.startsWith(assetBase)) return;
    throw new UnprocessableEntityException(['avatarUrl must be an https URL']);
  }

  /** Assign a presence color from the shared palette. */
  static pickPresenceColor(): string {
    return PRESENCE_PALETTE[randomInt(PRESENCE_PALETTE.length)]!;
  }

  /** Project a User to its network-safe shape (never leaks the password hash). */
  toPublic(user: User): UserPublic {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      color: user.color,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
