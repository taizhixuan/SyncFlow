import { IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Omitted fields are left alone. `@IsOptional` would also wave `null` through,
 * and the non-nullable columns would then fail in Prisma as a 500, so only
 * `undefined` skips validation (avatarUrl is the one field `null` may clear).
 */
const isPresent = (_o: object, value: unknown): boolean => value !== undefined;

export class UpdateProfileDto {
  @ValidateIf(isPresent)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;

  @ValidateIf(isPresent)
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be a hex value like #3B5BFF' })
  color?: string;

  /**
   * Rendered as `<img src>` for every collaborator, so it must be a real
   * http(s) URL (no javascript:/data:). `null` clears it. Whether plain http is
   * acceptable depends on config (our own asset bucket), so UsersService makes
   * the final scheme/host decision.
   */
  @ValidateIf((_o, value: unknown) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(2048)
  @Matches(/^https?:\/\/[^\s]+$/i, { message: 'avatarUrl must be an http(s) URL' })
  avatarUrl?: string | null;
}
