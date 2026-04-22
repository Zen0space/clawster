import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// ── Auth user ──────────────────────────────────────────────────────────────
export type AuthUser = { id: string; email: string; fullName: string | null; role: string };
export const userAtom = atom<AuthUser | null>(null);
export const authLoadingAtom = atom<boolean>(true);

// ── Raw string storage — no JSON encoding so api.ts can read tokens directly
const rawTokenStorage = {
  getItem: (key: string, initialValue: string | null): string | null =>
    localStorage.getItem(key) ?? initialValue,
  setItem: (key: string, value: string | null) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
  removeItem: (key: string) => localStorage.removeItem(key),
};

// ── Tokens (persisted to localStorage — same keys api.ts reads) ────────────
export const accessTokenAtom = atomWithStorage<string | null>("access_token", null, rawTokenStorage);
export const refreshTokenAtom = atomWithStorage<string | null>("refresh_token", null, rawTokenStorage);

// ── Navigation ─────────────────────────────────────────────────────────────
export type AppPage = "dashboard" | "sessions" | "contacts" | "campaigns" | "inbox" | "settings" | "changelog";
export type AuthPage = "login" | "signup";
export const appPageAtom = atom<AppPage>("dashboard");
export const authPageAtom = atom<AuthPage>("login");

// ── Inbox ──────────────────────────────────────────────────────────────────
export const inboxUnreadAtom = atom<number>(0);
export const selectedConversationIdAtom = atom<string | null>(null);
