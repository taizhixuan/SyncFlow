import type { ReactNode } from 'react';
import { PRESENCE_PALETTE } from '@syncflow/shared';
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
    <main className="grid min-h-[100dvh] bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Brand />
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-ink-400">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-sm text-ink-400">{footer}</div>}
        </div>
      </div>

      {/* Continuity with the landing: a quiet board with collaborators at work. */}
      <aside className="relative hidden overflow-hidden border-l border-line bg-chrome bg-dot-grid bg-dots lg:block">
        <div className="absolute left-[22%] top-[26%] h-28 w-36 -rotate-2 rounded p-3 text-sm font-medium leading-snug text-[#16161A] shadow-float [background:#F2DC84]">
          Ship v2 before Friday
        </div>
        <div className="absolute left-[48%] top-[30%] h-28 w-36 rotate-1 rounded p-3 text-sm font-medium leading-snug text-[#16161A] shadow-float outline outline-[1.5px] outline-offset-2 outline-brand [background:#C4B5FD]">
          Pair on empty states
        </div>
        <div className="absolute left-[30%] top-[56%] grid h-14 w-40 place-items-center rounded-lg bg-accent text-sm font-semibold text-on-accent">
          Launch
        </div>
        <CursorFlag name="Maya" color={PRESENCE_PALETTE[1] ?? '#FF5A5F'} className="left-[62%] top-[46%]" />
        <CursorFlag name="Leo" color={PRESENCE_PALETTE[3] ?? '#12B5A5'} className="left-[20%] top-[66%]" />
        <p className="absolute bottom-8 left-8 right-8 font-mono text-xs text-ink-400">
          Real-time · conflict-free · works offline
        </p>
      </aside>
    </main>
  );
}
