import { useState } from "react";
import { useSetAtom } from "jotai";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import CHANGELOG_MD from "../../../../docs/CHANGELOG.md?raw";
import { appPageAtom } from "../atoms";
import pkg from "../../package.json";

type UpdateState = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error";

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "hr" }
  | { kind: "ul"; items: string[] };

function parse(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const out: Block[] = [];
  let list: string[] | null = null;
  const flushList = () => { if (list) { out.push({ kind: "ul", items: list }); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); continue; }
    if (line.startsWith("- ")) { (list ??= []).push(line.slice(2)); continue; }
    flushList();
    if (line.startsWith("### ")) out.push({ kind: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) out.push({ kind: "h2", text: line.slice(3) });
    else if (line.startsWith("# ")) out.push({ kind: "h1", text: line.slice(2) });
    else if (/^-{3,}$/.test(line.trim())) out.push({ kind: "hr" });
    else out.push({ kind: "p", text: line });
  }
  flushList();
  return out;
}

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={`${keyBase}-b-${i++}`}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<code key={`${keyBase}-c-${i++}`}>{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Changelog() {
  const setAppPage = useSetAtom(appPageAtom);
  const blocks = parse(CHANGELOG_MD);

  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  async function checkForUpdate() {
    setUpdateState("checking");
    try {
      const update = await check();
      if (update) {
        setPendingUpdate(update);
        setUpdateState("available");
      } else {
        setUpdateState("up-to-date");
      }
    } catch {
      setUpdateState("error");
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return;
    setUpdateState("downloading");
    setDownloadProgress(0);
    try {
      let downloaded = 0;
      let total = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setDownloadProgress(Math.round((downloaded / total) * 100));
        } else if (event.event === "Finished") {
          setDownloadProgress(100);
        }
      });
      setUpdateState("ready");
    } catch {
      setUpdateState("error");
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <button className="back-btn" onClick={() => setAppPage("dashboard")}>← back</button>
          <h1 className="page-title">changelog</h1>
          <p className="page-subtitle">v{pkg.version} · release history</p>
        </div>
        <div className="page-header-right">
          {updateState === "idle" && (
            <button className="btn-ghost" onClick={checkForUpdate}>
              check for update
            </button>
          )}
          {updateState === "checking" && (
            <span className="muted" style={{ fontSize: 12 }}>checking…</span>
          )}
          {updateState === "up-to-date" && (
            <span className="changelog-update-badge changelog-update-ok">✓ up to date</span>
          )}
          {updateState === "available" && (
            <button className="changelog-update-badge changelog-update-new" onClick={installUpdate}>
              ↑ {pendingUpdate?.version} — install update
            </button>
          )}
          {updateState === "downloading" && (
            <span className="muted" style={{ fontSize: 12 }}>
              installing… {downloadProgress > 0 ? `${downloadProgress}%` : ""}
            </span>
          )}
          {updateState === "ready" && (
            <button className="changelog-update-badge changelog-update-new" onClick={() => relaunch()}>
              restart to apply update
            </button>
          )}
          {updateState === "error" && (
            <button className="changelog-update-badge changelog-update-err" onClick={checkForUpdate}>
              failed — retry
            </button>
          )}
        </div>
      </div>

      <article className="changelog-body">
        {blocks.map((b, i) => {
          switch (b.kind) {
            case "h1": return null;
            case "h2": return <h2 key={i} className="changelog-version">{renderInline(b.text, `h2-${i}`)}</h2>;
            case "h3": return <h3 key={i} className="changelog-category">{b.text}</h3>;
            case "p":  return <p key={i} className="changelog-p">{renderInline(b.text, `p-${i}`)}</p>;
            case "hr": return <hr key={i} className="changelog-divider" />;
            case "ul":
              return (
                <ul key={i} className="changelog-list">
                  {b.items.map((item, j) => <li key={j}>{renderInline(item, `li-${i}-${j}`)}</li>)}
                </ul>
              );
          }
        })}
      </article>
    </div>
  );
}
