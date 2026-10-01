import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import { Grid2x2, Map as MapIcon, Users, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { usePresence } from '@/features/presence/use-presence';
import type { CanvasStore } from '../engine/canvas-store';
import { SaveStatus } from './save-status';
import { ZoomBar } from './zoom-bar';

/**
 * The editor's bottom strip: save state and who is here on the left, view
 * toggles and zoom on the right. Monospace and quiet on purpose — it is read at
 * a glance, never the focus.
 */
export function CanvasStatusBar({
  store,
  stageSize,
  awareness,
  connection,
  isLocal,
  minimapOpen,
  onToggleMinimap,
}: {
  store: CanvasStore;
  stageSize: { width: number; height: number };
  awareness?: Awareness;
  connection?: 'offline' | 'connecting' | 'live';
  isLocal?: boolean;
  minimapOpen: boolean;
  onToggleMinimap: () => void;
}): JSX.Element {
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  return (
    <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-chrome px-2 font-mono text-[11px] text-ink-400 sm:px-3">
      <SaveStatus store={store} connection={connection} isLocal={isLocal} />
      {awareness && !isLocal && <OnlineCount awareness={awareness} />}
      <span className="flex-1" />
      <StatusToggle
        Icon={Grid2x2}
        label="Grid"
        active={gridEnabled}
        onClick={() => store.getState().toggleGrid()}
      />
      <StatusToggle Icon={MapIcon} label="Map" active={minimapOpen} onClick={onToggleMinimap} />
      <span aria-hidden="true" className="h-4 w-px bg-line" />
      <ZoomBar store={store} size={stageSize} />
    </footer>
  );
}

function OnlineCount({ awareness }: { awareness: Awareness }): JSX.Element {
  const remotes = usePresence(awareness);
  const { user } = useAuth();
  const ids = new Set(remotes.map((r) => r.user.id));
  if (user) ids.add(user.id);
  const n = Math.max(ids.size, 1);
  return (
    <span className="hidden items-center gap-1.5 sm:flex" title="People on this board right now">
      <Users size={12} aria-hidden="true" />
      {n} online
    </span>
  );
}

function StatusToggle({
  Icon,
  label,
  active,
  onClick,
}: {
  Icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={`${active ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
      className={`flex h-6 items-center gap-1.5 rounded px-1.5 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active ? 'text-brand' : 'text-ink-400 hover:text-ink'
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="hidden lg:inline">{label.toLowerCase()}</span>
    </button>
  );
}
