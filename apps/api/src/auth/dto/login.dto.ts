import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  // Matches signup's cap: argon2 hashes the full input, so an unbounded
  // password lets one request pin a CPU core.
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
