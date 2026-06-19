import { Link } from 'react-router-dom';

export function Brand({ className = '' }: { className?: string }): JSX.Element {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand font-display text-sm font-bold text-white">
        S
      </span>
      <span className="font-display text-lg font-semibold tracking-tight text-ink">SyncFlow</span>
    </Link>
  );
}
