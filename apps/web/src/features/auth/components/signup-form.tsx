import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '../auth-context';
import { safeReturnTo } from '../auth-utils';
import { validateSignup, type FieldErrors } from '../auth-validation';

export function SignupForm(): JSX.Element {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<'email' | 'password' | 'displayName'>>({});
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(undefined);
    const invalid = validateSignup({ email: email.trim(), password, displayName: displayName.trim() });
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    setSubmitting(true);
    try {
      await signup(email.trim(), password, displayName.trim());
      navigate(returnTo);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('An account with that email already exists.');
      } else if (err instanceof ApiError && err.status === 422) {
        // The form already checks what the shared schema checks, so the server
        // disagreeing means a rule it alone knows; show its own words.
        setError(typeof err.message === 'string' && err.message ? err.message : 'Please check your details.');
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Wait a minute and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <TextField
        label="Display name"
        name="displayName"
        autoComplete="name"
        required
        error={fieldErrors.displayName}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
      />
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        error={fieldErrors.password}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
