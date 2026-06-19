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

/**
 * Thin REST client. Holds the access token in memory, sends the refresh cookie
 * (credentials: include), and transparently refreshes once on a 401 — then
 * retries the original request. The refresh endpoints themselves never recurse.
 */
export class ApiClient {
  private accessToken: string | null = null;
  private onAccessToken?: (token: string | null) => void;

  constructor(
    private readonly baseUrl: string,
    // Wrap global fetch so it keeps its `this` binding (calling it as a method
    // of this class would otherwise trigger "Illegal invocation" in browsers).
    private readonly fetchImpl: typeof fetch = (...args: Parameters<typeof fetch>) => fetch(...args),
  ) {}

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** Notified whenever the token changes (e.g. after a transparent refresh). */
  onTokenChange(listener: (token: string | null) => void): void {
    this.onAccessToken = listener;
  }

  /** Remove the token-change listener (call on unmount to avoid stale updates). */
  removeTokenChangeListener(): void {
    this.onAccessToken = undefined;
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

  private async tryRefresh(): Promise<boolean> {
    const response = await this.fetchImpl(`${this.baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      this.setToken(null);
      return false;
    }
    const data = (await response.json()) as { accessToken: string };
    this.setToken(data.accessToken);
    return true;
  }

  private setToken(token: string | null): void {
    this.accessToken = token;
    this.onAccessToken?.(token);
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
