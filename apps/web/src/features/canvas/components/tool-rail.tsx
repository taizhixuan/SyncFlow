import { TOOLS, type ToolId } from '../lib/tools';

export function ToolRail({
  tool,
  onToolChange,
}: {
  tool: ToolId;
  onToolChange: (tool: ToolId) => void;
}): JSX.Element {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      className="flex flex-col gap-1 rounded-lg border border-line bg-raised p-1 shadow-raised"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          onClick={() => onToolChange(t.id)}
          aria-label={`${t.label} (${t.shortcut})`}
          aria-pressed={tool === t.id}
          title={`${t.label} (${t.shortcut})`}
          className={`grid h-9 w-9 place-items-center rounded-md text-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            tool === t.id ? 'bg-brand text-white' : 'text-ink-600 hover:bg-sunken'
          }`}
        >
          <span aria-hidden="true">{t.glyph}</span>
        </button>
      ))}
    </div>
  );
}
