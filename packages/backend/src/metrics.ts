import { Registry, collectDefaultMetrics, Counter, Gauge } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [registry],
});

export const campaignMessagesSentTotal = new Counter({
  name: "campaign_messages_sent_total",
  help: "Total campaign messages sent successfully",
  registers: [registry],
});

export const campaignMessagesFailedTotal = new Counter({
  name: "campaign_messages_failed_total",
  help: "Total campaign messages failed",
  registers: [registry],
});

export const waSessionsActive = new Gauge({
  name: "wa_sessions_active",
  help: "Number of currently connected WhatsApp sessions",
  registers: [registry],
});
