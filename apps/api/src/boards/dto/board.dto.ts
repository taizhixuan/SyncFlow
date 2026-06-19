import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
  @IsEmail()
  email!: string;

  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}

export class UpdateMemberRoleDto {
  @IsIn(['editor', 'viewer'])
  role!: 'editor' | 'viewer';
}
