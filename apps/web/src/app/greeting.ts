/** An account younger than this is still being welcomed for the first time. */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/** The dashboard heading: a just-created account isn't welcomed "back". */
export function dashboardGreeting(
  user: { displayName: string; createdAt: string },
  now: number = Date.now(),
): string {
  const created = Date.parse(user.createdAt);
  const isNew = Number.isFinite(created) && now - created < NEW_ACCOUNT_MS;
  return isNew ? `Welcome, ${user.displayName}.` : `Welcome back, ${user.displayName}.`;
}
