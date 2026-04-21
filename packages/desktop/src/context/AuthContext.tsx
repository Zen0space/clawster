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
