/** Reporte del Dashboard como archivo PDF (A4): se arma y se descarga directo, sin pasar por el cuadro de impresión. */
export interface PdfPoint { label: string; value: number; highlight?: boolean }
export type PdfChart =
  | { kind: 'bar'; points: readonly PdfPoint[] }
  | { kind: 'line'; points: readonly PdfPoint[] }
  | { kind: 'stacked'; segments: ReadonlyArray<{ label: string; value: number; color: string }> }
  | { kind: 'hbar'; rows: ReadonlyArray<{ label: string; value: number; display: string }> };
export interface PdfSection { title: string; subtitle?: string; chart: PdfChart; table: { columns: string[]; rows: Array<Array<string | number>> }; emptyText?: string }
export interface ReportPdfInput {
  organization: string; periodLabel: string; now: Date;
  kpis: ReadonlyArray<{ label: string; value: string; hint?: string }>;
  sections: readonly PdfSection[];
}

type RGB = [number, number, number];
const INK: RGB = [14, 19, 48], INDIGO: RGB = [59, 78, 255], MINT: RGB = [0, 209, 178], GRAY: RGB = [107, 114, 128], LINE: RGB = [221, 224, 232], SOFT: RGB = [244, 245, 249];
const W = 210, H = 297, M = 14, TOP = 30, BOTTOM = 18, CW = W - 2 * M;
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** jsPDF usa fuentes estándar (Latin-1): se cambian los símbolos que no existen en ellas. */
const clean = (s: string) => s.replaceAll('−', '-').replaceAll('—', '-').replaceAll('▲', '').replaceAll('▼', '');
const nice = (m: number) => { if (m <= 0) return 1; const p = 10 ** Math.floor(Math.log10(m)); const n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

async function logoPng(): Promise<{ data: string; ratio: number } | null> {
  try {
    const img = new Image(); img.src = '/qhub-horizontal.svg'; await img.decode();
    const c = document.createElement('canvas'); c.width = 648; c.height = 224;
    c.getContext('2d')!.drawImage(img, 0, 0, 648, 224);
    return { data: c.toDataURL('image/png'), ratio: 648 / 224 };
  } catch { return null; }
}

export async function buildReportPdf(input: ReportPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const logo = await logoPng();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Reporte ${input.organization} · ${input.periodLabel}`, subject: 'Reporte de turnos', author: 'Qhub', creator: 'Qhub' });
  const generated = input.now.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short', hour12: false });
  const color = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const headed = new Set<number>();

  function header() {
    const n = doc.getNumberOfPages();
    if (headed.has(n)) return; headed.add(n);
    if (logo) doc.addImage(logo.data, 'PNG', M, 9, 9 * logo.ratio, 9); else { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); color(INK); doc.text('Qhub', M, 16); }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); color(INK); doc.text(clean(input.organization), W - M, 12.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(GRAY); doc.text(clean(`Reporte · ${input.periodLabel} · generado el ${generated}`), W - M, 17.5, { align: 'right' });
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, 22, W - M, 22);
  }
  header();
  let y = TOP;
  const ensure = (h: number) => { if (y + h > H - BOTTOM) { doc.addPage(); header(); y = TOP; } };

  // ───── indicadores
  const cols = 3, gap = 4, cw = (CW - gap * (cols - 1)) / cols, ch = 25;
  input.kpis.forEach((k, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    if (c === 0) ensure(ch + gap);
    const x = M + c * (cw + gap), yy = y + (c === 0 ? 0 : 0);
    doc.setFillColor(...SOFT); doc.setDrawColor(...LINE); doc.rect(x, yy, cw, ch, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(GRAY); doc.text(clean(k.label), x + 4, yy + 6.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(18); color(INK); doc.text(clean(k.value), x + 4, yy + 15);
    if (k.hint) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(GRAY); doc.text(doc.splitTextToSize(clean(k.hint), cw - 8).slice(0, 2), x + 4, yy + 20); }
    if (c === cols - 1 || i === input.kpis.length - 1) y += ch + gap;
    void r;
  });
  y += 2;

  // ───── gráficas
  function axisBars(points: readonly PdfPoint[], h: number, line: boolean) {
    const left = M + 9, right = W - M, top = y + 3, bottom = y + h - 7, ph = bottom - top;
    const max = nice(Math.max(0, ...points.map((p) => p.value)));
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); color(GRAY); doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    for (let i = 0; i <= 2; i++) { const gy = bottom - (ph * i) / 2; doc.line(left, gy, right, gy); doc.text(fmt((max * i) / 2), left - 2, gy + 1, { align: 'right' }); }
    const n = Math.max(points.length, 1), slot = (right - left) / n, step = Math.ceil(n / 15);
    const px = (i: number) => left + slot * i + slot / 2, py = (v: number) => bottom - (v / max) * ph;
    if (line) {
      doc.setDrawColor(...INDIGO); doc.setLineWidth(0.6);
      points.forEach((p, i) => { if (i > 0) doc.line(px(i - 1), py(points[i - 1]!.value), px(i), py(p.value)); });
      points.forEach((p, i) => { const c = p.highlight ? MINT : INDIGO; doc.setFillColor(...c); doc.circle(px(i), py(p.value), 0.9, 'F'); });
    } else {
      const bw = Math.min(slot * 0.62, 14);
      points.forEach((p, i) => { const bh = (p.value / max) * ph; if (bh > 0) { doc.setFillColor(...(p.highlight ? MINT : INDIGO)); doc.rect(px(i) - bw / 2, bottom - bh, bw, bh, 'F'); } });
    }
    doc.setFontSize(7); color(GRAY);
    points.forEach((p, i) => { if (i % step === 0) doc.text(clean(p.label), px(i), bottom + 4.5, { align: 'center' }); });
    if (n <= 15) { doc.setFontSize(7); color(INK); points.forEach((p, i) => { if (p.value > 0) doc.text(fmt(p.value), px(i), py(p.value) - 1.2, { align: 'center' }); }); }
    y += h;
  }

  for (const s of input.sections) {
    const chartH = s.chart.kind === 'stacked' ? 22 : s.chart.kind === 'hbar' ? 8 + s.chart.rows.length * 8 : 42;
    ensure(12 + chartH + 24);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); color(INK); doc.text(clean(s.title), M, y + 4);
    if (s.subtitle) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(GRAY); doc.text(clean(s.subtitle), M, y + 9); }
    y += s.subtitle ? 12 : 8;
    const c = s.chart;
    const empty = c.kind === 'bar' || c.kind === 'line' ? c.points.every((p) => p.value === 0) : c.kind === 'stacked' ? c.segments.every((x) => x.value === 0) : c.rows.length === 0;
    if (empty && s.emptyText) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9); color(GRAY); doc.text(clean(s.emptyText), M, y + 5); y += 10; }
    else if (c.kind === 'bar' || c.kind === 'line') axisBars(c.points, 42, c.kind === 'line');
    else if (c.kind === 'stacked') {
      const total = c.segments.reduce((a, x) => a + x.value, 0) || 1; let x = M;
      for (const seg of c.segments) { const w = (seg.value / total) * CW; if (w > 0) { doc.setFillColor(...hex(seg.color)); doc.rect(x, y, w, 7, 'F'); x += w; } }
      y += 12; x = M; doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      for (const seg of c.segments) { doc.setFillColor(...hex(seg.color)); doc.rect(x, y - 2.6, 3, 3, 'F'); color(INK); const t = clean(`${seg.label} · ${seg.value} (${Math.round((seg.value / total) * 100)} %)`); doc.text(t, x + 4.5, y); x += 8 + doc.getTextWidth(t); }
      y += 6;
    } else {
      const max = Math.max(1, ...c.rows.map((r) => r.value)), lw = 52, bx = M + lw, bwMax = CW - lw - 48;
      for (const r of c.rows) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(INK); doc.text(doc.splitTextToSize(clean(r.label), lw - 3).slice(0, 1), M, y + 4.2);
        doc.setFillColor(...INDIGO); doc.rect(bx, y, Math.max(0.6, (r.value / max) * bwMax), 5.5, 'F');
        color(GRAY); doc.text(clean(r.display), bx + (r.value / max) * bwMax + 2, y + 4.2); y += 8;
      }
      y += 2;
    }
    // tabla con los mismos datos
    autoTable(doc, {
      startY: y + 1, margin: { left: M, right: M, top: TOP, bottom: BOTTOM }, theme: 'grid',
      head: [s.table.columns.map(clean)], body: s.table.rows.map((r) => r.map((v) => clean(String(v)))),
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
      headStyles: { fillColor: SOFT, textColor: GRAY, fontStyle: 'bold' },
      columnStyles: Object.fromEntries(s.table.columns.map((_, i) => [i, { halign: i === 0 ? 'left' : 'right' }])),
      didDrawPage: () => header(),
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  }

  // ───── pie con número de página
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M, H - 13, W - M, H - 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); color(GRAY);
    doc.text('Qhub · Gestión de turnos', M, H - 8); doc.text(`Página ${p} de ${pages}`, W - M, H - 8, { align: 'right' });
  }
  return doc.output('blob');
}
