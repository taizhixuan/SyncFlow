import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PRESENCE_PALETTE, type UserPublic } from '@syncflow/shared';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  displayName: string;
  color: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  updateProfile(id: string, data: { displayName?: string; color?: string }): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
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
