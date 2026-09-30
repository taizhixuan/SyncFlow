import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import type Konva from 'konva';
import {
  ChevronLeft,
  Grid2x2,
  Sun,
  Moon,
  MessageSquare,
  Vote,
  Timer,
  LayoutTemplate,
  Library,
  Presentation,
  Map as MapIcon,
  History,
  Share2,
  DoorOpen,
  MoreHorizontal,
  RefreshCw,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { PresenceAvatars } from '@/features/presence/presence-avatars';
import type { CanvasStore } from '../engine/canvas-store';
import { ExportMenu } from './export-menu';
import { SaveStatus } from './save-status';

interface BarAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  title?: string;
}

export function CanvasTopBar({
  store,
  title,
  onRenameTitle,
  badge,
  connection,
  awareness,
  onToggleHistory,
  historyOpen,
  onToggleComments,
  commentsOpen,
  onToggleTimer,
  timerOpen,
  onToggleTemplates,
  templatesOpen,
  onToggleLibrary,
  libraryOpen,
  onStartPresentation,
  presenting,
  frameCount,
  getStage,
  onToggleMinimap,
  minimapOpen,
  onToggleSharing,
  sharingOpen,
  onLeaveBoard,
  leaveOpen,
}: {
  store: CanvasStore;
  title: string;
  /** When provided, the title is click-to-rename (omitted for the local board). */
  onRenameTitle?: (next: string) => void;
  badge?: string;
  connection?: 'offline' | 'connecting' | 'live';
  awareness?: Awareness;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
  onToggleComments?: () => void;
  commentsOpen?: boolean;
  onToggleTimer?: () => void;
  timerOpen?: boolean;
  onToggleTemplates?: () => void;
  templatesOpen?: boolean;
  onToggleLibrary?: () => void;
  libraryOpen?: boolean;
  onStartPresentation?: () => void;
  presenting?: boolean;
  frameCount?: number;
  getStage?: () => Konva.Stage | null;
  onToggleMinimap?: () => void;
  minimapOpen?: boolean;
  onToggleSharing?: () => void;
  sharingOpen?: boolean;
  /** Offered to editors and viewers; the owner must transfer ownership first. */
  onLeaveBoard?: () => void;
  leaveOpen?: boolean;
}): JSX.Element {
  const theme = useStore(store, (s) => s.theme);
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  const votingMode = useStore(store, (s) => s.votingMode);
  const readOnly = useStore(store, (s) => s.readOnly);
  const s = store.getState();

  // Secondary actions: shown inline on md+, tucked into a "More" menu on mobile.
  const actions: BarAction[] = [
    { key: 'grid', label: 'Grid', Icon: Grid2x2, onClick: () => s.toggleGrid(), active: gridEnabled },
  ];
  // Votes are doc writes, which viewers can't make.
  if (!readOnly)
    actions.push({
      key: 'vote',
      label: 'Vote',
      Icon: Vote,
      onClick: () => s.toggleVotingMode(),
      active: votingMode,
      title: votingMode ? 'Exit voting mode' : 'Enter voting mode (click elements to vote)',
    });
  if (onToggleComments)
    actions.push({ key: 'comments', label: 'Comments', Icon: MessageSquare, onClick: onToggleComments, active: commentsOpen });
  if (onToggleTimer)
    actions.push({ key: 'timer', label: 'Timer', Icon: Timer, onClick: onToggleTimer, active: timerOpen });
  if (onToggleTemplates)
    actions.push({ key: 'templates', label: 'Templates', Icon: LayoutTemplate, onClick: onToggleTemplates, active: templatesOpen });
  if (onToggleLibrary)
    actions.push({ key: 'library', label: 'Library', Icon: Library, onClick: onToggleLibrary, active: libraryOpen });
  if (onStartPresentation && !presenting)
    actions.push({
      key: 'present',
      label: 'Present',
      Icon: Presentation,
      onClick: onStartPresentation,
      title: frameCount === 0 ? 'Present the whole board' : 'Start presentation',
    });
  if (onToggleMinimap)
    actions.push({ key: 'map', label: 'Map', Icon: MapIcon, onClick: onToggleMinimap, active: minimapOpen });
  if (onToggleHistory)
    actions.push({ key: 'history', label: 'History', Icon: History, onClick: onToggleHistory, active: historyOpen });
  if (onToggleSharing)
    actions.push({ key: 'share', label: 'Share', Icon: Share2, onClick: onToggleSharing, active: sharingOpen });
  if (onLeaveBoard)
    actions.push({ key: 'leave', label: 'Leave board', Icon: DoorOpen, onClick: onLeaveBoard, active: leaveOpen });

  return (
    <header className="flex items-center justify-between gap-2 border-b border-line bg-raised px-2 py-1 dark:border-line-dark dark:bg-raised-dark sm:px-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          to="/app"
          aria-label="Back to boards"
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-600 hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
        >
          <ChevronLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">Boards</span>
        </Link>
        {onRenameTitle ? (
          <EditableTitle title={title} onRename={onRenameTitle} />
        ) : (
          <span className="truncate font-display text-sm font-semibold text-ink dark:text-ink-dark">{title}</span>
        )}
        {badge && (
          // Always visible: on a phone "view only" explains why nothing is editable.
          <span
            role="status"
            aria-label={`Board mode: ${badge}`}
            className="shrink-0 rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-400 dark:bg-sunken-dark"
          >
            {badge}
          </span>
        )}
        <div className="hidden sm:block">
          <SaveStatus store={store} connection={connection} isLocal={badge === 'local'} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {awareness && (
          <div className="hidden sm:block">
            <PresenceAvatars awareness={awareness} />
          </div>
        )}
        {connection && badge !== 'local' && <ConnectionStatus connection={connection} />}

        {/* Theme toggle stays visible at every width. */}
        <TopBarButton
          Icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Light' : 'Dark'}
          onClick={() => s.toggleTheme()}
        />

        {/* Inline secondary actions (desktop / tablet). */}
        <div className="hidden items-center gap-0.5 md:flex">
          {actions.map((a) => (
            <TopBarButton key={a.key} Icon={a.Icon} label={a.label} onClick={a.onClick} active={a.active} title={a.title} />
          ))}
        </div>

        {/* Collapsed "More" menu (mobile). */}
        <MoreMenu actions={actions} />

        {getStage && <ExportMenu store={store} getStage={getStage} />}
      </div>
    </header>
  );
}

