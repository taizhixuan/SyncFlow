import { Link, useSearchParams } from 'react-router-dom';
import { withReturnTo } from '../auth-utils';
import { AuthLayout } from '../components/auth-layout';
import { SignupForm } from '../components/signup-form';

export function SignupPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  return (
    <AuthLayout
      title="Create your account."
      subtitle="Start a board and invite your team."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={withReturnTo('/login', searchParams.get('returnTo'))}
            className="font-medium text-brand hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
