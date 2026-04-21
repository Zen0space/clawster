import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { writeFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { api, type ContactList, type ImportResult } from "../lib/api";

type Tab = "excel" | "manual";

// ── helpers ────────────────────────────────────────────────────────────────

type PreviewData = { headers: string[]; rows: Record<string, string>[]; file: File };

function parsePreview(file: File): Promise<PreviewData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array", raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: false, defval: "" });
        if (json.length < 1) { reject(new Error("empty sheet")); return; }
        const headers = (json[0] as string[]).map((h) => String(h ?? "").toLowerCase().trim());
        const rows = json.slice(1, 21).map((row) => {
          const obj: Record<string, string> = {};
          (row as (string | number | null)[]).forEach((cell, i) => {
            if (headers[i]) obj[headers[i]] = String(cell ?? "");
          });
          return obj;
        });
        resolve({ headers: headers.filter(Boolean), rows, file });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function downloadTemplate(): Promise<void> {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["phone", "name"],
    ["+60123456789", "Ahmad Razif"],
    ["+60198765432", "Siti Nurhaliza"],
    ["+60112223334", "Raju Krishnan"],
  ]);
  ws["!cols"] = [{ wch: 22 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, ws, "Contacts");
  const data: Uint8Array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  await writeFile("contacts_template.xlsx", data, { baseDir: BaseDirectory.Download });
}

// ── Toast ──────────────────────────────────────────────────────────────────

type ToastData = { message: string; type: "success" | "error" };

function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.type}`}>
      <span className="toast-icon">{toast.type === "success" ? "✓" : "✕"}</span>
      <span>{toast.message}</span>
    </div>
  );
}

// ── Excel tab ──────────────────────────────────────────────────────────────

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }
  return (
    <div
      className={`drop-zone${dragging ? " drag-over" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <span className="drop-zone-icon">⬆</span>
      <p className="drop-zone-text">drop excel file here or click to browse</p>
      <p className="drop-zone-hint">.xlsx · .xls · must include a "phone" column</p>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </div>
  );
}

function PreviewTable({ preview }: { preview: PreviewData }) {
  const visibleCols = preview.headers.slice(0, 6);
  const extra = preview.headers.length - visibleCols.length;
  return (
    <div className="preview-wrap">
      <p className="preview-filename">
        {preview.file.name}
        <span className="muted"> — {preview.rows.length} rows preview</span>
        {extra > 0 && <span className="muted"> + {extra} more column{extra > 1 ? "s" : ""}</span>}
      </p>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead><tr>{visibleCols.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i}>{visibleCols.map((h) => <td key={h}>{row[h] ?? ""}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ImportForm({ preview, onDone, onReset }: {
  preview: PreviewData;
  onDone: (result: ImportResult) => void;
  onReset: () => void;
}) {
  const [listName, setListName] = useState(preview.file.name.replace(/\.(xlsx|xls)$/i, ""));
  const queryClient = useQueryClient();
  const importMutation = useMutation({
    mutationFn: () => api.contacts.import(preview.file, listName),
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ["contact-lists"] }); onDone(result); },
  });
  return (
    <div className="import-form">
      <div className="import-row">
        <input className="auth-input" placeholder="list name" value={listName}
          onChange={(e) => setListName(e.target.value)} />
        <button className="btn-primary" onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !listName.trim()}>
          {importMutation.isPending ? "importing…" : "import"}
        </button>
        <button className="btn-ghost" onClick={onReset} disabled={importMutation.isPending}>clear</button>
      </div>
      {importMutation.isError && (
        <p className="auth-error">
          {importMutation.error instanceof Error ? importMutation.error.message : "import failed"}
        </p>
      )}
    </div>
  );
}

