import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Campaign, type CampaignMessage, type CreateCampaignInput } from "../lib/api";
import { openEventSocket } from "../lib/ws";
import { getAccessToken } from "../lib/tokenStore";

type View = "list" | "new" | { id: string };

// ── pacing presets ──────────────────────────────────────────────────────────

type PresetKey = "warmup" | "safe" | "normal" | "fast";

type PacingValues = {
  minDelaySec: number;
  maxDelaySec: number;
  dailyCap: number;
  quietStart: number | null;
  quietEnd: number | null;
  typingSim: boolean;
};

const PRESETS: Record<PresetKey, PacingValues & { label: string; desc: string; risk: string }> = {
  warmup: {
    label: "Warmup",
    desc: "50/day · 1–5 min delay · quiet 22–8 · typing on",
    risk: "lowest ban risk — for new or cold numbers",
    minDelaySec: 60, maxDelaySec: 300, dailyCap: 50,
    quietStart: 22, quietEnd: 8, typingSim: true,
  },
  safe: {
    label: "Safe",
    desc: "200/day · 30–3 min delay · quiet 23–7 · typing on",
    risk: "low ban risk — established number, low volume",
    minDelaySec: 30, maxDelaySec: 180, dailyCap: 200,
    quietStart: 23, quietEnd: 7, typingSim: true,
  },
  normal: {
    label: "Normal",
    desc: "400/day · 20–90 sec delay · quiet 22–8 · typing on",
    risk: "moderate — trusted number with send history",
    minDelaySec: 20, maxDelaySec: 90, dailyCap: 400,
    quietStart: 22, quietEnd: 8, typingSim: true,
  },
  fast: {
    label: "Fast",
    desc: "500/day · 10–45 sec delay · no quiet hours · typing off",
    risk: "higher ban risk — use only on well-aged numbers",
    minDelaySec: 10, maxDelaySec: 45, dailyCap: 500,
    quietStart: null, quietEnd: null, typingSim: false,
  },
};

// ── helpers ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "draft", running: "running", paused: "paused",
  completed: "completed", failed: "failed",
};

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

function ProgressBar({ progress }: { progress: Campaign["progress"] }) {
  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">{pct}%</span>
    </div>
  );
}

function renderPreview(template: string): string {
  return template
    .replace(/\{\{name\}\}/g, "Ahmad")
    .replace(/\{\{phone\}\}/g, "+60123456789")
    .replace(/\{\{(\w+)\}\}/g, (_, k) => `[${k}]`);
}

// ── Image upload ───────────────────────────────────────────────────────────

