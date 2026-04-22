import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ChatHealth } from "../lib/api";

function AiStatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: ok ? "#3fb950" : "#f85149",
        boxShadow: ok ? "0 0 6px #3fb950" : "0 0 6px #f85149",
        flexShrink: 0,
      }}
    />
  );
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function AiIntegration({ health }: { health: ChatHealth }) {
  const queryClient = useQueryClient();

  const checkMutation = useMutation({
    mutationFn: () => api.chat.healthCheck(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-health"] }),
  });

  if (!health.configured) {
    return (
      <div className="settings-card">
        <div className="settings-field" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <span className="settings-field-label">status</span>
          <span className="muted" style={{ fontSize: 12 }}>
            ai is disabled on this server. set the following env vars and restart the backend to enable the chatbot.
          </span>
          <pre className="ai-env-snippet">
{`CHAT_BASE_URL=https://api.ilmu.ai/v1
CHAT_API_KEY=sk-...
CHAT_MODEL=nemo-super`}
          </pre>
        </div>
      </div>
    );
  }

  const last = health.lastCheck;

  return (
    <div className="settings-card">
      <div className="settings-field">
        <span className="settings-field-label">status</span>
        <div className="settings-field-value-row">
          {last ? <AiStatusDot ok={last.ok} /> : null}
          <span className="settings-field-value" style={{ fontSize: 12 }}>
            {last
              ? last.ok
                ? `connected · ${last.latencyMs}ms · ${relativeTime(last.checkedAt)}`
                : last.error
              : "not checked yet"}
          </span>
          <button
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: 11 }}
            disabled={checkMutation.isPending}
            onClick={() => checkMutation.mutate()}
          >
            {checkMutation.isPending ? "checking…" : "re-check"}
          </button>
        </div>
      </div>

      <div className="settings-field">
        <span className="settings-field-label">provider</span>
        <span className="settings-field-value" style={{ fontSize: 12 }}>{health.baseUrl}</span>
      </div>

      <div className="settings-field">
        <span className="settings-field-label">model</span>
        <span className="settings-field-value" style={{ fontSize: 12 }}>{health.model}</span>
      </div>
    </div>
  );
}

export function Settings() {
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
  });

  const { data: health } = useQuery({
    queryKey: ["chat-health"],
    queryFn: () => api.chat.health(),
    staleTime: 60_000,
  });

  // Auto-run a check on first load if configured but never checked
  useMutation({
    mutationFn: () => api.chat.healthCheck(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chat-health"] }),
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">settings</h1>
      </div>

      <section className="settings-section">
        <h2 className="section-title">account</h2>
        <div className="settings-card">
          <div className="settings-field">
            <span className="settings-field-label">email</span>
            <div className="settings-field-value-row">
              <span className="settings-field-value">{me?.email}</span>
              <span className="settings-verified-badge" title="license verified">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                verified
              </span>
            </div>
          </div>

          {me?.fullName && (
            <div className="settings-field">
              <span className="settings-field-label">name</span>
              <span className="settings-field-value">{me.fullName}</span>
            </div>
          )}

          <div className="settings-field">
            <span className="settings-field-label">role</span>
            <span className="settings-panel-role">{me?.role}</span>
          </div>

          <div className="settings-field">
            <span className="settings-field-label">member since</span>
            <span className="settings-field-value">
              {me?.createdAt
                ? new Date(me.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </span>
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="section-title">ai integration</h2>
        {health ? (
          <AiIntegration health={health} />
        ) : (
          <div className="settings-card">
            <div className="settings-field">
              <span className="muted" style={{ fontSize: 12 }}>loading…</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
