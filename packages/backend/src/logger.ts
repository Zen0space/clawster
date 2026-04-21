const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

const DEBUG = process.env.LOG_LEVEL === "debug";

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function line(color: string, label: string, msg: string): string {
  return `${C.gray}${ts()}${C.reset} ${color}[${label}]${C.reset} ${msg}`;
}

function fmtErr(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

export const log = {
  info: (msg: string) => console.log(line(C.cyan, "info", msg)),
  success: (msg: string) => console.log(line(C.green, "ok", msg)),
  warn: (msg: string, err?: unknown) => {
    console.warn(line(C.yellow, "warn", msg));
    if (err !== undefined) console.warn(`  ${C.dim}${fmtErr(err)}${C.reset}`);
  },
  error: (msg: string, err?: unknown) => {
    console.error(line(C.red, "error", msg));
    if (err !== undefined) console.error(`  ${C.dim}${fmtErr(err)}${C.reset}`);
  },
  debug: (msg: string) => {
    if (DEBUG) console.log(line(C.magenta, "debug", msg));
  },
  api: (method: string, url: string, status: number, durationMs: number) => {
    const isErr = status >= 400;
    const tagColor = isErr ? (status >= 500 ? C.red : C.yellow) : C.green;
    const tagLabel = isErr ? "api err" : "api ok";
    const statusColor = status >= 500 ? C.red : status >= 400 ? C.yellow : C.green;
    console.log(
      line(
        tagColor,
        tagLabel,
        `${method} ${url} ${statusColor}${status}${C.reset} ${C.dim}(${durationMs.toFixed(1)}ms)${C.reset}`,
      ),
    );
  },
};

export const silentLogger: any = {
  level: "silent",
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  fatal: () => {},
  child: () => silentLogger,
};
