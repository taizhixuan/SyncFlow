import { IsEmail, IsIn, IsInt, IsOptional, IsPositive, Max, MaxLength, ValidateIf } from 'class-validator';

/** 30 days. Also keeps `Date.now() + hours` far from an Invalid Date. */
export const MAX_INVITE_EXPIRY_HOURS = 720;

export class CreateInviteDto {
  @IsIn(['email', 'share_link'])
  kind!: 'email' | 'share_link';

  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';

  @ValidateIf((o: CreateInviteDto) => o.kind === 'email')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(MAX_INVITE_EXPIRY_HOURS)
  expiresInHours?: number;
}
