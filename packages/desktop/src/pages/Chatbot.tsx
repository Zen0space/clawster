import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { api, type ChatbotConfig, type ChatHealth } from "../lib/api";
import { openEventSocket } from "../lib/ws";
import { accessTokenAtom } from "../atoms";

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

function detectPreset(min: number, max: number): ReplyPresetKey {
  for (const [key, p] of Object.entries(REPLY_PRESETS)) {
    if (p.min === min && p.max === max) return key as ReplyPresetKey;
  }
  return "custom";
}

// Keyed so it remounts cleanly when switching sessions or config loads
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
  const [knowledgeBase, setKnowledgeBase] = useState(initial.knowledgeBase);
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

      {/* ── knowledge base ── */}
      <div className="chatbot-prompt-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <h2 className="section-title" style={{ margin: 0 }}>knowledge base</h2>
          <span className="muted" style={{ fontSize: 11 }}>{knowledgeBase.length} / 8000</span>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 8 }}>
          everything the bot should know — company info, products, prices, FAQs, policies, contact details.
          the bot only answers questions covered here; everything else gets a polite redirect.
        </p>
        <textarea
          className="template-textarea"
          rows={14}
          maxLength={8000}
          placeholder={"=== ABOUT US ===\nCompany: [Your Company Sdn Bhd]\nEstablished [year], based in [city]\nWhat we do: [one-line mission]\n\n=== PRODUCTS / SERVICES ===\n[Product A] — RM[price]/month\n- Feature 1\n- Feature 2\n\n=== FAQ ===\nQ: Ada free trial tak?\nA: Ya, 7 hari free trial, tak perlu credit card.\n\nQ: Boleh refund?\nA: Ya, dalam 14 hari.\n\n=== POLICIES ===\nSupport hours: Isnin–Jumaat, 9am–6pm (MYT)\nRefund window: 14 hari\n\n=== CONTACT ===\nEmail: hello@example.com\nPhone: +60123456789"}
          value={knowledgeBase}
          onChange={(e) => setKnowledgeBase(e.target.value)}
        />
      </div>

      <button
        className="btn-primary"
        style={{ alignSelf: "flex-start" }}
        disabled={saving}
        onClick={() => onSave({
          enabled, knowledgeBase, maxTokens, dailyReplyCap,
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

// ── Test bot modal ────────────────────────────────────────────────────────────

type TestMessage = { role: "user" | "assistant"; content: string };

function TestBotModal({ waSessionId, onClose }: { waSessionId: string; onClose: () => void }) {
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages.length]);

  async function send() {
    const content = draft.trim();
    if (!content || loading) return;
    const next: TestMessage[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    setError(null);
    try {
      const res = await api.chat.testBot(waSessionId, next);
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="auth-brand-name">test bot</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setMessages([])}>clear</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, padding: "0 20px 12px" }}>
          chat with your bot using the saved knowledge base — nothing is sent to WhatsApp
        </p>

        <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
          {messages.length === 0 && (
            <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 40 }}>
              send a message to start the test
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%", padding: "8px 12px", borderRadius: 8, fontSize: 13,
                background: m.role === "user" ? "var(--accent)" : "var(--surface-raised)",
                color: m.role === "user" ? "#fff" : "var(--text-primary)",
              }}>
                {m.role === "assistant" && <span style={{ fontSize: 10, opacity: 0.6, display: "block", marginBottom: 2 }}>bot</span>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, background: "var(--surface-raised)", color: "var(--text-muted)" }}>
                thinking…
              </div>
            </div>
          )}
        </div>

        {error && <p className="auth-error" style={{ margin: "8px 16px 0" }}>{error}</p>}

        <div style={{ padding: 16, display: "flex", gap: 8, borderTop: "1px solid var(--border)" }}>
          <textarea
            className="inbox-compose-input"
            rows={1}
            placeholder="type a message… enter to send"
            value={draft}
            disabled={loading}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKey}
            style={{ flex: 1 }}
          />
          <button className="btn-primary inbox-compose-btn" disabled={!draft.trim() || loading} onClick={send}>
            send
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Token usage widget ────────────────────────────────────────────────────────

const MONTHLY_TOKEN_CAP = 1_000_000;

