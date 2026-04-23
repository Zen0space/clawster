import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ChatbotConfig, type ChatHealth } from "../lib/api";

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

export function Chatbot() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

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

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">chatbot</h1>
          {activeSession && (
            <p className="page-subtitle">
              {activeSession.displayName ?? "unnamed device"}
              {activeSession.phoneNumber && ` · +${activeSession.phoneNumber}`}
            </p>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {savedMsg && (
            <span style={{ fontSize: 12, color: "#3fb950" }}>✓ {savedMsg}</span>
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
    </div>
  );
}
