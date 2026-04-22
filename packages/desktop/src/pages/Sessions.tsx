import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import QRCode from "qrcode";
import { api, type ChatbotConfig, type ChatHealth } from "../lib/api";
import { openEventSocket } from "../lib/ws";
import { accessTokenAtom } from "../atoms";

type Session = {
  id: string;
  displayName: string | null;
  phoneNumber: string | null;
  status: string;
  lastSeenAt: string | null;
  createdAt: string;
};

type WsEvent = Record<string, unknown>;
type SessionsView = "list" | { chatbot: string };

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

type ReplyPresetKey = "fast" | "balanced" | "relaxed" | "custom";
const REPLY_PRESETS: Record<ReplyPresetKey, { label: string; desc: string; min?: number; max?: number }> = {
  fast:     { label: "Fast",     desc: "5–20s · responsive, slightly bot-like",    min: 5,  max: 20  },
  balanced: { label: "Balanced", desc: "15–45s · recommended, natural pacing",     min: 15, max: 45  },
  relaxed:  { label: "Relaxed",  desc: "30–90s · very human, lowest suspicion",    min: 30, max: 90  },
  custom:   { label: "Custom",   desc: "set your own min / max delay" },
};

function formatHour(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function QRModal({ qrSrc, linked, onClose }: { qrSrc: string | null; linked: boolean; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="auth-brand-name">link new device</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {linked ? (
          <div className="modal-success">
            <span className="success-dot" />
            <p>connected!</p>
          </div>
        ) : qrSrc ? (
          <div className="qr-wrap">
            <img className="qr-img" src={qrSrc} alt="QR code" />
            <p className="qr-hint">scan with whatsapp on your phone</p>
          </div>
        ) : (
          <div className="modal-loading">generating qr…</div>
        )}
      </div>
    </div>
  );
}

// ── Chatbot config form — keyed so it remounts cleanly when config loads ──────

function detectPreset(min: number, max: number): ReplyPresetKey {
  for (const [key, p] of Object.entries(REPLY_PRESETS)) {
    if (p.min === min && p.max === max) return key as ReplyPresetKey;
  }
  return "custom";
}

function ChatbotConfigForm({
  initial,
  health,
  onSave,
  saving,
}: {
  initial: ChatbotConfig;
  health: ChatHealth | undefined;
  onSave: (data: Omit<ChatbotConfig, "waSessionId">) => void;
  saving: boolean;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt);
  const [maxTokens, setMaxTokens] = useState(initial.maxTokens);
  const [dailyReplyCap, setDailyReplyCap] = useState(initial.dailyReplyCap);
  const [replyMinDelaySec, setReplyMinDelaySec] = useState(initial.replyMinDelaySec);
  const [replyMaxDelaySec, setReplyMaxDelaySec] = useState(initial.replyMaxDelaySec);
  const [replyPreset, setReplyPreset] = useState<ReplyPresetKey>(() =>
    detectPreset(initial.replyMinDelaySec, initial.replyMaxDelaySec)
  );
  const [quietStart, setQuietStart] = useState<number | null>(initial.quietStart);
  const [quietEnd, setQuietEnd] = useState<number | null>(initial.quietEnd);
  const [priorityText, setPriorityText] = useState(initial.priorityJids.join("\n"));

  const aiConfigured = health?.configured ?? false;

  function applyPreset(key: ReplyPresetKey) {
    setReplyPreset(key);
    const p = REPLY_PRESETS[key];
    if (p.min != null && p.max != null) {
      setReplyMinDelaySec(p.min);
      setReplyMaxDelaySec(p.max);
    }
  }

  function parsePriorityJids(): string[] {
    return priorityText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("+") && l.length > 4);
  }

  return (
    <div className="chatbot-config-form">
      {!aiConfigured && (
        <div className="chatbot-config-banner">
          ai is not configured on this server — set <code>CHAT_API_KEY</code> in the backend
          environment to enable the chatbot. the bot toggle is disabled until then.
        </div>
      )}

      {/* ── general ── */}
      <div className="settings-card">
        <div className="settings-field">
          <span className="settings-field-label">enabled</span>
          <label className="typing-sim-label">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!aiConfigured}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            {enabled ? "bot replies are active" : "bot replies are off"}
          </label>
        </div>

        <div className="settings-field">
          <span className="settings-field-label">daily reply cap</span>
          <input
            className="auth-input"
            type="number"
            min={1}
            max={1000}
            style={{ width: 80, fontSize: 13 }}
            value={dailyReplyCap}
            onChange={(e) => setDailyReplyCap(Number(e.target.value))}
          />
        </div>

        <div className="settings-field">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="settings-field-label">max reply tokens</span>
            <span className="muted" style={{ fontSize: 10 }}>
              0 = no limit · reasoning models may need 0 or 8192+
            </span>
          </div>
          <input
            className="auth-input"
            type="number"
            min={0}
            max={16384}
            step={256}
            style={{ width: 90, fontSize: 13 }}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </div>

        <div className="settings-field">
          <span className="settings-field-label">quiet hours</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              className="select-input"
              style={{ width: "auto", fontSize: 13 }}
              value={quietStart ?? ""}
              onChange={(e) => {
                const val = e.target.value === "" ? null : Number(e.target.value);
                setQuietStart(val);
                if (val === null) setQuietEnd(null);
              }}
            >
              <option value="">off</option>
              {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
            </select>
            {quietStart != null && (
              <>
                <span className="muted" style={{ fontSize: 12 }}>to</span>
                <select
                  className="select-input"
                  style={{ width: "auto", fontSize: 13 }}
                  value={quietEnd ?? ""}
                  onChange={(e) => setQuietEnd(e.target.value === "" ? null : Number(e.target.value))}
                >
                  {HOUR_OPTIONS.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── reply pacing ── */}
      <div>
        <h2 className="section-title">reply pacing</h2>
        <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
          delay between bot replies to different contacts in the same session
        </p>
        <div className="pacing-section">
          <div className="preset-row">
            {(Object.keys(REPLY_PRESETS) as ReplyPresetKey[]).map((key) => (
              <button
                key={key}
                className={`preset-btn${replyPreset === key ? " active" : ""}${key === "custom" ? " preset-custom" : ""}`}
                onClick={() => applyPreset(key)}
              >
                {REPLY_PRESETS[key].label}
              </button>
            ))}
          </div>
          <div className="preset-info">
            <span className="preset-desc">{REPLY_PRESETS[replyPreset].desc}</span>
          </div>
          {replyPreset === "custom" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>min</span>
                <input
                  className="auth-input"
                  type="number"
                  min={1}
                  max={300}
                  style={{ width: 70, fontSize: 13 }}
                  value={replyMinDelaySec}
                  onChange={(e) => setReplyMinDelaySec(Number(e.target.value))}
                />
                <span className="muted" style={{ fontSize: 12 }}>sec</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="muted" style={{ fontSize: 12 }}>max</span>
                <input
                  className="auth-input"
                  type="number"
                  min={replyMinDelaySec}
                  max={600}
                  style={{ width: 70, fontSize: 13 }}
                  value={replyMaxDelaySec}
                  onChange={(e) => setReplyMaxDelaySec(Number(e.target.value))}
                />
                <span className="muted" style={{ fontSize: 12 }}>sec</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── priority contacts ── */}
      <div>
        <h2 className="section-title">priority contacts</h2>
        <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
          these numbers jump the reply queue — one per line, e.g. +60123456789
        </p>
        <textarea
          className="template-textarea"
          rows={4}
          placeholder={"+60123456789\n+60198765432"}
          value={priorityText}
          onChange={(e) => setPriorityText(e.target.value)}
        />
        {parsePriorityJids().length > 0 && (
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            {parsePriorityJids().length} priority contact{parsePriorityJids().length > 1 ? "s" : ""} configured
          </p>
        )}
      </div>

      {/* ── system prompt ── */}
      <div className="chatbot-prompt-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <h2 className="section-title" style={{ margin: 0 }}>system prompt</h2>
          <span className="muted" style={{ fontSize: 11 }}>{systemPrompt.length} / 8000</span>
        </div>
        <textarea
          className="template-textarea"
          rows={8}
          maxLength={8000}
          placeholder={"You are a friendly sales assistant for [Company Name], replying to WhatsApp messages.\n\nReply in casual Malaysian style — mix simple English and Malay naturally (lah, boleh, okay, tak pe). Keep replies to 1-2 short sentences, like real chat.\n\n=== PRODUCT INFO ===\nProduct: ...\nPrice: ...\n\nIf you don't know something, say so and offer to connect with a human."}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />
      </div>

      <button
        className="btn-primary"
        style={{ alignSelf: "flex-start" }}
        disabled={saving}
        onClick={() => onSave({
          enabled, systemPrompt, maxTokens, dailyReplyCap,
          replyMinDelaySec, replyMaxDelaySec,
          priorityJids: parsePriorityJids(),
          quietStart, quietEnd,
        })}
      >
        {saving ? "saving…" : "save config"}
      </button>
    </div>
  );
}

// ── Chatbot config view ────────────────────────────────────────────────────────

function ChatbotConfigView({ sessionId, sessions, onBack }: {
  sessionId: string;
  sessions: Session[];
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const session = sessions.find((s) => s.id === sessionId);

  const { data: config, isLoading } = useQuery({
    queryKey: ["chatbot-config", sessionId],
    queryFn: () => api.chat.getConfig(sessionId),
  });

  const { data: health } = useQuery({
    queryKey: ["chat-health"],
    queryFn: () => api.chat.health(),
    staleTime: 60_000,
  });

  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: Omit<ChatbotConfig, "waSessionId">) =>
      api.chat.saveConfig(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-config", sessionId] });
      setSavedMsg("saved");
      setTimeout(() => setSavedMsg(null), 2000);
    },
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={onBack}>← back to sessions</button>
          <h1 className="page-title">chatbot config</h1>
          {session && (
            <p className="page-subtitle">
              {session.displayName ?? "unnamed device"}
              {session.phoneNumber && ` · +${session.phoneNumber}`}
              <span style={{ marginLeft: 8 }}><StatusBadge status={session.status} /></span>
            </p>
          )}
        </div>
        {savedMsg && (
          <span style={{ fontSize: 12, color: "#3fb950", alignSelf: "flex-end" }}>
            ✓ {savedMsg}
          </span>
        )}
      </div>

      {isLoading && <p className="muted">loading…</p>}

      {config && (
        <ChatbotConfigForm
          key={sessionId}
          initial={config}
          health={health}
          onSave={(data) => saveMutation.mutate(data)}
          saving={saveMutation.isPending}
        />
      )}

      {saveMutation.isError && (
        <p className="auth-error">{(saveMutation.error as Error).message}</p>
      )}
    </div>
  );
}

// ── Main Sessions page ─────────────────────────────────────────────────────────

export function Sessions() {
  const [view, setView] = useState<SessionsView>("list");
  const [linkingSessionId, setLinkingSessionId] = useState<string | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const accessToken = useAtomValue(accessTokenAtom);

  const { data: sessions = [], isLoading } = useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => api.wa.listSessions(),
  });

  // All hooks must be declared before any conditional return
  function closeModal() {
    wsRef.current?.close();
    wsRef.current = null;
    setLinkingSessionId(null);
    setQrSrc(null);
    setLinked(false);
  }

  const createMutation = useMutation({
    mutationFn: () => api.wa.createSession(),
    onSuccess: ({ id }) => {
      if (!accessToken) { setLinkError("session expired — please log in again"); return; }
      const token = accessToken;
      const ws = openEventSocket(token, async (event: WsEvent) => {
        if (event.type === "wa.qr" && event.session_id === id) {
          const src = await QRCode.toDataURL(event.qr as string, { width: 240, margin: 1 });
          setQrSrc(src);
        }
        if (event.type === "wa.status" && event.session_id === id && event.status === "connected") {
          setLinked(true);
          ws.close();
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          setTimeout(closeModal, 1200);
        }
      });
      wsRef.current = ws;
      setLinkingSessionId(id);
    },
    onError: () => setLinkError("failed to start session — is the backend running?"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.wa.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

  if (typeof view === "object") {
    return (
      <ChatbotConfigView
        sessionId={view.chatbot}
        sessions={sessions}
        onBack={() => setView("list")}
      />
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">wa sessions</h1>
          <p className="page-subtitle">linked whatsapp accounts</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setLinkError(null); createMutation.mutate(); }}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "linking…" : "+ link device"}
        </button>
      </div>

      {linkError && <p className="auth-error">{linkError}</p>}
      {isLoading && <p className="muted">loading…</p>}

      {!isLoading && sessions.length === 0 && (
        <div className="empty-state">
          <p>no sessions yet</p>
          <p className="muted">link a whatsapp account to get started</p>
        </div>
      )}

      <div className="sessions-grid">
        {sessions.map((s) => (
          <div key={s.id} className="session-card">
            <div className="session-card-header">
              <span className="session-name">{s.displayName ?? "unnamed device"}</span>
              <StatusBadge status={s.status} />
            </div>
            {s.phoneNumber && <p className="session-phone">+{s.phoneNumber}</p>}
            <p className="session-date">added {new Date(s.createdAt).toLocaleDateString()}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                className="btn-ghost"
                style={{ flex: 1, fontSize: 11, padding: "6px 0" }}
                onClick={() => setView({ chatbot: s.id })}
              >
                chatbot
              </button>
              <button
                className="btn-danger-ghost"
                style={{ flex: 1 }}
                onClick={() => deleteMutation.mutate(s.id)}
                disabled={deleteMutation.isPending}
              >
                disconnect
              </button>
            </div>
          </div>
        ))}
      </div>

      {linkingSessionId && (
        <QRModal qrSrc={qrSrc} linked={linked} onClose={closeModal} />
      )}
    </div>
  );
}
