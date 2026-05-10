export type AuthUser = { id: string; email: string; fullName: string | null; role: string };
export type LoginResponse = { access_token: string; refresh_token: string; user: AuthUser };
export type TokenResponse = { access_token: string; refresh_token: string };

export type DashboardStats = {
  completedCampaigns: number;
  failedCampaigns: number;
  runningCampaigns: number;
  connectedDevices: number;
};

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

export type ChatbotConfig = {
  waSessionId: string;
  enabled: boolean;
  knowledgeBase: string;
  maxTokens: number;
  dailyReplyCap: number;
  replyMinDelaySec: number;
  replyMaxDelaySec: number;
  priorityJids: string[];
  quietStart: number | null;
  quietEnd: number | null;
};

export type ChatHealthCheck = {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: string;
};

export type ChatHealth = {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  lastCheck: ChatHealthCheck | null;
};

export type ChatStats = {
  todayReplies: number;
  todayTokens: number;
  monthReplies: number;
  monthTokens: number;
};

export type ChatInboxMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "human";
  body: string;
  waMessageId: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
};

export type ChatConversation = {
  id: string;
  waSessionId: string;
  remoteJid: string;
  displayName: string | null;
  humanTakeover: boolean;
  lastMessageAt: string;
  createdAt: string;
  messages: ChatInboxMessage[];
};
