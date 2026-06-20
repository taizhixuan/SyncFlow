import { Link } from 'react-router-dom';
import { LogoMark } from '@/components/logo-mark';

export function Brand({ className = '' }: { className?: string }): JSX.Element {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={28} />
      <span className="font-display text-lg font-semibold tracking-tight text-ink dark:text-ink-dark">SyncFlow</span>
    </Link>
  );
}
