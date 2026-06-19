import { Link } from 'react-router-dom';
import { AuthLayout } from '../components/auth-layout';
import { SignupForm } from '../components/signup-form';

export function SignupPage(): JSX.Element {
  return (
    <AuthLayout
      title="Create your account."
      subtitle="Start a board and invite your team."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