const CONNECTION_META: Record<
  'offline' | 'connecting' | 'live',
  { label: string; className: string }
> = {
  live: {
    label: 'Live',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  connecting: {
    label: 'Reconnecting…',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  offline: {
    label: 'Offline',
    className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  },
};

/**
 * Realtime connection indicator. Visible at every width: a compact icon/dot on
 * mobile, icon plus text from `sm` up. The accessible name carries the state
 * either way, so a reconnect or an offline drop is never hidden.
 */
function ConnectionStatus({ connection }: { connection: 'offline' | 'connecting' | 'live' }): JSX.Element {
  const meta = CONNECTION_META[connection];
  return (
    <span
      role="status"
      aria-label={`Connection: ${meta.label}`}
      title={meta.label}
      className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[11px] leading-none sm:px-2 sm:py-0.5 ${meta.className}`}
    >
      {connection === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {connection === 'connecting' && (
        <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {connection === 'offline' && <WifiOff size={12} aria-hidden="true" />}
      <span className="hidden sm:inline" aria-hidden="true">
        {meta.label}
      </span>
    </span>
  );
}

/** Mobile-only overflow menu holding the secondary top-bar actions. */
function MoreMenu({ actions }: { actions: BarAction[] }): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative md:hidden">
      <TopBarButton Icon={MoreHorizontal} label="More" onClick={() => setOpen((o) => !o)} active={open} />
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-line bg-raised p-1 shadow-float dark:border-line-dark dark:bg-raised-dark">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => {
                a.onClick();
                setOpen(false);
              }}
              aria-pressed={a.active}
              title={a.title ?? a.label}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-sunken dark:hover:bg-sunken-dark ${
                a.active ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'
              }`}
            >
              <a.Icon size={16} aria-hidden="true" />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Click-to-rename board title shown in the top bar. */
function EditableTitle({
  title,
  onRename,
}: {
  title: string;
  onRename: (next: string) => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  useEffect(() => {
    setValue(title);
  }, [title]);

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          const next = value.trim();
          if (next && next !== title) onRename(next);
          else setValue(title);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(title);
            setEditing(false);
          }
        }}
        className="w-36 rounded border border-line bg-paper px-1.5 py-0.5 font-display text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark sm:w-44"
      />
    );
  }
  return (
    <button
      onClick={() => {
        // Start from the server's title, not a draft left by a failed rename.
        setValue(title);
        setEditing(true);
      }}
      title="Rename board"
      className="truncate rounded px-1 font-display text-sm font-semibold text-ink hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
    >
      {title}
    </button>
  );
}

/** A top-bar control: an icon over a small label. */
function TopBarButton({
  Icon,
  label,
  onClick,
  active = false,
  title,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      className={`flex w-11 flex-col items-center gap-0.5 rounded-md px-1 py-1 leading-none hover:bg-sunken dark:hover:bg-sunken-dark sm:w-12 ${
        active ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="text-[9px] font-medium tracking-wide">{label}</span>
    </button>
  );
}
