import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/auth-layout';
import { LoginForm } from '../components/login-form';

export function LoginPage(): JSX.Element {
  return (
    <AuthLayout
      title="Welcome back."
      subtitle="Log in to your boards."
      footer={
        <>
          New here?{' '}
          <Link to="/signup" className="font-medium text-brand hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
