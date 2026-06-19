/** The brand signature: a pointer with a colored name flag. */
export function CursorFlag({
  name,
  color,
  className = '',
}: {
  name: string;
  color: string;
  className?: string;
}): JSX.Element {
  return (
    <div className={`pointer-events-none absolute select-none ${className}`}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M3 3 L19 10 L11 12 L9 19 Z" fill={color} />
      </svg>
      <span
        className="ml-4 -mt-2 inline-block rounded-md px-2 py-0.5 text-[11px] font-medium text-white shadow-float"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </div>
  );
}
