import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export type AuthUser = { id: string; email: string; fullName: string | null; role: string };

export const userAtom = atom<AuthUser | null>(null);
export const authLoadingAtom = atom<boolean>(true);

const rawTokenStorage = {
  getItem: (key: string, initialValue: string | null): string | null =>
    localStorage.getItem(key) ?? initialValue,
  setItem: (key: string, value: string | null) => {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  },
  removeItem: (key: string) => localStorage.removeItem(key),
};

export const accessTokenAtom = atomWithStorage<string | null>("access_token", null, rawTokenStorage);
export const refreshTokenAtom = atomWithStorage<string | null>("refresh_token", null, rawTokenStorage);

export const inboxUnreadAtom = atom<number>(0);
export const selectedConversationIdAtom = atom<string | null>(null);
