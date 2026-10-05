import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import type Konva from 'konva';
import {
  Sun,
  Moon,
  MessageSquare,
  Vote,
  Timer,
  LayoutTemplate,
  Library,
  Presentation,
  History,
  Share2,
  DoorOpen,
  MoreHorizontal,
  PanelRight,
  RefreshCw,
  Search,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { LogoMark } from '@/components/logo-mark';
import { PresenceAvatars } from '@/features/presence/presence-avatars';
import type { CanvasStore } from '../engine/canvas-store';
import { ExportMenu } from './export-menu';
import { isComposing } from './ime';

interface BarAction {
  key: string;
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  title?: string;
  /**
   * `primary` actions sit inline from md up; `secondary` ones only from xl up.
   * Anything not inline at the current width lives in the "More" menu.
   */
  tier: 'primary' | 'secondary';
}

export function CanvasTopBar({
  store,
  title,
  onRenameTitle,
  badge,
  connection,
  awareness,
  onOpenCommands,
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
  onToggleSharing,
  sharingOpen,
  onLeaveBoard,
  leaveOpen,
  onToggleInspector,
  inspectorOpen,
}: {
  store: CanvasStore;
  title: string;
  /** When provided, the title is click-to-rename (omitted for the local board). */
  onRenameTitle?: (next: string) => void;
  badge?: string;
  connection?: 'offline' | 'connecting' | 'live';
  awareness?: Awareness;
  /** Opens the ⌘K command palette. */
  onOpenCommands?: () => void;
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
  onToggleSharing?: () => void;
  sharingOpen?: boolean;
  /** Offered to editors and viewers; the owner must transfer ownership first. */
  onLeaveBoard?: () => void;
  leaveOpen?: boolean;
  /** Shows or hides the right-hand inspector (lg and up, where it exists). */
  onToggleInspector?: () => void;
  inspectorOpen?: boolean;
}): JSX.Element {
  const theme = useStore(store, (s) => s.theme);
  const votingMode = useStore(store, (s) => s.votingMode);
  const readOnly = useStore(store, (s) => s.readOnly);
  const s = store.getState();

  const actions: BarAction[] = [];
  if (onToggleComments)
    actions.push({ key: 'comments', label: 'Comments', Icon: MessageSquare, onClick: onToggleComments, active: commentsOpen, tier: 'primary' });
  if (onToggleHistory)
    actions.push({ key: 'history', label: 'History', Icon: History, onClick: onToggleHistory, active: historyOpen, tier: 'primary' });
  // Votes are doc writes, which viewers can't make.
  if (!readOnly)
    actions.push({
      key: 'vote',
      label: 'Vote',
      Icon: Vote,
      onClick: () => s.toggleVotingMode(),
      active: votingMode,
      title: votingMode ? 'Exit voting mode' : 'Enter voting mode (click elements to vote)',
      tier: 'secondary',
    });
  if (onToggleTimer)
    actions.push({ key: 'timer', label: 'Timer', Icon: Timer, onClick: onToggleTimer, active: timerOpen, tier: 'secondary' });
  if (onToggleTemplates)
    actions.push({ key: 'templates', label: 'Templates', Icon: LayoutTemplate, onClick: onToggleTemplates, active: templatesOpen, tier: 'secondary' });
  if (onToggleLibrary)
    actions.push({ key: 'library', label: 'Library', Icon: Library, onClick: onToggleLibrary, active: libraryOpen, tier: 'secondary' });
  if (onLeaveBoard)
    actions.push({ key: 'leave', label: 'Leave board', Icon: DoorOpen, onClick: onLeaveBoard, active: leaveOpen, tier: 'secondary' });

  const presentTitle = frameCount === 0 ? 'Present the whole board' : 'Start presentation';
  const canPresent = !!onStartPresentation && !presenting;

  return (
    <header className="flex h-[calc(52px+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-line bg-chrome pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:pl-3 sm:pr-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 md:flex-none md:basis-[32%]">
        <Link
          to="/app"
          aria-label="Back to boards"
          title="Back to boards"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md md:h-auto md:w-auto md:p-0.5 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <LogoMark size={28} />
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link to="/app" className="hidden shrink-0 text-ink-400 hover:text-ink sm:inline">
            Boards
          </Link>
          <span aria-hidden="true" className="hidden text-line-strong sm:inline">
            /
          </span>
          {onRenameTitle ? (
            <EditableTitle title={title} onRename={onRenameTitle} />
          ) : (
            <span className="truncate font-semibold text-ink">{title}</span>
          )}
        </nav>
        {badge && (
          // Always visible: on a phone "view only" explains why nothing is editable.
          <span
            role="status"
            aria-label={`Board mode: ${badge}`}
            className="shrink-0 rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-400"
          >
            {badge}
          </span>
        )}
      </div>

      <div className="hidden flex-1 justify-center md:flex">
        {onOpenCommands && (
          <button
            onClick={onOpenCommands}
            aria-label="Open command palette"
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-line bg-sunken/60 px-2.5 text-[13px] text-ink-400 transition hover:border-line-strong hover:text-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Search size={14} aria-hidden="true" />
            <span className="flex-1 truncate text-left">Search or run a command</span>
            <kbd>⌘K</kbd>
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-1 md:basis-[32%]">
        {awareness && (
          <div className="mr-1 hidden sm:block">
            <PresenceAvatars awareness={awareness} />
          </div>
        )}
        {connection && badge !== 'local' && <ConnectionStatus connection={connection} />}

        {/* Theme toggle stays visible at every width. */}
        <TopBarButton
          Icon={theme === 'dark' ? Sun : Moon}
          label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          onClick={() => s.toggleTheme()}
        />

        {actions.map((a) => (
          <TopBarButton
            key={a.key}
            Icon={a.Icon}
            label={a.label}
            onClick={a.onClick}
            active={a.active}
            title={a.title}
            className={a.tier === 'primary' ? 'hidden md:grid' : 'hidden xl:grid'}
          />
        ))}

        <MoreMenu
          actions={[
            // The palette's ⌘K trigger is hidden on phones; this is its way in there.
            ...(onOpenCommands
              ? [
                  {
                    key: 'commands',
                    label: 'Search commands',
                    Icon: Search,
                    onClick: onOpenCommands,
                    tier: 'primary' as const,
                    menuClass: 'md:hidden',
                  },
                ]
              : []),
            ...actions.map((a) => ({ ...a, menuClass: a.tier === 'primary' ? 'md:hidden' : '' })),
            ...(canPresent
              ? [
                  {
                    key: 'present',
                    label: 'Present',
                    Icon: Presentation,
                    onClick: () => onStartPresentation?.(),
                    title: presentTitle,
                    tier: 'secondary' as const,
                    menuClass: 'lg:hidden',
                  },
                ]
              : []),
          ]}
        />

        {getStage && <ExportMenu store={store} getStage={getStage} />}
        {onToggleInspector && (
          <TopBarButton
            Icon={PanelRight}
            label={inspectorOpen ? 'Hide inspector' : 'Show inspector'}
            onClick={onToggleInspector}
            active={inspectorOpen}
            className="hidden lg:grid"
          />
        )}

        {canPresent && (
          <button
            onClick={onStartPresentation}
            title={presentTitle}
            className="ml-1 hidden h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[13px] font-medium text-ink hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand lg:flex"
          >
            <Presentation size={14} aria-hidden="true" />
            Present
          </button>
        )}
        {onToggleSharing && (
          <button
            onClick={onToggleSharing}
            aria-label="Share"
            aria-pressed={sharingOpen}
            className="ml-1 flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 md:h-8 md:min-w-0 text-[13px] font-semibold text-on-accent hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome sm:px-3"
          >
            <Share2 size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}
      </div>
    </header>
  );
}

const CONNECTION_META: Record<
  'offline' | 'connecting' | 'live',
  { label: string; className: string }
> = {
  live: { label: 'Live', className: 'text-success' },
  connecting: { label: 'Reconnecting…', className: 'text-warn' },
  offline: { label: 'Offline', className: 'text-danger' },
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
      className={`flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-line px-2 font-mono text-[11px] leading-none ${meta.className}`}
    >
      {connection === 'live' && (
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        </span>
      )}
      {connection === 'connecting' && (
        <RefreshCw size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {connection === 'offline' && <WifiOff size={12} aria-hidden="true" />}
      <span className="hidden sm:inline" aria-hidden="true">
        {meta.label.toLowerCase()}
      </span>
    </span>
  );
}

/** Overflow menu for the actions that don't fit inline at the current width. */
function MoreMenu({ actions }: { actions: (BarAction & { menuClass: string })[] }): JSX.Element | null {
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

  if (actions.length === 0) return null;
  return (
    <div ref={ref} className="relative xl:hidden">
      <TopBarButton
        Icon={MoreHorizontal}
        label="More"
        onClick={() => setOpen((o) => !o)}
        active={open}
        expanded={open}
      />
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-line bg-raised p-1 shadow-float">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => {
                a.onClick();
                setOpen(false);
              }}
              aria-pressed={a.active}
              title={a.title ?? a.label}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-sm hover:bg-sunken md:py-2 ${a.menuClass} ${
                a.active ? 'text-brand' : 'text-ink-600'
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
        aria-label="Board title"
        onBlur={() => {
          setEditing(false);
          const next = value.trim();
          if (next && next !== title) onRename(next);
          else setValue(title);
        }}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(title);
            setEditing(false);
          }
        }}
        className="h-7 w-40 rounded-md border border-line bg-paper px-2 text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:w-52"
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
      className="truncate rounded-md px-1.5 py-0.5 font-semibold text-ink hover:bg-sunken"
    >
      {title}
    </button>
  );
}

/** An icon-only top-bar control; the label is its accessible name and tooltip. */
function TopBarButton({
  Icon,
  label,
  onClick,
  active = false,
  title,
  className = 'grid',
  expanded,
}: {
  Icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  title?: string;
  className?: string;
  /** Set for a button that shows a popover: announced as expanded, not pressed. */
  expanded?: boolean;
}): JSX.Element {
  const state =
    expanded === undefined
      ? { 'aria-pressed': active }
      : { 'aria-expanded': expanded };
  return (
    <button
      onClick={onClick}
      aria-label={label}
      {...state}
      title={title ?? label}
      className={`${className} h-10 w-10 shrink-0 place-items-center rounded-md md:h-8 md:w-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        active ? 'bg-accent/15 text-brand' : 'text-ink-400 hover:bg-sunken hover:text-ink'
      }`}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
  );
}
