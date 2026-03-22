// Base URL for API – resolved from env at build time; falls back to /api (proxied by nginx in Docker)
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export const getToken = (): string | null => localStorage.getItem('checkers_token');
export const setToken = (t: string): void => { localStorage.setItem('checkers_token', t); };
export const clearToken = (): void => { localStorage.removeItem('checkers_token'); };

export async function apiFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return data as T;
}
