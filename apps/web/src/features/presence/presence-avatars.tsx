import type { Awareness } from 'y-protocols/awareness';
import type { PresenceUser } from '@syncflow/shared';
import { useAuth } from '@/features/auth/auth-context';
import { usePresence } from './use-presence';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** A horizontal stack of colored initials for everyone online (local user included). */
export function PresenceAvatars({ awareness }: { awareness: Awareness }): JSX.Element | null {
  const remotes = usePresence(awareness);
  const { user } = useAuth();

  const byId = new Map<string, PresenceUser>();
  if (user) byId.set(user.id, { id: user.id, name: user.displayName, color: user.color });
  for (const { user: u } of remotes) byId.set(u.id, u);

  const users = Array.from(byId.values());
  if (users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2" aria-label="People online">
      {users.map((u) => (
        <span
          key={u.id}
          title={u.id === user?.id ? `${u.name} (you)` : u.name}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border-2 border-raised text-[10px] font-semibold text-white dark:border-raised-dark"
          style={{ backgroundColor: u.color }}
        >
          {initials(u.name)}
        </span>
      ))}
    </div>
  );
}
