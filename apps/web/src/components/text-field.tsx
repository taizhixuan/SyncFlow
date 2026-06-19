import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, name, ...props }: Props): JSX.Element {
  const inputId = id ?? name;
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink-600">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        aria-invalid={error ? true : undefined}
        className="mt-1 w-full rounded-md border border-line bg-raised px-3 py-2 text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-brand"
        {...props}
      />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
