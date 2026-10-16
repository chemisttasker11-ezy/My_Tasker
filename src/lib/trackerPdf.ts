import { jsPDF } from 'jspdf';
import { STATUS_LABEL } from './progress';
import { type TrackerData, type TrackerItem, type TrackerOptions } from './tracker';

const INK = '#102c56', BLUE = '#1648df', TEAL = '#007965', LINE = '#bfd3ef';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
let fontPromise: Promise<string[]> | undefined;
async function fonts() {
  if (!fontPromise) fontPromise = Promise.all([400, 700].map(async weight => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/nunito-sans-${weight}.ttf`);
    if (!response.ok) throw new Error('The tracker fonts could not be loaded. Please try again.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  })).catch(error => { fontPromise = undefined; throw error; });
  return fontPromise;
}
export interface TrackerDocument { svg: string; pdf: Blob; smallestFont: number; taskCount: number; rasterizedLines: number }

/** The bundled PDF font uses a Latin subset. Browser-rendered lines preserve unsupported glyphs. */
const requiresFallback = (value: string) => /[^\x20-\x7e\u00a0-\u00ff\u2010-\u2027\u20ac]/u.test(value);

/** Wrap fallback strings with browser font metrics rather than the Latin PDF subset's metrics. */
function wrapUnicode(value: string, width: number, size: number, strong: boolean): string[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return [value];
  ctx.font = `${strong ? '700' : '400'} ${size}px "Nunito Sans", "Noto Sans Arabic", "Noto Sans CJK SC", "Noto Color Emoji", sans-serif`;
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/u)) {
    let line = '';
    for (const letter of Array.from(paragraph)) {
      if (line && ctx.measureText(line + letter).width > Math.max(1,width)) {
        result.push(line.trimEnd()); line = letter.trimStart();
      } else line += letter;
    }
    result.push(line || ' ');
  }
  return result;
}


/** One set of layout coordinates drives both the SVG preview and the vector PDF. */
export async function buildTrackerDocument(data: TrackerData, options: TrackerOptions, direction: string, quote: string): Promise<TrackerDocument> {
  const [regular, bold] = await fonts();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.paper, compress: true });
  for (const [style, base64] of [['normal', regular], ['bold', bold]]) {
    pdf.addFileToVFS(`Nunito-${style}.ttf`, base64); pdf.addFont(`Nunito-${style}.ttf`, 'TrackerSans', style);
  }
  pdf.setFont('TrackerSans', 'normal');
  pdf.setProperties({ title: `My Tasker · ${options.scale} tracker · ${data.title}`, creator: 'My Tasker', subject: 'One-page personal task tracker' });
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  const margin = 22, inner = width - margin * 2, gap = 7;
  let rasterizedLines = 0;
  const svg: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>@font-face{font-family:TrackerSans;src:url(data:font/ttf;base64,${regular}) format('truetype');font-weight:400}@font-face{font-family:TrackerSans;src:url(data:font/ttf;base64,${bold}) format('truetype');font-weight:700}</style></defs>`];
  function rect(x: number, y: number, w: number, h: number, fill: string, border?: string) {
    pdf.setFillColor(fill); if (border) { pdf.setDrawColor(border); pdf.setLineWidth(.5); }
    pdf.rect(x, y, w, h, border ? 'FD' : 'F');
    svg.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${border ? ` stroke="${border}" stroke-width="0.5"` : ''}/>`);
  }
  function text(value: string, x: number, y: number, size: number, color = INK, strong = false) {
    if (requiresFallback(value)) {
      // Use the same rendered PNG in the SVG preview and the PDF for Unicode/emoji.
      // Browser font fallback covers scripts absent from the deliberately small PDF font.
      const scale = 3;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot render international text without a canvas context.');
      ctx.font = `${strong ? '700' : '400'} ${size}px "Nunito Sans", "Noto Sans Arabic", "Noto Sans CJK SC", "Noto Color Emoji", sans-serif`;
      const logicalW = Math.max(1, ctx.measureText(value).width + 5);
      const logicalH = size * 1.65;
      canvas.width = Math.ceil(logicalW * scale);
      canvas.height = Math.ceil(logicalH * scale);
      ctx.scale(scale, scale);
      ctx.font = `${strong ? '700' : '400'} ${size}px "Nunito Sans", "Noto Sans Arabic", "Noto Sans CJK SC", "Noto Color Emoji", sans-serif`;
      ctx.fillStyle = color;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(value, 1.5, size * 1.23);
      const imageData = canvas.toDataURL('image/png');
      pdf.addImage(imageData,'PNG', x, y - size * 1.23, logicalW, logicalH);
      svg.push(`<image x="${x}" y="${y-size*1.23}" width="${logicalW}" height="${logicalH}" href="${imageData}"><title>${escape(value)}</title></image>`);
      rasterizedLines++;
      return;
    }
    pdf.setFont('TrackerSans', strong ? 'bold' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color); pdf.text(value, x, y);
    svg.push(`<text x="${x}" y="${y}" fill="${color}" font-family="TrackerSans" font-size="${size}" font-weight="${strong ? 700 : 400}">${escape(value)}</text>`);
  }
  function lines(value: string, w: number, size: number, strong = false): string[] {
    if (requiresFallback(value)) return wrapUnicode(value, w, size, strong);
    pdf.setFont('TrackerSans', strong ? 'bold' : 'normal'); pdf.setFontSize(size);
    return pdf.splitTextToSize(value, w) as string[];
  }
  rect(0, 0, width, height, '#ffffff'); rect(0, 0, width, 8, BLUE);
  text('MY TASKER', margin, 31, 10, BLUE, true);
  text(`${options.scale.toUpperCase()} TRACKER`, width - margin - 120, 31, 10, TEAL, true);
  const titleLines = lines(data.title, inner, 22, true);
  let y = 58;
  for (const line of titleLines) { text(line, margin, y, 22, INK, true); y += 25; }
  y += 1;
  const quoteRows = [direction ? { label: 'MY DIRECTION', value: direction } : null, { label: `DAILY REMINDER · ${options.anchor}`, value: quote }].filter((r): r is { label: string; value: string } => Boolean(r));
  for (const row of quoteRows) {
    const wrapped = lines(row.value, inner - 144, 10);
    const rowHeight = Math.max(26, wrapped.length * 12 + 12);
    rect(margin, y - 10, inner, rowHeight, row.label === 'MY DIRECTION' ? '#eaf0ff' : '#fff1b8');
    text(row.label, margin + 9, y + 4, 7, INK, true);
    wrapped.forEach((line, i) => text(line, margin + 136, y + 4 + i * 12, 10));
    y += rowHeight + 4;
  }
  const scope = `${data.tasks.length} tasks · ${data.occurrenceCount} dated occurrences · ${options.area === 'All' ? 'All areas' : options.area}${options.scale === 'year' ? ' · Repeat dates grouped per month' : ''}`;
  text(scope, margin, y + 5, 8); y += 17;
  const bottom = height - 26;
  const available = bottom - y;
  // Budget vertical space according to actual content rather than a fixed 32% undated slice.
  // Sparse days with a large backlog no longer shrink all undated titles into a tiny strip.
  const demand = (items: TrackerItem[]) => items.reduce((sum,item) =>
    sum + 1 + (options.includeChecklist ? item.task.subtasks.length * .58 : 0) +
    Math.max(0, Math.ceil(item.label.length / 54) - 1) * .5, 0);
  const datedDemand = data.sections.reduce((sum,section) => sum + demand(section.items),0);
  const undatedDemand = demand(data.undated);
  const maxFraction = options.scale === 'day' ? .82 : options.scale === 'week' ? .58 : .46;
  const undatedFraction = data.undated.length
    ? Math.max(options.scale === 'day' ? .22 : .14,
      Math.min(maxFraction, undatedDemand / Math.max(1,datedDemand + undatedDemand)))
    : 0;
  const undatedHeight = available * undatedFraction;
  const gridHeight = available - undatedHeight - (undatedHeight ? gap : 0);
  const columns = options.scale === 'day' ? 1 : options.scale === 'week' ? 4 : options.scale === 'month' ? 7 : 4;
  const rows = Math.ceil(data.sections.length / columns);
  const cellW = (inner - gap * (columns - 1)) / columns, cellH = (gridHeight - gap * (rows - 1)) / rows;
  let smallestFont = 10;
  function panel(title: string, items: TrackerItem[], x: number, top: number, w: number, h: number, countColumns = 1, outside = false) {
    rect(x, top, w, h, '#ffffff', LINE);
    rect(x, top, w, 19, outside ? '#eaf0ff' : BLUE);
    text(title, x + 6, top + 13, 8, outside ? INK : '#ffffff', true);
    if (!items.length) { text('No scheduled tasks', x + 6, top + 31, Math.min(7, h / 5), TEAL); return; }
    const cellWidth = (w - 12 - (countColumns - 1) * 9) / countColumns;
    const chunks = Array.from({ length: countColumns }, (_, i) => items.slice(i * Math.ceil(items.length / countColumns), (i + 1) * Math.ceil(items.length / countColumns)));
    const plan = (fontSize: number) => chunks.map(chunk => chunk.map(item => {
      const label = `${item.label}${item.status === 'not-started' ? '' : ` · ${STATUS_LABEL[item.status]}`}`;
      const main = lines(label, cellWidth - fontSize - 4, fontSize, true);
      const details = options.includeChecklist ? item.task.subtasks.map(s => ({ done: item.checklistCurrent && s.done, lines: lines(s.title, cellWidth - fontSize * 2 - 6, fontSize * .88) })) : [];
      return { item, main, details, height: main.length * fontSize * 1.2 + details.reduce((n, d) => n + d.lines.length * fontSize * 1.1, 0) + fontSize * .65 };
    }));
    let size = options.scale === 'day' ? 10 : 8.5;
    let planned = plan(size);
    const contentBudget = Math.max(7, h - 28);
    while (Math.max(...planned.map(chunk => chunk.reduce((n, row) => n + row.height, 0))) > contentBudget && size > .65) { size *= .92; planned = plan(size); }
    // For unusually large boards, grow the virtual content space then proportionally fit it.
    const contentHeight = Math.max(...planned.map(chunk => chunk.reduce((n, row) => n + row.height, 0)));
    if (contentHeight > contentBudget) { size *= contentBudget / contentHeight; planned = plan(size); }
    smallestFont = Math.min(smallestFont, options.includeChecklist && items.some(i => i.task.subtasks.length) ? size * .88 : size);
    planned.forEach((chunk, col) => {
      const left = x + 6 + col * (cellWidth + 9); let baseline = top + 25 + size;
      for (const row of chunk) {
        const box = size * .7;
        rect(left, baseline - box, box, box, row.item.completed ? TEAL : '#ffffff', row.item.completed ? TEAL : INK);
        row.main.forEach((line, i) => text(line, left + size + 4, baseline + i * size * 1.2, size, row.item.completed ? TEAL : INK, true));
        baseline += row.main.length * size * 1.2;
        for (const step of row.details) {
          rect(left + size, baseline - box * .85, box * .75, box * .75, step.done ? TEAL : '#ffffff', TEAL);
          step.lines.forEach((line, i) => text(line, left + size * 2 + 6, baseline + i * size * 1.1, size * .88));
          baseline += step.lines.length * size * 1.1;
        }
        baseline += size * .65;
      }
    });
  }
  data.sections.forEach((section, i) => panel(section.title, section.items, margin + i % columns * (cellW + gap), y + Math.floor(i / columns) * (cellH + gap), cellW, cellH, options.scale === 'day' ? Math.min(3, Math.max(1, Math.ceil(section.items.length/7))) : 1, section.outside));
  if (data.undated.length) panel('UNDATED TASKS & ROUTINES · Set a date in the task editor to schedule', data.undated, margin, y + gridHeight + gap, inner, undatedHeight, options.scale === 'day' ? 3 : 4);
  text('Empty box = open · Filled box = complete · Checklist ticks show only the current saved occurrence', margin, height - 12, 6.5);
  text(`${options.paper.toUpperCase()} LANDSCAPE · 1 / 1`, width - 132, height - 12, 6.5, BLUE, true);
  svg.push('</svg>');
  return { svg: svg.join(''), pdf: pdf.output('blob'), smallestFont, taskCount: data.tasks.length, rasterizedLines };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
