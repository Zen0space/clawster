import { getAccessToken } from "./tokenStore";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

async function apiFetch<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...rest } = options;
  const headers = new Headers(rest.headers);
  if (rest.body != null && !(rest.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

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

export type ContactList = { id: string; name: string; rowCount: number; createdAt: string };
export type Contact = { id: string; phoneE164: string; name: string | null; customFields: Record<string, string>; isValid: boolean };
export type ImportResult = { list_id: string; total: number; imported: number; invalid: { row: number; reason: string }[] };

export type CampaignProgress = { sent: number; failed: number; remaining: number; total: number };
export type Campaign = {
  id: string; name: string; status: string;
  waSessionId: string; contactListId: string;
  messageTemplate: string;
  minDelaySec: number; maxDelaySec: number; dailyCap: number;
  quietStart: number | null; quietEnd: number | null; typingSim: boolean;
  startedAt: string | null; completedAt: string | null; createdAt: string;
  progress: CampaignProgress;
};
export type CampaignMessage = {
  id: string; status: string; renderedBody: string;
  waMessageId: string | null; error: string | null;
  attempts: number; sentAt: string | null; updatedAt: string;
  contact: { phoneE164: string; name: string | null };
};
export type CreateCampaignInput = {
  name: string; waSessionId: string; contactListId: string;
  messageTemplate: string;
  mediaAssetId?: string;
  minDelaySec?: number; maxDelaySec?: number; dailyCap?: number;
  quietStart?: number | null; quietEnd?: number | null; typingSim?: boolean;
};

export const api = {
  ping: () => apiFetch<{ ok: boolean }>("/healthz", { skipAuth: true }),

  auth: {
    login: (email: string, password: string) =>
      apiFetch<LoginResponse>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        skipAuth: true,
      }),

    register: (email: string, password: string, licenseKey: string, fullName?: string) =>
      apiFetch<LoginResponse>("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, licenseKey, fullName }),
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

  contacts: {
    import: (file: File, name: string, defaultRegion = "MY") => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name);
      fd.append("defaultRegion", defaultRegion);
      return apiFetch<ImportResult>("/api/v1/contacts/import", { method: "POST", body: fd });
    },

    listLists: (page = 1, limit = 20) =>
      apiFetch<{ items: ContactList[]; total: number; page: number; limit: number }>(
        `/api/v1/contact-lists?page=${page}&limit=${limit}`
      ),

    getList: (id: string) =>
      apiFetch<ContactList & { sourceFile: string | null }>(`/api/v1/contact-lists/${id}`),

    createList: (name: string) =>
      apiFetch<ContactList>("/api/v1/contact-lists", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),

    addContact: (listId: string, phone: string, name?: string) =>
      apiFetch<{ ok: boolean; phoneE164: string }>(`/api/v1/contact-lists/${listId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ phone, name }),
      }),

    deleteList: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/contact-lists/${id}`, { method: "DELETE" }),

    listContacts: (listId: string, page = 1, limit = 50) =>
      apiFetch<{ items: Contact[]; total: number; page: number; limit: number }>(
        `/api/v1/contact-lists/${listId}/contacts?page=${page}&limit=${limit}`
      ),
  },

  media: {
    upload: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiFetch<{ id: string; mimeType: string; byteSize: number; sha256: string }>(
        "/api/v1/media", { method: "POST", body: fd }
      );
    },
    get: (id: string) =>
      apiFetch<{ id: string; mimeType: string; byteSize: number; sha256: string; createdAt: string }>(
        `/api/v1/media/${id}`
      ),
  },

  campaigns: {
    create: (data: CreateCampaignInput) =>
      apiFetch<Campaign>("/api/v1/campaigns", { method: "POST", body: JSON.stringify(data) }),

    list: (page = 1, limit = 20) =>
      apiFetch<{ items: Campaign[]; total: number }>(`/api/v1/campaigns?page=${page}&limit=${limit}`),

    get: (id: string) =>
      apiFetch<Campaign>(`/api/v1/campaigns/${id}`),

    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/campaigns/${id}`, { method: "DELETE" }),

    start: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/campaigns/${id}/start`, { method: "POST" }),

    pause: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/campaigns/${id}/pause`, { method: "POST" }),

    resume: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/campaigns/${id}/resume`, { method: "POST" }),

    cancel: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/campaigns/${id}/cancel`, { method: "POST" }),

    messages: (id: string, page = 1, limit = 50) =>
      apiFetch<{ items: CampaignMessage[]; total: number; page: number; limit: number }>(
        `/api/v1/campaigns/${id}/messages?page=${page}&limit=${limit}`
      ),
  },
};
