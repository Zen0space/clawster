import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import QRCode from "qrcode";
import { api } from "../lib/api";
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

export function Sessions() {
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
      if (!accessToken) {
        setLinkError("session expired — please log in again");
        return;
      }
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
    onError: () => {
      setLinkError("failed to start session — is the backend running?");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.wa.deleteSession(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });

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
            <p className="session-date">
              added {new Date(s.createdAt).toLocaleDateString()}
            </p>
            <button
              className="btn-danger-ghost"
              onClick={() => deleteMutation.mutate(s.id)}
              disabled={deleteMutation.isPending}
            >
              disconnect
            </button>
          </div>
        ))}
      </div>

      {linkingSessionId && (
        <QRModal
          qrSrc={qrSrc}
          linked={linked}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
