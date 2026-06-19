import { IsEmail, IsIn, IsInt, IsOptional, IsPositive, ValidateIf } from 'class-validator';

export class CreateInviteDto {
  @IsIn(['email', 'share_link'])
  kind!: 'email' | 'share_link';

  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';

  @ValidateIf((o: CreateInviteDto) => o.kind === 'email')
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  expiresInHours?: number;
}
