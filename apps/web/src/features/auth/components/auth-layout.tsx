import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { CursorFlag } from '@/components/cursor-flag';

interface Props {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: Props): JSX.Element {
  return (
    <main className="grid min-h-screen bg-paper text-ink lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Brand />
          <h1 className="mt-8 font-display text-3xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-600">{footer}</div>}
        </div>
      </div>

      {/* Continuity with the landing: a calm dot-grid with drifting cursor flags. */}
      <aside className="relative hidden overflow-hidden border-l border-line bg-paper bg-dot-grid bg-dots lg:block">
        <div className="absolute left-[28%] top-[34%] rounded-md border border-line bg-warn/90 px-4 py-3 text-sm font-medium text-ink shadow-float">
          ship v2 🚀
        </div>
        <CursorFlag name="Maya" color="#3B5BFF" className="left-[52%] top-[42%]" />
        <CursorFlag name="Leo" color="#FF5A5F" className="left-[36%] top-[62%]" />
      </aside>
    </main>
  );
}
