import type { ZodType } from 'zod';
import { loginRequestSchema, signupRequestSchema } from '@syncflow/shared';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

/**
 * Plain-language messages per field, keyed by the Zod issue that failed. The
 * schemas are the ones the API validates with, so the form rejects exactly what
 * the server would, just without a round trip and a generic error.
 */
const MESSAGES: Record<string, Partial<Record<string, string>> & { default: string }> = {
  email: { too_small: 'Enter your email address.', default: 'Enter a valid email address.' },
  password: { too_small: 'Use at least 8 characters.', too_big: 'Use at most 200 characters.', default: 'Enter a valid password.' },
  displayName: { too_small: 'Enter a display name.', too_big: 'Use at most 60 characters.', default: 'Enter a display name.' },
};

function validate<K extends string>(
  schema: ZodType,
  values: Record<K, string>,
  overrides: Partial<Record<K, Partial<Record<string, string>>>> = {},
): FieldErrors<K> {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors<K> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as K | undefined;
    if (!field || errors[field]) continue;
    // A blank field is "missing", whatever rule it trips first.
    const blank = values[field].length === 0;
    const code = blank ? 'too_small' : issue.code;
    const own = overrides[field]?.[code];
    const table = MESSAGES[field];
    errors[field] = own ?? table?.[code] ?? table?.default ?? issue.message;
  }
  return errors;
}

export function validateLogin(values: { email: string; password: string }): FieldErrors<'email' | 'password'> {
  // Login only needs a password, not one that meets the signup rules.
  return validate(loginRequestSchema, values, { password: { too_small: 'Enter your password.' } });
}

export function validateSignup(values: {
  email: string;
  password: string;
  displayName: string;
}): FieldErrors<'email' | 'password' | 'displayName'> {
  return validate(signupRequestSchema, values);
}
