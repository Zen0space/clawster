export function saveBlob(filename: string, data: BlobPart | Uint8Array, mime: string): void {
  const blob = new Blob([data] as BlobPart[], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
