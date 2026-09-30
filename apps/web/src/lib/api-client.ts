/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RefreshPayload {
  accessToken: string;
  user: unknown;
  expiresIn?: number;
}

type TokenListener = (token: string | null) => void;

/** The slice of the Web Locks API the client needs (injectable for tests). */
export interface RefreshLocks {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** The slice of BroadcastChannel the client needs (injectable for tests). */
export interface RefreshChannel {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface CrossTabOptions {
  /** Serialises refreshes across tabs. `null` disables; omitted uses `navigator.locks`. */
  locks?: RefreshLocks | null;
  /** Shares a fresh session with other tabs. `null` disables; omitted uses BroadcastChannel. */
  channel?: RefreshChannel | null;
}

const REFRESH_LOCK = 'sf-refresh';
const AUTH_CHANNEL = 'sf-auth';

interface RefreshedMessage {
  type: 'refreshed';
  payload: RefreshPayload;
}

function isRefreshedMessage(data: unknown): data is RefreshedMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as { type?: unknown; payload?: unknown };
  if (msg.type !== 'refreshed' || !msg.payload || typeof msg.payload !== 'object') return false;
  return typeof (msg.payload as { accessToken?: unknown }).accessToken === 'string';
}

function defaultLocks(): RefreshLocks | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator) || !navigator.locks) return null;
  const locks = navigator.locks;
  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> =>
      locks.request(name, callback) as Promise<T>,
  };
}

function defaultChannel(): RefreshChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  const channel = new BroadcastChannel(AUTH_CHANNEL);
  // Node's implementation (tests) would otherwise keep the process alive.
  (channel as unknown as { unref?: () => void }).unref?.();
  return channel;
}

/**
 * Thin REST client. Holds the access token in memory, sends the refresh cookie
 * (credentials: include), and transparently refreshes once on a 401 — then
 * retries the original request. The refresh endpoints themselves never recurse.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private readonly tokenListeners = new Set<TokenListener>();
  private refreshInFlight: Promise<RefreshPayload | null> | null = null;
  private readonly locks: RefreshLocks | null;
  private readonly channel: RefreshChannel | null;
  // Bumped whenever another tab announces a refresh, so a tab queued behind the
  // lock can tell the cookie already rotated and reuse that tab's result.
  private sharedSeq = 0;
  private sharedPayload: RefreshPayload | null = null;

  constructor(
    private readonly baseUrl: string,
    // Wrap global fetch so it keeps its `this` binding (calling it as a method
    // of this class would otherwise trigger "Illegal invocation" in browsers).
    private readonly fetchImpl: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args),
    crossTab: CrossTabOptions = {},
  ) {
    this.locks = crossTab.locks === undefined ? defaultLocks() : crossTab.locks;
    this.channel = crossTab.channel === undefined ? defaultChannel() : crossTab.channel;
    this.channel?.addEventListener('message', (event) => {
      if (!isRefreshedMessage(event.data)) return;
      this.sharedSeq += 1;
      this.sharedPayload = event.data.payload;
    });
  }

  setAccessToken(token: string | null): void {
    this.setToken(token);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Subscribe to token changes (login, transparent refresh, refresh failure,
   * logout). Returns an unsubscribe function.
   */
  onTokenChange(listener: TokenListener): () => void {
    this.tokenListeners.add(listener);
    return () => {
      this.tokenListeners.delete(listener);
    };
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  del<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: Method, path: string, body?: unknown, isRetry = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && !isRetry && this.canRefresh(path)) {
      const refreshed = await this.tryRefresh();
      if (refreshed) return this.request<T>(method, path, body, true);
    }

    return this.parse<T>(response);
  }

  private canRefresh(path: string): boolean {
    // Don't try to refresh on the auth endpoints themselves.
    return !path.startsWith('/auth/');
  }

  /**
   * Refresh the session, **deduplicated**: concurrent callers — a transparent
   * 401 retry, several parallel 401s, or React StrictMode double-mounting the
   * auth provider (two `restoreSession`s) — share ONE in-flight
   * `POST /auth/refresh`. Without this, two requests present the same rotating
   * refresh token; the server treats the second as token reuse and revokes the
   * whole token family, silently killing the session (no token → realtime sync
   * can't authenticate → presence/cursors die).
   *
   * Tabs share the cookie, so the same hazard exists between them: refreshes
   * are serialised with a Web Lock, and a tab that queued behind another tab's
   * refresh reuses the session that tab broadcast instead of presenting the
   * already-rotated cookie again.
   *
   * Resolves the payload, or null when the server rejects the refresh (the user
   * is anonymous). Rejects on network/5xx failures, which say nothing about the
   * session, so the current token is left alone.
   */
  refreshSession(): Promise<RefreshPayload | null> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private doRefresh(): Promise<RefreshPayload | null> {
    const locks = this.locks;
    if (!locks) return this.refreshOverNetwork();
    const seenSeq = this.sharedSeq;
    return locks.request(REFRESH_LOCK, async () => {
      const shared = this.sharedPayload;
      if (this.sharedSeq !== seenSeq && shared) {
        this.setToken(shared.accessToken);
        return shared;
      }
      return this.refreshOverNetwork();
    });
  }

  private async refreshOverNetwork(): Promise<RefreshPayload | null> {
    const response = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.status >= 500 || response.status === 429) {
      throw new ApiError(response.status, response.statusText || 'Session refresh failed');
    }
    if (!response.ok) {
      this.setToken(null);
      return null;
    }
    let data: RefreshPayload;
    try {
      data = (await response.json()) as RefreshPayload;
    } catch {
      throw new ApiError(response.status, 'Malformed session refresh response');
    }
    this.setToken(data.accessToken);
    try {
      const message: RefreshedMessage = { type: 'refreshed', payload: data };
      this.channel?.postMessage(message);
    } catch {
      // A tab that misses the broadcast only pays for one extra refresh.
    }
    return data;
  }

  private async tryRefresh(): Promise<boolean> {
    try {
      return (await this.refreshSession()) !== null;
    } catch {
      // Network/5xx during a transparent retry: surface the original 401.
      return false;
    }
  }

  private setToken(token: string | null): void {
    if (token === this.accessToken) return;
    this.accessToken = token;
    for (const listener of [...this.tokenListeners]) listener(token);
  }

  private async parse<T>(response: Response): Promise<T> {
    const text = await response.text();
    const data = text ? (JSON.parse(text) as unknown) : undefined;
    if (!response.ok) {
      const message = extractMessage(data) ?? response.statusText;
      throw new ApiError(response.status, message, data);
    }
    return data as T;
  }
}

function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === 'object' && 'message' in data) {
    const message = (data as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }
  return undefined;
}
