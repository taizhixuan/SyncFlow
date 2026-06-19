import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from 'zustand';
import type { Awareness } from 'y-protocols/awareness';
import type Konva from 'konva';
import { PresenceAvatars } from '@/features/presence/presence-avatars';
import type { CanvasStore } from '../engine/canvas-store';
import { ExportMenu } from './export-menu';
import { SaveStatus } from './save-status';

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
}): JSX.Element {
  const theme = useStore(store, (s) => s.theme);
  const gridEnabled = useStore(store, (s) => s.gridEnabled);
  const votingMode = useStore(store, (s) => s.votingMode);
  const s = store.getState();
  return (
    <header className="flex items-center justify-between border-b border-line bg-raised px-3 py-1 dark:border-line-dark dark:bg-raised-dark">
      <div className="flex items-center gap-3">
        <Link
          to="/app"
          className="rounded-md px-2 py-0.5 text-xs text-ink-600 hover:bg-sunken dark:text-ink-dark"
        >
          ← Boards
        </Link>
        {onRenameTitle ? (
          <EditableTitle title={title} onRename={onRenameTitle} />
        ) : (
          <span className="font-display text-sm font-semibold text-ink dark:text-ink-dark">{title}</span>
        )}
        {badge && (
          <span className="rounded-full bg-sunken px-2 py-0.5 font-mono text-[11px] text-ink-400 dark:bg-sunken-dark">
            {badge}
          </span>
        )}
        <SaveStatus store={store} connection={connection} isLocal={badge === 'local'} />
      </div>
      <div className="flex items-center gap-0.5">
        {awareness && <PresenceAvatars awareness={awareness} />}
        {connection && connection !== 'offline' && (
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              connection === 'live'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
            role="status"
          >
            {connection === 'live' ? '● live' : '○ reconnecting…'}
          </span>
        )}
        <TopBarButton glyph="⊞" label="Grid" active={gridEnabled} onClick={() => s.toggleGrid()} />
        <TopBarButton
          glyph={theme === 'dark' ? '☀' : '☾'}
          label={theme === 'dark' ? 'Light' : 'Dark'}
          onClick={() => s.toggleTheme()}
        />
        {onToggleComments && (
          <TopBarButton glyph="💬" label="Comments" active={commentsOpen} onClick={onToggleComments} />
        )}
        <TopBarButton
          glyph="🗳"
          label="Vote"
          active={votingMode}
          onClick={() => s.toggleVotingMode()}
          title={votingMode ? 'Exit voting mode' : 'Enter voting mode (click elements to vote)'}
        />
        {onToggleTimer && (
          <TopBarButton glyph="⏱" label="Timer" active={timerOpen} onClick={onToggleTimer} />
        )}
        {onToggleTemplates && (
          <TopBarButton glyph="🗂" label="Templates" active={templatesOpen} onClick={onToggleTemplates} />
        )}
        {onToggleLibrary && (
          <TopBarButton glyph="⊟" label="Library" active={libraryOpen} onClick={onToggleLibrary} />
        )}
        {onStartPresentation && !presenting && (
          <TopBarButton
            glyph="▶"
            label="Present"
            onClick={onStartPresentation}
            title={frameCount === 0 ? 'Present the whole board' : 'Start presentation'}
          />
        )}
        {onToggleMinimap && (
          <TopBarButton glyph="⊡" label="Map" active={minimapOpen} onClick={onToggleMinimap} />
        )}
        {onToggleHistory && (
          <TopBarButton glyph="⟲" label="History" active={historyOpen} onClick={onToggleHistory} />
        )}
        {onToggleSharing && (
          <TopBarButton glyph="⇧" label="Share" active={sharingOpen} onClick={onToggleSharing} />
        )}
        {getStage && <ExportMenu store={store} getStage={getStage} />}
      </div>
    </header>
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
        className="w-44 rounded border border-line bg-paper px-1.5 py-0.5 font-display text-sm font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:border-line-dark dark:bg-paper-dark dark:text-ink-dark"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      title="Rename board"
      className="rounded px-1 font-display text-sm font-semibold text-ink hover:bg-sunken dark:text-ink-dark dark:hover:bg-sunken-dark"
    >
      {title}
    </button>
  );
}

/** A top-bar control: a large icon over a small label. */
function TopBarButton({
  glyph,
  label,
  onClick,
  active = false,
  title,
}: {
  glyph: string;
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
      className={`flex w-12 flex-col items-center gap-0.5 rounded-md px-1 py-0.5 leading-none hover:bg-sunken dark:hover:bg-sunken-dark ${
        active ? 'text-brand' : 'text-ink-600 dark:text-ink-dark'
      }`}
    >
      <span className="text-lg" aria-hidden="true">
        {glyph}
      </span>
      <span className="text-[9px] font-medium tracking-wide">{label}</span>
    </button>
  );
}