function TokenUsageWidget({ tokenCapReached }: { tokenCapReached: boolean }) {
  const { data: stats } = useQuery({ queryKey: ["chat-stats"], queryFn: () => api.chat.stats(), staleTime: 30_000 });

  const usedThisMonth = stats?.monthTokens ?? 0;
  const pct = Math.min(100, Math.round((usedThisMonth / MONTHLY_TOKEN_CAP) * 100));

  return (
    <div className="settings-card" style={{ marginBottom: 16 }}>
      {tokenCapReached && (
        <div style={{ background: "rgba(210,153,34,0.12)", border: "1px solid rgba(210,153,34,0.4)", borderRadius: 6, padding: "8px 12px", marginBottom: 12, fontSize: 12, color: "#d29922" }}>
          monthly token cap reached — bot paused until next month
        </div>
      )}
      <div className="settings-field">
        <div>
          <span className="settings-field-label">token usage this month</span>
          <div style={{ marginTop: 4, width: 200, height: 4, background: "var(--border)", borderRadius: 2 }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: pct >= 90 ? "#f85149" : pct >= 70 ? "#d29922" : "#3fb950" }} />
          </div>
          <span className="muted" style={{ fontSize: 11, display: "block", marginTop: 4 }}>
            {usedThisMonth.toLocaleString()} / {MONTHLY_TOKEN_CAP.toLocaleString()} tokens ({pct}%)
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Chatbot page ─────────────────────────────────────────────────────────

export function Chatbot() {
  const accessToken = useAtomValue(accessTokenAtom);
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [tokenCapReached, setTokenCapReached] = useState(false);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["wa-sessions"],
    queryFn: () => api.wa.listSessions(),
  });

  const { data: health } = useQuery({
    queryKey: ["chat-health"],
    queryFn: () => api.chat.health(),
    staleTime: 60_000,
  });

  const activeSessionId =
    selectedSessionId ??
    sessions.find((s) => s.status === "connected")?.id ??
    sessions[0]?.id ??
    null;

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["chatbot-config", activeSessionId],
    queryFn: () => api.chat.getConfig(activeSessionId!),
    enabled: Boolean(activeSessionId),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Omit<ChatbotConfig, "waSessionId">) =>
      api.chat.saveConfig(activeSessionId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chatbot-config", activeSessionId] });
      setSavedMsg("saved");
      setTimeout(() => setSavedMsg(null), 2000);
    },
  });

  // WS: listen for token cap reached event
  useEffect(() => {
    if (!accessToken) return;
    let closed = false;
    const ws = openEventSocket(accessToken, (event) => {
      if (closed) return;
      if (event.type === "chat.bot.token_cap_reached") {
        setTokenCapReached(true);
        queryClient.invalidateQueries({ queryKey: ["chat-stats"] });
      }
    });
    return () => {
      closed = true;
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      else ws.close();
    };
  }, [accessToken, queryClient]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">chatbot <span className="nav-beta-badge">beta</span></h1>
          {activeSession && (
            <p className="page-subtitle">
              {activeSession.displayName ?? "unnamed device"}
              {activeSession.phoneNumber && ` · +${activeSession.phoneNumber}`}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {savedMsg && <span style={{ fontSize: 12, color: "#3fb950" }}>✓ {savedMsg}</span>}
          {activeSessionId && config && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowTestModal(true)}>
              test bot
            </button>
          )}
          {sessions.length > 1 && (
            <select
              className="select-input"
              value={activeSessionId ?? ""}
              onChange={(e) => setSelectedSessionId(e.target.value || null)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName ?? s.phoneNumber ?? s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <TokenUsageWidget tokenCapReached={tokenCapReached} />

      {(sessionsLoading || configLoading) && <p className="muted">loading…</p>}

      {!sessionsLoading && sessions.length === 0 && (
        <div className="empty-state">
          <p>no sessions yet</p>
          <p className="muted">link a whatsapp account in wa sessions first</p>
        </div>
      )}

      {config && activeSessionId && (
        <ChatbotConfigForm
          key={activeSessionId}
          initial={config}
          health={health}
          onSave={(data) => saveMutation.mutate(data)}
          saving={saveMutation.isPending}
        />
      )}

      {saveMutation.isError && (
        <p className="auth-error">{(saveMutation.error as Error).message}</p>
      )}

      {showTestModal && activeSessionId && (
        <TestBotModal waSessionId={activeSessionId} onClose={() => setShowTestModal(false)} />
      )}
    </div>
  );
}
