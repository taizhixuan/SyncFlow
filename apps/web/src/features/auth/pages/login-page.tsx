import { Link, useSearchParams } from 'react-router-dom';
import { withReturnTo } from '../auth-utils';
import { AuthLayout } from '../components/auth-layout';
import { LoginForm } from '../components/login-form';

export function LoginPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Log in to your boards."
      footer={
        <>
          New here?{' '}
          <Link
            to={withReturnTo('/signup', searchParams.get('returnTo'))}
            className="font-medium text-brand hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
