/** Separador de columnas: punto y coma, que es el que Excel espera en español (con coma todo caería en una sola columna). */
export const CSV_SEP = ';';

/**
 * Un campo CSV: comillas solo cuando hace falta (separador, comilla o salto de línea). Los textos que empiezan con = + - @ se marcan
 * como texto para que una hoja de cálculo no los ejecute como fórmula (inyección de fórmulas); los números no se tocan.
 */
export const csvField = (v: unknown): string => {
  let s = v == null ? '' : typeof v === 'number' && !Number.isInteger(v) ? String(v).replace('.', ',') : String(v);   // decimales con coma, como en español
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s)) s = `'${s}`;   // números y teléfonos (+593 99…) se dejan como están
  return /[";\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Fecha y hora local legibles y que Excel reconoce: `2026-11-19 14:05:09`. Vacío si no hay fecha. */
export const csvDate = (d: Date | null | undefined): string => {
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Filas → texto CSV (separador `;`, saltos de línea de Windows y salto final). Una fila vacía ('') queda como línea en blanco. */
export const toCsv = (rows: ReadonlyArray<string | readonly unknown[]>): string =>
  `${rows.map((r) => (typeof r === 'string' ? r : r.map(csvField).join(CSV_SEP))).join('\r\n')}\r\n`;
