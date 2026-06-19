import { ApiClient } from './api-client';

const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';

/** Shared API client singleton. */
export const api = new ApiClient(baseUrl);
