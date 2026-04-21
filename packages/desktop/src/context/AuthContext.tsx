import React, { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { setTokens, clearTokens, getAccessToken, getRefreshToken } from "../lib/tokenStore";

type AuthUser = { id: string; email: string; fullName: string | null; role: string };

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, licenseKey: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const refresh = getRefreshToken();
      if (!getAccessToken() || !refresh) return null;

      try {
        return await api.auth.me();
      } catch {
        try {
          const refreshed = await api.auth.refresh(refresh);
          setTokens(refreshed.access_token, refreshed.refresh_token);
          return await api.auth.me();
        } catch {
          clearTokens();
          return null;
        }
      }
    },
    retry: false,
    staleTime: Infinity,
  });

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await api.auth.login(email, password);
      setTokens(res.access_token, res.refresh_token);
      return res.user;
    },
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });

  const registerMutation = useMutation({
    mutationFn: async ({ email, password, licenseKey, fullName }: { email: string; password: string; licenseKey: string; fullName?: string }) => {
      const res = await api.auth.register(email, password, licenseKey, fullName);
      setTokens(res.access_token, res.refresh_token);
      return res.user;
    },
    onSuccess: (user) => queryClient.setQueryData(["auth", "me"], user),
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const refresh = getRefreshToken();
      if (refresh) await api.auth.logout(refresh).catch(() => {});
      clearTokens();
    },
    onSuccess: () => queryClient.setQueryData(["auth", "me"], null),
  });

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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
