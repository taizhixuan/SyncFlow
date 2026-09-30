import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateBoardDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}

export class UpdateBoardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}

export class AddMemberDto {
  // Emails are stored lowercased; normalize before validating so " Ada@X.io " works.
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}

export class UpdateMemberRoleDto {
  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}

export class TransferOwnershipDto {
  @IsUUID()
  userId!: string;
}
