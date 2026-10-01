/**
 * SyncFlow logo mark. An S-spine drawn as one continuous stroke with a solid
 * presence dot at each terminus — two collaborators' separate edits converging
 * into a single synced flow (the product's whole idea: conflict-free
 * convergence). Midnight renders it as ink on the lime accent, which reads on
 * both the dark and the light theme. Reads down to 16px.
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
      <rect width="32" height="32" rx="8" fill="#C8F04A" />
      <path
        d="M23 11 C23 7 16 6 13 9 C10 12 13 15 16 16 C19 17 22 20 19 23 C16 26 9 25 9 21"
        fill="none"
        stroke="#0B0B0E"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="11" r="2.1" fill="#0B0B0E" />
      <circle cx="9" cy="21" r="2.1" fill="#0B0B0E" />
    </svg>
  );
}
