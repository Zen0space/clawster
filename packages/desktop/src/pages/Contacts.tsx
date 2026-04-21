import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api, type ContactList, type ImportResult } from "../lib/api";

type PreviewData = {
  headers: string[];
  rows: Record<string, string>[];
  file: File;
};

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
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

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
      <p className="drop-zone-hint">.xlsx · .xls · must have a "phone" column</p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

function PreviewTable({ preview }: { preview: PreviewData }) {
  const visibleCols = preview.headers.slice(0, 6);
  const extra = preview.headers.length - visibleCols.length;
  return (
    <div className="preview-wrap">
      <p className="preview-filename">
        {preview.file.name} <span className="muted">— {preview.rows.length} rows preview</span>
        {extra > 0 && <span className="muted"> + {extra} more column{extra > 1 ? "s" : ""}</span>}
      </p>
      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr>
              {visibleCols.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, i) => (
              <tr key={i}>
                {visibleCols.map((h) => <td key={h}>{row[h] ?? ""}</td>)}
              </tr>
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["contact-lists"] });
      onDone(result);
    },
  });

  return (
    <div className="import-form">
      <div className="import-row">
        <input
          className="auth-input"
          placeholder="list name"
          value={listName}
          onChange={(e) => setListName(e.target.value)}
        />
        <button
          className="btn-primary"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || !listName.trim()}
        >
          {importMutation.isPending ? "importing…" : "import"}
        </button>
        <button className="btn-ghost" onClick={onReset} disabled={importMutation.isPending}>
          clear
        </button>
      </div>
      {importMutation.isError && (
        <p className="auth-error">
          {importMutation.error instanceof Error ? importMutation.error.message : "import failed"}
        </p>
      )}
    </div>
  );
}

function ImportResult({ result, onReset }: { result: ImportResult; onReset: () => void }) {
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

function ContactListsTable({ lists, onDelete }: {
  lists: ContactList[];
  onDelete: (id: string) => void;
}) {
  if (lists.length === 0) {
    return (
      <div className="empty-state">
        <p>no contact lists yet</p>
        <p className="muted">import an excel file above to get started</p>
      </div>
    );
  }
  return (
    <table className="contact-lists-table">
      <thead>
        <tr>
          <th>name</th>
          <th>contacts</th>
          <th>added</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lists.map((l) => (
          <tr key={l.id}>
            <td>{l.name}</td>
            <td>{l.rowCount.toLocaleString()}</td>
            <td className="muted">{new Date(l.createdAt).toLocaleDateString()}</td>
            <td>
              <button className="btn-danger-ghost" onClick={() => onDelete(l.id)}>
                delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Contacts() {
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contact-lists"],
    queryFn: () => api.contacts.listLists(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.contacts.deleteList(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contact-lists"] }),
  });

  async function handleFile(file: File) {
    setParseError(null);
    setImportResult(null);
    try {
      const p = await parsePreview(file);
      setPreview(p);
    } catch {
      setParseError("could not read file — make sure it's a valid .xlsx");
    }
  }

  function reset() {
    setPreview(null);
    setImportResult(null);
    setParseError(null);
  }

  const lists = data?.items ?? [];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">contacts</h1>
          <p className="page-subtitle">import and manage contact lists</p>
        </div>
      </div>

      <section className="contacts-import-section">
        {!preview && !importResult && (
          <>
            <DropZone onFile={handleFile} />
            {parseError && <p className="auth-error">{parseError}</p>}
          </>
        )}

        {preview && !importResult && (
          <>
            <PreviewTable preview={preview} />
            <ImportForm
              preview={preview}
              onDone={(result) => { setPreview(null); setImportResult(result); }}
              onReset={reset}
            />
          </>
        )}

        {importResult && <ImportResult result={importResult} onReset={reset} />}
      </section>

      <section>
        <h2 className="section-title">contact lists</h2>
        {isLoading ? (
          <p className="muted">loading…</p>
        ) : (
          <ContactListsTable
            lists={lists}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        )}
      </section>
    </div>
  );
}
