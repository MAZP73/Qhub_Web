/** Descarga un texto como archivo en el navegador (CSV por defecto). */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  // CSV con marca UTF-8 (BOM): sin ella Excel rompe las tildes y la ñ.
  const body = mime.startsWith('text/csv') ? `\uFEFF${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Descarga un archivo ya armado (PDF, etc.). */
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `prefijo-2026-10-17.csv`: nombre de archivo de un reporte exportado hoy. */
export const datedFilename = (prefix: string, ext = 'csv', now = new Date()): string => `${prefix}-${now.toISOString().slice(0, 10)}.${ext}`;
