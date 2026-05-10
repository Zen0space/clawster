import { atom } from "jotai";

export {
  userAtom,
  authLoadingAtom,
  accessTokenAtom,
  refreshTokenAtom,
  inboxUnreadAtom,
  selectedConversationIdAtom,
} from "@clawster/shared";
export type { AuthUser } from "@clawster/shared";

export type AppPage = "dashboard" | "sessions" | "contacts" | "campaigns" | "inbox" | "chatbot" | "settings" | "changelog";
export type AuthPage = "login" | "signup";
export const appPageAtom = atom<AppPage>("dashboard");
export const authPageAtom = atom<AuthPage>("login");