function ImageUpload({ assetId, onUpload, onRemove }: {
  assetId?: string;
  onUpload: (id: string, preview: string) => void;
  onRemove: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const asset = await api.media.upload(file);
      const url = URL.createObjectURL(file);
      setPreview(url);
      onUpload(asset.id, url);
    } catch {
      // silently ignore — user can retry
    } finally {
      setUploading(false);
    }
  }

  if (assetId && preview) {
    return (
      <div className="image-preview-wrap">
        <img src={preview} className="image-preview" alt="attached" />
        <button className="image-remove" onClick={() => { setPreview(null); onRemove(); }}>✕ remove</button>
      </div>
    );
  }

  return (
    <div className={`image-upload-zone${uploading ? " uploading" : ""}`}
      onClick={() => !uploading && inputRef.current?.click()}>
      {uploading ? "uploading…" : <><span>+</span> attach image (optional)</>}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────

function CampaignForm({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [activePreset, setActivePreset] = useState<PresetKey | null>("safe");
  const [showCustom, setShowCustom] = useState(false);
  const [form, setForm] = useState<CreateCampaignInput>({
    name: "", waSessionId: "", contactListId: "",
    messageTemplate: "",
    ...PRESETS.safe,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.wa.listSessions(),
  });
  const { data: lists } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => api.contacts.listLists(),
  });

  // Sort oldest-first so index 0 = the first session the user ever linked
  const connectedSessions = (sessions ?? [])
    .filter((s) => s.status === "connected")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Auto-default to the first-added session
  useEffect(() => {
    if (connectedSessions.length > 0 && !form.waSessionId) {
      setForm((f) => ({ ...f, waSessionId: connectedSessions[0].id }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  const contactLists = lists?.items ?? [];

  const createMutation = useMutation({
    mutationFn: () => api.campaigns.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      onBack();
    },
  });

  function set<K extends keyof CreateCampaignInput>(k: K, v: CreateCampaignInput[K]) {
    setActivePreset(null);
    setForm((f) => ({ ...f, [k]: v }));
  }

  function applyPreset(key: PresetKey) {
    setActivePreset(key);
    setForm((f) => ({ ...f, ...PRESETS[key] }));
  }

  const canSubmit = form.name.trim() && form.waSessionId && form.contactListId && form.messageTemplate.trim();

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={onBack}>← campaigns</button>
          <h1 className="page-title">new campaign</h1>
        </div>
      </div>

      <div className="campaign-form">
        <div className="auth-field">
          <label className="auth-label">campaign name</label>
          <input className="auth-input" placeholder="April Sales Blast" value={form.name}
            onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="auth-field">
          <label className="auth-label">whatsapp session</label>
          {connectedSessions.length === 0
            ? <p className="auth-error">no connected sessions — link a device first</p>
            : <select className="select-input" value={form.waSessionId}
                onChange={(e) => setForm((f) => ({ ...f, waSessionId: e.target.value }))}>
                {connectedSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName ?? s.phoneNumber ?? s.id.slice(0, 8)}</option>
                ))}
              </select>
          }
        </div>

        <div className="auth-field">
          <label className="auth-label">contact list</label>
          {contactLists.length === 0
            ? <p className="auth-error">no contact lists — import contacts first</p>
            : <select className="select-input" value={form.contactListId} onChange={(e) => set("contactListId", e.target.value)}>
                <option value="">select list…</option>
                {contactLists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.rowCount.toLocaleString()})</option>
                ))}
              </select>
          }
        </div>

        <div className="auth-field">
          <label className="auth-label">message template</label>
          <p className="field-hint">variables: <code>{"{{name}}"}</code> <code>{"{{phone}}"}</code> or any excel column name</p>
          <textarea
            className="template-textarea"
            placeholder={"Hi {{name}}, this is a special offer just for you…"}
            value={form.messageTemplate}
            onChange={(e) => set("messageTemplate", e.target.value)}
            rows={5}
          />
          {form.messageTemplate && (
            <div className="template-preview">
              <span className="field-hint">preview — </span>
              {renderPreview(form.messageTemplate)}
            </div>
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label">image attachment</label>
          <ImageUpload
            assetId={form.mediaAssetId}
            onUpload={(id) => setForm((f) => ({ ...f, mediaAssetId: id }))}
            onRemove={() => setForm((f) => ({ ...f, mediaAssetId: undefined }))}
          />
        </div>

        <div className="pacing-section">
          <label className="auth-label">pacing</label>

          <div className="preset-row">
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <button
                key={key}
                className={`preset-btn${activePreset === key ? " active" : ""}`}
                onClick={() => applyPreset(key)}
                type="button"
              >
                {PRESETS[key].label}
              </button>
            ))}
            {activePreset === null && (
              <span className="preset-btn active preset-custom">custom</span>
            )}
          </div>

          <div className="preset-info">
            {activePreset
              ? <>
                  <span className="preset-desc">{PRESETS[activePreset].desc}</span>
                  <span className="preset-risk">{PRESETS[activePreset].risk}</span>
                </>
              : <span className="preset-desc">manually configured</span>
            }
          </div>

          <button className="btn-ghost" style={{ alignSelf: "flex-start", marginTop: 4 }}
            onClick={() => setShowCustom((v) => !v)}>
            {showCustom ? "▲" : "▶"} customize
          </button>

          {showCustom && (
            <div className="pacing-grid">
              <div className="auth-field">
                <label className="auth-label">min delay (sec)</label>
                <input className="auth-input" type="number" min={5} max={3600} value={form.minDelaySec}
                  onChange={(e) => set("minDelaySec", Number(e.target.value))} />
              </div>
              <div className="auth-field">
                <label className="auth-label">max delay (sec)</label>
                <input className="auth-input" type="number" min={5} max={7200} value={form.maxDelaySec}
                  onChange={(e) => set("maxDelaySec", Number(e.target.value))} />
              </div>
              <div className="auth-field">
                <label className="auth-label">daily cap</label>
                <input className="auth-input" type="number" min={1} max={1000} value={form.dailyCap}
                  onChange={(e) => set("dailyCap", Number(e.target.value))} />
              </div>
              <div className="auth-field">
                <label className="auth-label">quiet hours start (0–23)</label>
                <input className="auth-input" type="number" min={0} max={23} placeholder="e.g. 22"
                  value={form.quietStart ?? ""} onChange={(e) => set("quietStart", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="auth-field">
                <label className="auth-label">quiet hours end (0–23)</label>
                <input className="auth-input" type="number" min={0} max={23} placeholder="e.g. 8"
                  value={form.quietEnd ?? ""} onChange={(e) => set("quietEnd", e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="auth-field" style={{ gridColumn: "span 2" }}>
                <label className="typing-sim-label">
                  <input type="checkbox" checked={form.typingSim ?? true}
                    onChange={(e) => set("typingSim", e.target.checked)} />
                  typing simulation (sends "composing…" before each message)
                </label>
              </div>
            </div>
          )}
        </div>

        <button className="btn-primary" style={{ alignSelf: "flex-start", marginTop: 8 }}
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !canSubmit}>
          {createMutation.isPending ? "creating…" : "create campaign"}
        </button>
        {createMutation.isError && (
          <p className="auth-error">
            {createMutation.error instanceof Error ? createMutation.error.message : "failed"}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Detail view ────────────────────────────────────────────────────────────

function CampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => api.campaigns.get(campaignId),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === "running" ? 4000 : false;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["campaign-messages", campaignId],
    queryFn: () => api.campaigns.messages(campaignId, 1, 50),
    refetchInterval: campaign?.status === "running" ? 4000 : false,
  });

  // WebSocket for real-time progress ticks
  useEffect(() => {
    if (campaign?.status !== "running") return;
    const token = getAccessToken();
    if (!token) return;
    const ws = openEventSocket(token, (event) => {
      if (event.type === "campaign.progress" && event.campaign_id === campaignId) {
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
        queryClient.invalidateQueries({ queryKey: ["campaign-messages", campaignId] });
      }
      if (event.type === "campaign.done" && event.campaign_id === campaignId) {
        queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
        queryClient.invalidateQueries({ queryKey: ["campaigns"] });
        ws.close();
      }
    });
    wsRef.current = ws;
    return () => { ws.close(); wsRef.current = null; };
  }, [campaignId, campaign?.status, queryClient]);

  const pauseMutation = useMutation({
    mutationFn: () => api.campaigns.pause(campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
  const resumeMutation = useMutation({
    mutationFn: () => api.campaigns.resume(campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
  const cancelMutation = useMutation({
    mutationFn: () => api.campaigns.cancel(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
  });
  const startMutation = useMutation({
    mutationFn: () => api.campaigns.start(campaignId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });

  if (isLoading) return <div className="page-content"><p className="muted">loading…</p></div>;
  if (!campaign) return <div className="page-content"><p className="auth-error">campaign not found</p></div>;

  const { progress } = campaign;
  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0;

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={onBack}>← campaigns</button>
          <h1 className="page-title">{campaign.name}</h1>
          <p className="page-subtitle">{new Date(campaign.createdAt).toLocaleDateString()}</p>
        </div>
        <StatusBadge status={campaign.status} />
      </div>

      {progress.total > 0 && (
        <div className="campaign-stats-card">
          <div className="stats-row">
            <span className="stat-item stat-sent">✓ {progress.sent} sent</span>
            <span className="stat-item stat-failed">✕ {progress.failed} failed</span>
            <span className="stat-item stat-remaining">◌ {progress.remaining} remaining</span>
            <span className="stat-item muted">/ {progress.total} total</span>
          </div>
          <div className="progress-wrap">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
              {progress.failed > 0 && (
                <div className="progress-fill-fail" style={{ width: `${Math.round((progress.failed / progress.total) * 100)}%` }} />
              )}
            </div>
            <span className="progress-label">{pct}%</span>
          </div>
        </div>
      )}

      <div className="campaign-actions">
        {campaign.status === "draft" && (
          <button className="btn-primary" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
            {startMutation.isPending ? "starting…" : "▶ start campaign"}
          </button>
        )}
        {campaign.status === "running" && (
          <button className="btn-ghost" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
            {pauseMutation.isPending ? "pausing…" : "⏸ pause"}
          </button>
        )}
        {campaign.status === "paused" && (
          <button className="btn-primary" onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
            {resumeMutation.isPending ? "resuming…" : "▶ resume"}
          </button>
        )}
        {(campaign.status === "running" || campaign.status === "paused") && (
          <button className="btn-danger-ghost" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
            {cancelMutation.isPending ? "cancelling…" : "✕ cancel"}
          </button>
        )}
        {startMutation.isError && (
          <p className="auth-error">{startMutation.error instanceof Error ? startMutation.error.message : "failed to start"}</p>
        )}
      </div>

      {messages && messages.total > 0 && (
        <section>
          <h2 className="section-title">messages</h2>
          <table className="messages-table">
            <thead>
              <tr><th>phone</th><th>name</th><th>status</th><th>sent at</th></tr>
            </thead>
            <tbody>
              {messages.items.map((m) => (
                <tr key={m.id}>
                  <td className="contact-phone">{m.contact.phoneE164}</td>
                  <td className="contact-name">{m.contact.name ?? <span className="muted">—</span>}</td>
                  <td><span className={`msg-status msg-${m.status}`}>{m.status}</span></td>
                  <td className="muted">{m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {messages.total > messages.items.length && (
            <p className="muted" style={{ marginTop: 8 }}>showing {messages.items.length} of {messages.total.toLocaleString()}</p>
          )}
        </section>
      )}
    </div>
  );
}

// ── List view ──────────────────────────────────────────────────────────────

function CampaignList({ onSelect, onCreate }: { onSelect: (id: string) => void; onCreate: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => api.campaigns.list(),
    refetchInterval: 8000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.campaigns.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => api.campaigns.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  const campaigns = data?.items ?? [];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">campaigns</h1>
          <p className="page-subtitle">send whatsapp messages to contact lists</p>
        </div>
        <button className="btn-primary" onClick={onCreate}>+ new campaign</button>
      </div>

      {isLoading && <p className="muted">loading…</p>}

      {!isLoading && campaigns.length === 0 && (
        <div className="empty-state">
          <p>no campaigns yet</p>
          <p className="muted">create a campaign to start sending messages</p>
        </div>
      )}

      {campaigns.length > 0 && (
        <table className="campaigns-table">
          <thead>
            <tr><th>name</th><th>status</th><th>progress</th><th>created</th><th /></tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="campaign-row" onClick={() => onSelect(c.id)}>
                <td className="campaign-name">{c.name}</td>
                <td><StatusBadge status={c.status} /></td>
                <td>
                  {c.progress.total > 0
                    ? <><ProgressBar progress={c.progress} /><span className="muted" style={{ fontSize: 10 }}>{c.progress.sent}/{c.progress.total}</span></>
                    : <span className="muted">—</span>
                  }
                </td>
                <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td onClick={(e) => e.stopPropagation()} className="campaign-actions-cell">
                  {c.status === "draft" && (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="btn-primary" style={{ padding: "5px 10px", fontSize: 11 }}
                        onClick={() => startMutation.mutate(c.id)} disabled={startMutation.isPending}>
                        ▶ start
                      </button>
                      <button className="btn-danger-ghost"
                        onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
                        delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Campaigns() {
  const [view, setView] = useState<View>("list");

  if (view === "new") return <CampaignForm onBack={() => setView("list")} />;
  if (typeof view === "object") return <CampaignDetail campaignId={view.id} onBack={() => setView("list")} />;

  return (
    <CampaignList
      onSelect={(id) => setView({ id })}
      onCreate={() => setView("new")}
    />
  );
}
