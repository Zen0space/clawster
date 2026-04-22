import { useState, useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ChatConversation, type ChatInboxMessage } from "../lib/api";
import { openEventSocket } from "../lib/ws";
import { accessTokenAtom, selectedConversationIdAtom, inboxUnreadAtom } from "../atoms";

function jidToLabel(jid: string, displayName: string | null): string {
  return displayName ?? ("+" + jid.split("@")[0]);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function ConversationItem({
  conv,
  active,
  onSelect,
}: {
  conv: ChatConversation;
  active: boolean;
  onSelect: () => void;
}) {
  const preview = conv.messages[0];
  return (
    <button
      className={`inbox-conv-item${active ? " active" : ""}`}
      onClick={onSelect}
    >
      <div className="inbox-conv-header">
        <span className="inbox-conv-name">
          {jidToLabel(conv.remoteJid, conv.displayName)}
        </span>
        {preview && (
          <span className="inbox-conv-time">{formatTime(preview.createdAt)}</span>
        )}
      </div>
      {preview && (
        <p className="inbox-conv-preview">
          {preview.role !== "user" && (
            <span className="inbox-conv-you">you: </span>
          )}
          {preview.body}
        </p>
      )}
    </button>
  );
}

function MessageBubble({ msg }: { msg: ChatInboxMessage }) {
  const isOutbound = msg.role === "human" || msg.role === "assistant";
  return (
    <div className={`inbox-bubble-wrap${isOutbound ? " outbound" : ""}`}>
      <div className={`inbox-bubble${isOutbound ? " outbound" : " inbound"}`}>
        <p className="inbox-bubble-body">{msg.body}</p>
        <span className="inbox-bubble-time">{formatTime(msg.createdAt)}</span>
      </div>
    </div>
  );
}

export function Inbox() {
  const accessToken = useAtomValue(accessTokenAtom);
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useAtom(selectedConversationIdAtom);
  const setUnread = useSetAtom(inboxUnreadAtom);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");

  // Stable ref so the WS callback doesn't close over stale selectedConversationId
  const selectedIdRef = useRef(selectedConversationId);
  selectedIdRef.current = selectedConversationId;

  useEffect(() => { setUnread(0); }, [setUnread]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["wa-sessions"],
    queryFn: () => api.wa.listSessions(),
  });

  const activeSessionId =
    selectedSessionId ??
    sessions.find((s) => s.status === "connected")?.id ??
    sessions[0]?.id ??
    null;

  const { data: convsData, isLoading: convsLoading } = useQuery({
    queryKey: ["chat-conversations", activeSessionId],
    queryFn: () => api.chat.listConversations(activeSessionId!),
    enabled: Boolean(activeSessionId),
  });

  const conversations = convsData?.items ?? [];

  const { data: msgsData, isLoading: msgsLoading } = useQuery({
    queryKey: ["chat-messages", selectedConversationId],
    queryFn: () => api.chat.listMessages(selectedConversationId!),
    enabled: Boolean(selectedConversationId),
  });

  const messages = msgsData?.items ?? [];

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      api.chat.sendMessage(selectedConversationId!, content),
    onSuccess: () => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ["chat-conversations", activeSessionId] });
    },
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const content = draft.trim();
      if (!content || sendMutation.isPending) return;
      sendMutation.mutate(content);
    }
  }

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // WS subscription — browser API lifecycle, useEffect is the correct tool here
  useEffect(() => {
    if (!accessToken) return;
    let closed = false;
    const ws = openEventSocket(accessToken, (event) => {
      if (closed) return;
      if (event.type === "chat.message.received") {
        queryClient.invalidateQueries({ queryKey: ["chat-conversations", event.session_id] });
        if (event.conversation_id === selectedIdRef.current) {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", selectedIdRef.current] });
        } else {
          setUnread((n) => n + 1);
        }
      }
      if (event.type === "chat.message.sent") {
        queryClient.invalidateQueries({ queryKey: ["chat-messages", event.conversation_id] });
      }
    });
    return () => {
      closed = true;
      if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws.close();
      else ws.close();
    };
  }, [accessToken, queryClient, setUnread]);

  const activeConv = conversations.find((c) => c.id === selectedConversationId) ?? null;

  return (
    <div className="inbox-layout">

      {/* ── left pane ────────────────────────────────────────────────── */}
      <aside className="inbox-left">
        <div className="inbox-left-header">
          <h1 className="page-title">inbox</h1>
          {sessions.length > 1 && (
            <select
              className="inbox-session-select select-input"
              value={activeSessionId ?? ""}
              onChange={(e) => {
                setSelectedSessionId(e.target.value || null);
                setSelectedConversationId(null);
              }}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName ?? s.phoneNumber ?? s.id.slice(0, 8)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="inbox-conv-list">
          {convsLoading && (
            <p className="inbox-empty">loading…</p>
          )}
          {!convsLoading && conversations.length === 0 && (
            <div className="empty-state" style={{ padding: "48px 24px" }}>
              <p>no messages yet</p>
              <p className="muted" style={{ marginTop: 4 }}>
                messages from contacts will appear here
              </p>
            </div>
          )}
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              active={conv.id === selectedConversationId}
              onSelect={() => setSelectedConversationId(conv.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── right pane ───────────────────────────────────────────────── */}
      <div className="inbox-right">
        {!selectedConversationId && (
          <div className="inbox-empty-state">
            <p className="muted">select a conversation</p>
          </div>
        )}

        {selectedConversationId && (
          <>
            <div className="inbox-thread-header">
              <span className="inbox-thread-name">
                {activeConv
                  ? jidToLabel(activeConv.remoteJid, activeConv.displayName)
                  : "…"}
              </span>
            </div>

            <div className="inbox-thread-body">
              {msgsLoading && <p className="inbox-empty">loading…</p>}
              {!msgsLoading && messages.length === 0 && (
                <p className="inbox-empty">no messages in this conversation</p>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={threadEndRef} />
            </div>

            <div className="inbox-compose">
              <textarea
                className="inbox-compose-input"
                placeholder="type a message… enter to send, shift+enter for new line"
                value={draft}
                rows={1}
                disabled={sendMutation.isPending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn-primary inbox-compose-btn"
                disabled={!draft.trim() || sendMutation.isPending}
                onClick={() => {
                  const content = draft.trim();
                  if (content) sendMutation.mutate(content);
                }}
              >
                {sendMutation.isPending ? "sending…" : "send"}
              </button>
            </div>
            {sendMutation.isError && (
              <p className="inbox-send-error">
                failed to send — {(sendMutation.error as Error).message}
              </p>
            )}
          </>
        )}
      </div>

    </div>
  );
}
