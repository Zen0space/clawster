// Two output modes — selected by env so we don't have to touch any call site:
//
//   LOG_FORMAT=json   → one JSON object per line, no colors. Loki/Datadog/etc.
//   LOG_FORMAT=pretty → ANSI-colored single line. Default in dev.
//
// Production (NODE_ENV=production) defaults to json; everything else defaults
// to pretty. Override either way with LOG_FORMAT.

const FORMAT =
  (process.env.LOG_FORMAT as "json" | "pretty" | undefined) ??
  (process.env.NODE_ENV === "production" ? "json" : "pretty");

const DEBUG = process.env.LOG_LEVEL === "debug";

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

type Level = "debug" | "info" | "warn" | "error";

function fmtErr(err: unknown): { message: string; stack?: string } | string {
  if (err instanceof Error) return { message: err.message, stack: err.stack };
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function emit(level: Level, label: string, color: string, msg: string, fields?: Record<string, unknown>) {
  const stream = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  if (FORMAT === "json") {
    const entry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(fields ?? {}),
    };
    stream(JSON.stringify(entry));
    return;
  }
  const ts = new Date().toTimeString().slice(0, 8);
  const head = `${C.gray}${ts}${C.reset} ${color}[${label}]${C.reset} ${msg}`;
  if (fields && Object.keys(fields).length > 0) {
    const tail = Object.entries(fields)
      .filter(([k]) => k !== "err")
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    stream(tail ? `${head} ${C.dim}${tail}${C.reset}` : head);
    if (fields.err !== undefined) {
      const e = fmtErr(fields.err);
      const text = typeof e === "string" ? e : (e.stack ?? e.message);
      stream(`  ${C.dim}${text}${C.reset}`);
    }
  } else {
    stream(head);
  }
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", "info", C.cyan, msg, fields),
  success: (msg: string, fields?: Record<string, unknown>) => emit("info", "ok", C.green, msg, fields),
  warn: (msg: string, err?: unknown) =>
    emit("warn", "warn", C.yellow, msg, err !== undefined ? { err: fmtErr(err) } : undefined),
  error: (msg: string, err?: unknown) =>
    emit("error", "error", C.red, msg, err !== undefined ? { err: fmtErr(err) } : undefined),
  debug: (msg: string, fields?: Record<string, unknown>) => {
    if (DEBUG) emit("debug", "debug", C.magenta, msg, fields);
  },
  api: (method: string, url: string, status: number, durationMs: number, reqId?: string) => {
    const isErr = status >= 400;
    if (FORMAT === "json") {
      emit(isErr ? (status >= 500 ? "error" : "warn") : "info", "api", "", "request", {
        method, url, status, duration_ms: Number(durationMs.toFixed(1)), req_id: reqId,
      });
      return;
    }
    const tagColor = isErr ? (status >= 500 ? C.red : C.yellow) : C.green;
    const tagLabel = isErr ? "api err" : "api ok";
    const statusColor = status >= 500 ? C.red : status >= 400 ? C.yellow : C.green;
    const ts = new Date().toTimeString().slice(0, 8);
    const idTag = reqId ? ` ${C.dim}[${reqId.slice(0, 8)}]${C.reset}` : "";
    console.info(
      `${C.gray}${ts}${C.reset} ${tagColor}[${tagLabel}]${C.reset}${idTag} ${method} ${url} ${statusColor}${status}${C.reset} ${C.dim}(${durationMs.toFixed(1)}ms)${C.reset}`,
    );
  },
};

type SilentLogger = {
  level: string;
  trace: () => void;
  debug: () => void;
  info: () => void;
  warn: () => void;
  error: () => void;
  fatal: () => void;
  child: () => SilentLogger;
};

export const silentLogger: SilentLogger = {
  level: "silent",
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};
