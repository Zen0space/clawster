import React, { createContext, useContext, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom, useSetAtom } from "jotai";
import { api } from "../lib/api";
import {
  userAtom,
  authLoadingAtom,
  accessTokenAtom,
  refreshTokenAtom,
  type AuthUser,
} from "../atoms";

type AuthOps = {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, licenseKey: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthOps | null>(null);

// Refresh access token this many ms before it expires
const REFRESH_LEAD_MS = 60_000;

// Decode JWT payload to read the `exp` (expiration) claim, in ms since epoch.
// Returns null if the token can't be decoded — the reactive 401 refresh in
// apiFetch is a safety net for that case.
function getJwtExpiryMs(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const parsed = JSON.parse(atob(padded)) as { exp?: number };
    return parsed.exp ? parsed.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const setUser = useSetAtom(userAtom);
  const setAuthLoading = useSetAtom(authLoadingAtom);
  const [accessToken, setAccessToken] = useAtom(accessTokenAtom);
  const [, setRefreshToken] = useAtom(refreshTokenAtom);

  const { data, isSuccess, isError } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (!accessToken || !refresh) return null;
      try {
        return await api.auth.me();
      } catch {
        try {
          const refreshed = await api.auth.refresh(refresh);
          setAccessToken(refreshed.access_token);
          setRefreshToken(refreshed.refresh_token);
          return await api.auth.me();
        } catch {
          setAccessToken(null);
          setRefreshToken(null);
          return null;
        }
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (isSuccess) {
      setUser(data ?? null);
      setAuthLoading(false);
    }
    if (isError) {
      setUser(null);
      setAuthLoading(false);
    }
  }, [data, isSuccess, isError, setUser, setAuthLoading]);

  // Proactive refresh: schedule a refresh ~60s before the access token expires.
  // Cancels and reschedules on every accessToken change (login, manual refresh,
  // proactive refresh) so the timer always tracks the current token.
  useEffect(() => {
    if (!accessToken) return;
    const expiryMs = getJwtExpiryMs(accessToken);
    if (!expiryMs) return;

    const delayMs = Math.max(1000, expiryMs - REFRESH_LEAD_MS - Date.now());
    const timer = window.setTimeout(async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (!refresh) return;
      try {
        const res = await api.auth.refresh(refresh);
        setAccessToken(res.access_token);
        setRefreshToken(res.refresh_token);
      } catch {
        // Refresh failed — let the next 401 hit the reactive refresh in apiFetch
        // or surface logout via the auth/me query.
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [accessToken, setAccessToken, setRefreshToken]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await api.auth.login(email, password);
      setAccessToken(res.access_token);
      setRefreshToken(res.refresh_token);
      return res.user;
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async ({ email, password, licenseKey, fullName }: { email: string; password: string; licenseKey: string; fullName?: string }) => {
      const res = await api.auth.register(email, password, licenseKey, fullName);
      setAccessToken(res.access_token);
      setRefreshToken(res.refresh_token);
      return res.user;
    },
    onSuccess: (user) => {
      setUser(user);
      queryClient.setQueryData(["auth", "me"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) await api.auth.logout(refresh).catch(() => {});
      setAccessToken(null);
      setRefreshToken(null);
    },
    onSuccess: () => {
      setUser(null);
      queryClient.setQueryData(["auth", "me"], null);
    },
  });

  return (
    <AuthContext.Provider
      value={{
        login: async (email, password) => { await loginMutation.mutateAsync({ email, password }); },
        register: async (email, password, licenseKey, fullName) => { await registerMutation.mutateAsync({ email, password, licenseKey, fullName }); },
        logout: () => logoutMutation.mutateAsync(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
