import { getAccessToken } from "./tokenStore";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (rest.body != null && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}${path}`, { ...rest, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? String(res.status)), { status: res.status });
  }

  return res.json() as Promise<T>;
}

type AuthUser = { id: string; email: string; fullName: string | null; role: string };
type LoginResponse = { access_token: string; refresh_token: string; user: AuthUser };
type TokenResponse = { access_token: string; refresh_token: string };

export const api = {
  ping: () => apiFetch<{ ok: boolean }>("/healthz", { skipAuth: true }),

  auth: {
    login: (email: string, password: string) =>
      apiFetch<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      }),

    register: (email: string, password: string, fullName?: string) =>
      apiFetch<LoginResponse>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, fullName }),
        skipAuth: true,
      }),

    refresh: (refreshToken: string) =>
      apiFetch<TokenResponse>("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
        skipAuth: true,
      }),

    logout: (refreshToken: string) =>
      apiFetch<{ ok: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),

    me: () => apiFetch<AuthUser & { createdAt: string }>("/api/v1/auth/me"),
  },

  wa: {
    createSession: (displayName?: string) =>
      apiFetch<{ id: string; status: string }>("/api/v1/wa/sessions", {
        method: "POST",
        body: JSON.stringify({ display_name: displayName }),
      }),

    listSessions: () =>
      apiFetch<Array<{
        id: string;
        displayName: string | null;
        phoneNumber: string | null;
        status: string;
        lastSeenAt: string | null;
        createdAt: string;
      }>>("/api/v1/wa/sessions"),

    getSession: (id: string) =>
      apiFetch<{ id: string; displayName: string | null; phoneNumber: string | null; jid: string | null; status: string; createdAt: string }>
        (`/api/v1/wa/sessions/${id}`),

    deleteSession: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/wa/sessions/${id}`, { method: "DELETE" }),
  },
};
