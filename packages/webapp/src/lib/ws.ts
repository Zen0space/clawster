const BASE_WS = (import.meta.env.VITE_API_URL ?? "http://localhost:8080")
  .replace(/^http/, "ws");

export function openEventSocket(
  token: string,
  onEvent: (event: Record<string, unknown>) => void
): WebSocket {
  const ws = new WebSocket(`${BASE_WS}/api/v1/wa/ws?token=${token}`);
  ws.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data as string)); } catch { /* ignore malformed */ }
  };
  return ws;
}
