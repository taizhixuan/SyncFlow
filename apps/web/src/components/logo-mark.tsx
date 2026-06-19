/**
 * SyncFlow logo mark. An S-spine drawn as one continuous stroke that flows from
 * cobalt to violet, with a solid presence dot at each terminus — two
 * collaborators' separate edits converging into a single synced flow (the
 * product's whole idea: conflict-free convergence). Reads down to 16px.
 */
export function LogoMark({
  size = 28,
  className = '',
}: {
  size?: number;
  className?: string;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="SyncFlow"
      className={className}
    >
      <defs>
        <linearGradient id="sf-logo-grad" x1="23" y1="8" x2="9" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3B5BFF" />
          <stop offset="1" stopColor="#9B5BFF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7.5" fill="#13131B" />
      <path
        d="M23 11 C23 7 16 6 13 9 C10 12 13 15 16 16 C19 17 22 20 19 23 C16 26 9 25 9 21"
        fill="none"
        stroke="url(#sf-logo-grad)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="11" r="2.1" fill="#3B5BFF" />
      <circle cx="9" cy="21" r="2.1" fill="#9B5BFF" />
    </svg>
  );
}