function ImportResultCard({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  const [showInvalid, setShowInvalid] = useState(false);
  return (
    <div className="import-result">
      <div className="import-result-header">
        <span className="import-result-count">
          <span className="success-dot" />
          {result.imported} / {result.total} contacts imported
        </span>
        <button className="btn-ghost" onClick={onReset}>import another</button>
      </div>
      {result.invalid.length > 0 && (
        <div className="invalid-section">
          <button className="invalid-toggle" onClick={() => setShowInvalid((v) => !v)}>
            {result.invalid.length} invalid row{result.invalid.length > 1 ? "s" : ""}
            {showInvalid ? " ▲" : " ▼"}
          </button>
          {showInvalid && (
            <ul className="invalid-list">
              {result.invalid.slice(0, 50).map((r) => (
                <li key={r.row} className="invalid-item">
                  <span className="invalid-row">row {r.row}</span> {r.reason}
                </li>
              ))}
              {result.invalid.length > 50 && (
                <li className="muted">…and {result.invalid.length - 50} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ExcelTab() {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dlSaving, setDlSaving] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  function showToast(data: ToastData) {
    setToast(data);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleFile(file: File) {
    setParseError(null);
    setImportResult(null);
    try {
      setPreview(await parsePreview(file));
    } catch {
      setParseError("could not read file — make sure it's a valid .xlsx");
    }
  }

  function reset() { setPreview(null); setImportResult(null); setParseError(null); }

  async function handleDownload() {
    setDlSaving(true);
    try {
      await downloadTemplate();
      showToast({ message: "template saved to Downloads/contacts_template.xlsx", type: "success" });
    } catch {
      showToast({ message: "could not save template — check permissions", type: "error" });
    } finally {
      setDlSaving(false);
    }
  }

  return (
    <>
      <Toast toast={toast} />
      <div className="contacts-import-section">
        <div className="import-section-header">
          <p className="muted">file must have a "phone" column — name and custom columns are optional</p>
          <button className="btn-ghost" onClick={handleDownload} disabled={dlSaving}>
            {dlSaving ? "saving…" : "↓ download template"}
          </button>
        </div>

        {!preview && !importResult && (
          <>
            <DropZone onFile={handleFile} />
            {parseError && <p className="auth-error">{parseError}</p>}
          </>
        )}
        {preview && !importResult && (
          <>
            <PreviewTable preview={preview} />
            <ImportForm preview={preview}
              onDone={(r) => { setPreview(null); setImportResult(r); }}
              onReset={reset} />
          </>
        )}
        {importResult && <ImportResultCard result={importResult} onReset={reset} />}
      </div>
    </>
  );
}

// ── Manual add tab ─────────────────────────────────────────────────────────

function ManualTab({ lists }: { lists: ContactList[] }) {
  const queryClient = useQueryClient();
  const [selectedListId, setSelectedListId] = useState(lists[0]?.id ?? "__new__");
  const [newListName, setNewListName] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [addedCount, setAddedCount] = useState(0);

  const isNewList = selectedListId === "__new__" || lists.length === 0;

  const addMutation = useMutation({
    mutationFn: async () => {
      let listId = selectedListId;
      if (isNewList) {
        const created = await api.contacts.createList(newListName.trim());
        listId = created.id;
        setSelectedListId(created.id);
        setNewListName("");
      }
      return api.contacts.addContact(listId, phone.trim(), name.trim() || undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      setPhone("");
      setName("");
      setAddedCount((n) => n + 1);
    },
  });

  const canSubmit = phone.trim().length > 0 && (isNewList ? newListName.trim().length > 0 : true);

  return (
    <div className="manual-section">
      <div className="manual-form">
        <div className="auth-field">
          <label className="auth-label">contact list</label>
          {lists.length > 0 ? (
            <select
              className="select-input"
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name} ({l.rowCount.toLocaleString()})</option>
              ))}
              <option value="__new__">+ create new list</option>
            </select>
          ) : null}
          {isNewList && (
            <input
              className="auth-input"
              placeholder="new list name"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              style={{ marginTop: lists.length > 0 ? "10px" : "0" }}
            />
          )}
        </div>

        <div className="auth-field">
          <label className="auth-label">phone number</label>
          <input
            className="auth-input"
            placeholder="+60123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) addMutation.mutate(); }}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">name <span className="muted">(optional)</span></label>
          <input
            className="auth-input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) addMutation.mutate(); }}
          />
        </div>

        <div className="manual-actions">
          <button className="btn-primary" onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !canSubmit}>
            {addMutation.isPending ? "adding…" : "add contact"}
          </button>
          {addedCount > 0 && !addMutation.isPending && (
            <span className="added-feedback">
              <span className="success-dot" style={{ width: 8, height: 8 }} />
              {addedCount} added this session
            </span>
          )}
        </div>

        {addMutation.isError && (
          <p className="auth-error">
            {addMutation.error instanceof Error ? addMutation.error.message : "failed to add contact"}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Contact lists table ────────────────────────────────────────────────────

function ContactsInList({ listId }: { listId: string }) {
  const [limit, setLimit] = useState(20);
  const { data, isFetching } = useQuery({
    queryKey: ["contacts", listId, limit],
    queryFn: () => api.contacts.listContacts(listId, 1, limit),
  });

  if (!data) return <p className="muted" style={{ padding: "12px 0" }}>loading…</p>;
  if (data.items.length === 0) return <p className="muted" style={{ padding: "12px 0" }}>no contacts in this list yet</p>;

  return (
    <div className="contacts-inner-wrap">
      <table className="contacts-inner-table">
        <thead>
          <tr><th>phone</th><th>name</th></tr>
        </thead>
        <tbody>
          {data.items.map((c) => (
            <tr key={c.id}>
              <td className="contact-phone">{c.phoneE164}</td>
              <td className="contact-name">{c.name ?? <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.total > limit && (
        <button className="load-more" onClick={() => setLimit((n) => n + 20)} disabled={isFetching}>
          {isFetching ? "loading…" : `show more (${data.total - limit} remaining)`}
        </button>
      )}
      {data.total > 0 && (
        <p className="contacts-inner-count">showing {Math.min(limit, data.total)} of {data.total.toLocaleString()}</p>
      )}
    </div>
  );
}

function ContactListsTable({ lists, onDelete }: { lists: ContactList[]; onDelete: (id: string) => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (lists.length === 0) {
    return (
      <div className="empty-state">
        <p>no contact lists yet</p>
        <p className="muted">import an excel file or add contacts manually above</p>
      </div>
    );
  }

  return (
    <table className="contact-lists-table">
      <thead>
        <tr><th /><th>name</th><th>contacts</th><th>added</th><th /></tr>
      </thead>
      <tbody>
        {lists.map((l) => {
          const expanded = expandedId === l.id;
          return (
            <React.Fragment key={l.id}>
              <tr
                className={`list-row${expanded ? " expanded" : ""}`}
                onClick={() => toggle(l.id)}
              >
                <td className="expand-cell">
                  <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
                </td>
                <td className="list-name-cell">{l.name}</td>
                <td>{l.rowCount.toLocaleString()}</td>
                <td className="muted">{new Date(l.createdAt).toLocaleDateString()}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn-danger-ghost" onClick={() => onDelete(l.id)}>delete</button>
                </td>
              </tr>
              {expanded && (
                <tr className="contacts-expand-row">
                  <td colSpan={5}>
                    <ContactsInList listId={l.id} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function Contacts() {
  const [tab, setTab] = useState<Tab>("excel");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => api.contacts.listLists(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.contacts.deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact-lists"] }),
  });

  const lists = data?.items ?? [];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">contacts</h1>
          <p className="page-subtitle">import and manage contact lists</p>
        </div>
      </div>

      <div className="tab-bar">
        <button className={`tab-item${tab === "excel" ? " active" : ""}`} onClick={() => setTab("excel")}>
          excel import
        </button>
        <button className={`tab-item${tab === "manual" ? " active" : ""}`} onClick={() => setTab("manual")}>
          add one by one
        </button>
      </div>

      {tab === "excel" && <ExcelTab />}
      {tab === "manual" && <ManualTab lists={lists} />}

      <section>
        <h2 className="section-title">contact lists</h2>
        {isLoading ? (
          <p className="muted">loading…</p>
        ) : (
          <ContactListsTable lists={lists} onDelete={(id) => deleteMutation.mutate(id)} />
        )}
      </section>
    </div>
  );
}
