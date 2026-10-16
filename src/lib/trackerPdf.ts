import { jsPDF } from 'jspdf';
import { STATUS_LABEL } from './progress';
import { type CalendarScale } from './calendar';
import { type TrackerData, type TrackerItem, type TrackerOptions } from './tracker';

const INK = '#102c56', BLUE = '#1648df', TEAL = '#007965', LINE = '#bfd3ef';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export interface TrackerLayoutHeights {
  gridHeight: number;
  undatedHeight: number;
}

/** Determines whether a Unicode codepoint is present in the embedded Latin TrueType fonts.
 * Based on the cmap format 4 tables in nunito-sans-400.ttf / nunito-sans-700.ttf.
 */
export function isSupportedPdfCode(code: number): boolean {
  if (code >= 0x20 && code <= 0x7e) return true; // Basic Latin (ASCII printable)
  if (code >= 0xa0 && code <= 0xff) return true; // Latin-1 Supplement
  if (code === 0x9 || code === 0xa || code === 0xd) return true; // Tab, newline, carriage return
  if (code === 0x102 || code === 0x131 || code === 0x152 || code === 0x153) return true; // Latin Extended-A
  if (code === 0x2bb || code === 0x2bc || code === 0x2c6 || code === 0x2da || code === 0x2dc) return true; // Modifiers
  if ((code >= 0x300 && code <= 0x301) || (code >= 0x303 && code <= 0x304) || (code >= 0x308 && code <= 0x309) || code === 0x323) return true; // Combining marks
  if (code === 0x2009 || code === 0x200b) return true; // Thin space, zero-width space
  if (code >= 0x2013 && code <= 0x2014) return true; // En-dash, em-dash
  if ((code >= 0x2018 && code <= 0x201a) || (code >= 0x201c && code <= 0x201e)) return true; // Curly quotes
  if (code === 0x2022 || code === 0x2026) return true; // Bullet, ellipsis
  if (code === 0x2032 || code === 0x2033 || code === 0x2039 || code === 0x203a || code === 0x2044) return true; // Quotes, primes, slash
  if (code === 0x20ac || code === 0x2122 || code === 0x2212 || code === 0x2215) return true; // Euro, TM, minus, division
  return false;
}

/** Check if a character or grapheme is supported by the embedded PDF fonts. */
export function isSupportedPdfChar(char: string): boolean {
  if (!char) return true;
  const code = char.codePointAt(0);
  return code !== undefined && isSupportedPdfCode(code);
}

/** Detect unsupported characters (non-Latin scripts, emoji) in a string, returning unique occurrences. */
export function detectUnsupportedCharacters(text: string): string[] {
  if (!text) return [];
  const unsupported = new Set<string>();
  for (const char of text) {
    if (!isSupportedPdfChar(char)) {
      unsupported.add(char);
    }
  }
  return Array.from(unsupported);
}

/** Returns true if text contains any character unsupported by the embedded fonts. */
export function hasUnsupportedCharacters(text: string): boolean {
  if (!text) return false;
  for (const char of text) {
    if (!isSupportedPdfChar(char)) return true;
  }
  return false;
}

/** Replace unsupported characters with a visible placeholder (e.g. '?') so jsPDF does not silently drop them. */
export function sanitizePdfText(text: string, placeholder = '?'): string {
  if (!text) return '';
  let result = '';
  for (const char of text) {
    result += isSupportedPdfChar(char) ? char : placeholder;
  }
  return result;
}

/** Scans all titles, direction, quote, labels, and checklist steps in a tracker for unsupported characters. */
export function detectTrackerUnsupported(data: TrackerData, direction?: string, quote?: string): string[] {
  const texts: string[] = [
    data.title,
    direction ?? '',
    quote ?? '',
    ...data.sections.flatMap(s => [s.title, ...s.items.flatMap(i => [i.label, ...i.task.subtasks.map(st => st.title)])]),
    ...data.undated.flatMap(i => [i.label, ...i.task.subtasks.map(st => st.title)])
  ];
  const allUnsupported = new Set<string>();
  for (const text of texts) {
    for (const char of detectUnsupportedCharacters(text)) {
      allUnsupported.add(char);
    }
  }
  return Array.from(allUnsupported);
}

/** Allocates page height between the scheduled grid and undated tasks based on content density.
 * Ensures heights are never negative, even with extreme inputs (CR-10).
 */
export function allocateTrackerSpace(
  available: number,
  scale: CalendarScale,
  datedCount: number,
  undatedCount: number,
  gap = 7,
  datedChecklistCount = 0,
  undatedChecklistCount = 0
): TrackerLayoutHeights {
  const safeAvailable = Math.max(30, available);
  if (undatedCount <= 0) {
    return { gridHeight: safeAvailable, undatedHeight: 0 };
  }
  if (datedCount <= 0) {
    if (scale === 'day') {
      const emptyDatedHeight = Math.min(50, Math.round(safeAvailable * 0.2));
      const undatedHeight = Math.max(0, safeAvailable - emptyDatedHeight - gap);
      return { gridHeight: emptyDatedHeight, undatedHeight };
    }
    const undatedHeight = Math.round(Math.min(safeAvailable * 0.45, 120));
    const gridHeight = Math.max(0, safeAvailable - undatedHeight - gap);
    return { gridHeight, undatedHeight };
  }
  if (scale === 'day') {
    const datedWeight = Math.max(1, Math.ceil((datedCount + datedChecklistCount * 0.8) / 3));
    const undatedWeight = Math.max(1, Math.ceil((undatedCount + undatedChecklistCount * 0.8) / 3));
    const totalWeight = datedWeight + undatedWeight;
    const rawFraction = undatedWeight / totalWeight;
    const fraction = Math.min(0.82, Math.max(0.18, rawFraction));
    const usable = Math.max(0, safeAvailable - gap);
    const undatedHeight = Math.round(usable * fraction);
    const gridHeight = Math.max(0, usable - undatedHeight);
    return { gridHeight, undatedHeight };
  }
  const undatedRows = Math.ceil((undatedCount + undatedChecklistCount * 0.8) / 4);
  const neededUndatedHeight = 28 + undatedRows * 22;
  const maxUndatedHeight = safeAvailable * 0.35;
  const undatedHeight = Math.min(maxUndatedHeight, Math.max(45, neededUndatedHeight));
  const gridHeight = Math.max(0, safeAvailable - undatedHeight - gap);
  return { gridHeight, undatedHeight };
}

let fontPromise: Promise<string[]> | undefined;
export function setTrackerFontsForTesting(regularBase64: string, boldBase64: string) {
  fontPromise = Promise.resolve([regularBase64, boldBase64]);
}
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
export interface TrackerDocument {
  svg: string;
  pdf: Blob;
  smallestFont: number;
  taskCount: number;
  unsupportedChars: string[];
  omittedTasks: number;
  omittedSteps: number;
}

export function formatOmissionWarning(omittedTasks: number, omittedSteps: number): string {
  const parts: string[] = [];
  if (omittedTasks > 0) {
    parts.push(`${omittedTasks} ${omittedTasks === 1 ? 'task' : 'tasks'}`);
  }
  if (omittedSteps > 0) {
    parts.push(`${omittedSteps} ${omittedSteps === 1 ? 'step' : 'steps'}`);
  }
  return `${parts.join(' and ')} didn't fit. Turn off checklists or pick a shorter period.`;
}

/** One set of layout coordinates drives both the SVG preview and the vector PDF. */
export async function buildTrackerDocument(data: TrackerData, options: TrackerOptions, direction: string, quote: string): Promise<TrackerDocument> {
  const [regular, bold] = await fonts();
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: options.paper, compress: true });
  for (const [style, base64] of [['normal', regular], ['bold', bold]]) {
    pdf.addFileToVFS(`Nunito-${style}.ttf`, base64); pdf.addFont(`Nunito-${style}.ttf`, 'TrackerSans', style);
  }
  pdf.setFont('TrackerSans', 'normal');
  const safeDocTitle = sanitizePdfText(`My Planner · ${options.scale} tracker · ${data.title}`);
  pdf.setProperties({ title: safeDocTitle, creator: 'My Planner', subject: 'One-page personal task tracker' });
  const width = pdf.internal.pageSize.getWidth(), height = pdf.internal.pageSize.getHeight();
  const margin = 22, inner = width - margin * 2, gap = 7;
  const svg: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>@font-face{font-family:TrackerSans;src:url(data:font/ttf;base64,${regular}) format('truetype');font-weight:400}@font-face{font-family:TrackerSans;src:url(data:font/ttf;base64,${bold}) format('truetype');font-weight:700}text{font-family:TrackerSans,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif,'Apple Color Emoji','Segoe UI Emoji';}</style></defs>`];

  const unsupportedChars = detectTrackerUnsupported(data, direction, quote);

  function rect(x: number, y: number, w: number, h: number, fill: string, border?: string) {
    const safeW = Math.max(0, w);
    const safeH = Math.max(0, h);
    pdf.setFillColor(fill); if (border) { pdf.setDrawColor(border); pdf.setLineWidth(.5); }
    pdf.rect(x, y, safeW, safeH, border ? 'FD' : 'F');
    svg.push(`<rect x="${x}" y="${y}" width="${safeW}" height="${safeH}" fill="${fill}"${border ? ` stroke="${border}" stroke-width="0.5"` : ''}/>`);
  }
  function text(value: string, x: number, y: number, size: number, color = INK, strong = false) {
    const safeSize = Math.max(1, size);
    const sanitized = sanitizePdfText(value);
    pdf.setFont('TrackerSans', strong ? 'bold' : 'normal'); pdf.setFontSize(safeSize); pdf.setTextColor(color); pdf.text(sanitized, x, y);
    svg.push(`<text x="${x}" y="${y}" fill="${color}" font-family="TrackerSans, system-ui, -apple-system, sans-serif" font-size="${safeSize}" font-weight="${strong ? 700 : 400}">${escape(value)}</text>`);
  }
  function lines(value: string, w: number, size: number, strong = false): string[] {
    const safeSize = Math.max(1, size);
    pdf.setFont('TrackerSans', strong ? 'bold' : 'normal'); pdf.setFontSize(safeSize);
    return pdf.splitTextToSize(value, Math.max(20, w)) as string[];
  }

  rect(0, 0, width, height, '#ffffff'); rect(0, 0, width, 8, BLUE);
  text('MY TASKER', margin, 31, 10, BLUE, true);
  text(`${options.scale.toUpperCase()} TRACKER`, width - margin - 120, 31, 10, TEAL, true);

  // CR-10: Bound title line count (max 2 lines)
  const allTitleLines = lines(data.title, inner, 22, true);
  const titleLines = allTitleLines.slice(0, 2);
  let y = 58;
  for (const line of titleLines) { text(line, margin, y, 22, INK, true); y += 25; }
  y += 1;

  // CR-10: Bound direction and quote lines (max 3 lines per quote row)
  const quoteRows = [
    direction ? { label: 'MY DIRECTION', value: direction } : null,
    { label: `DAILY REMINDER · ${options.anchor}`, value: quote }
  ].filter((r): r is { label: string; value: string } => Boolean(r));

  for (const row of quoteRows) {
    const allWrapped = lines(row.value, inner - 144, 10);
    const maxLines = 3;
    const wrapped = allWrapped.length > maxLines
      ? [...allWrapped.slice(0, maxLines - 1), allWrapped[maxLines - 1] + '…']
      : allWrapped;
    const rowHeight = Math.max(26, wrapped.length * 12 + 12);
    rect(margin, y - 10, inner, rowHeight, row.label === 'MY DIRECTION' ? '#eaf0ff' : '#fff1b8');
    text(row.label, margin + 9, y + 4, 7, INK, true);
    wrapped.forEach((line, i) => text(line, margin + 136, y + 4 + i * 12, 10));
    y += rowHeight + 4;
  }

  const scope = `${data.tasks.length} tasks · ${data.occurrenceCount} dated occurrences · ${options.area === 'All' ? 'All areas' : options.area}${options.scale === 'year' ? ' · Repeat dates grouped per month' : ''}`;
  text(scope, margin, y + 5, 8); y += 17;

  const bottom = height - 26;
  const available = Math.max(60, bottom - y);

  const datedItemsCount = data.sections.reduce((n, s) => n + s.items.length, 0);
  const datedChecklistCount = options.includeChecklist
    ? data.sections.reduce((n, s) => n + s.items.reduce((acc, it) => acc + it.task.subtasks.length, 0), 0)
    : 0;
  const undatedChecklistCount = options.includeChecklist
    ? data.undated.reduce((acc, it) => acc + it.task.subtasks.length, 0)
    : 0;

  const { gridHeight, undatedHeight } = allocateTrackerSpace(
    available,
    options.scale,
    datedItemsCount,
    data.undated.length,
    gap,
    datedChecklistCount,
    undatedChecklistCount
  );

  const columns = options.scale === 'day' ? 1 : options.scale === 'week' ? 4 : options.scale === 'month' ? 7 : 4;
  const rows = Math.ceil(data.sections.length / columns);
  const cellW = (inner - gap * (columns - 1)) / columns;
  const cellH = Math.max(25, (gridHeight - gap * (rows - 1)) / rows);
  let smallestFont = 10;
  let totalOmittedTasks = 0;
  let totalOmittedSteps = 0;

  function panel(title: string, items: TrackerItem[], x: number, top: number, w: number, h: number, countColumns = 1, outside = false): { omittedTasks: number; omittedSteps: number } {
    const safeH = Math.max(25, h);
    const safeW = Math.max(25, w);
    const rawMaxTop = top + safeH - 2;
    rect(x, top, safeW, safeH, '#ffffff', LINE);
    rect(x, top, safeW, 19, outside ? '#eaf0ff' : BLUE);
    text(title, x + 6, top + 13, 8, outside ? INK : '#ffffff', true);
    if (!items.length) {
      text('No scheduled tasks', x + 6, top + 31, Math.min(7, safeH / 5), TEAL);
      return { omittedTasks: 0, omittedSteps: 0 };
    }
    const cellWidth = (safeW - 12 - (countColumns - 1) * 9) / countColumns;
    const chunks = Array.from({ length: countColumns }, (_, i) => items.slice(i * Math.ceil(items.length / countColumns), (i + 1) * Math.ceil(items.length / countColumns)));
    const plan = (fontSize: number) => chunks.map(chunk => chunk.map(item => {
      const label = `${item.label}${item.status === 'not-started' ? '' : ` · ${STATUS_LABEL[item.status]}`}`;
      const main = lines(label, cellWidth - fontSize - 4, fontSize, true);
      const details = options.includeChecklist ? item.task.subtasks.map(s => ({ done: item.checklistCurrent && s.done, lines: lines(s.title, cellWidth - fontSize * 2 - 6, fontSize * .88) })) : [];
      return { item, main, details, height: main.length * fontSize * 1.2 + details.reduce((n, d) => n + d.lines.length * fontSize * 1.1, 0) + fontSize * .65 };
    }));

    const targetH = Math.max(12, safeH - 28);
    let size = options.scale === 'day' ? 10 : 8.5;
    let planned = plan(size);
    while (Math.max(...planned.map(chunk => chunk.reduce((n, row) => n + row.height, 0))) > targetH && size > 1.2) {
      size *= .92;
      planned = plan(size);
    }
    const contentHeight = Math.max(...planned.map(chunk => chunk.reduce((n, row) => n + row.height, 0)));
    if (contentHeight > targetH) {
      size = Math.max(1.0, size * (targetH / contentHeight));
      planned = plan(size);
    }
    smallestFont = Math.max(1.0, Math.min(smallestFont, options.includeChecklist && items.some(i => i.task.subtasks.length) ? size * .88 : size));

    // Check if everything fits in rawMaxTop
    let fitsAll = true;
    for (const chunk of planned) {
      let b = top + 25 + size;
      for (const row of chunk) {
        const rowMainH = row.main.length * size * 1.2;
        if (b + rowMainH > rawMaxTop) {
          fitsAll = false;
          break;
        }
        b += rowMainH;
        for (const step of row.details) {
          const stepH = step.lines.length * size * 1.1;
          if (b + stepH > rawMaxTop) {
            fitsAll = false;
            break;
          }
          b += stepH;
        }
        b += size * .65;
      }
      if (!fitsAll) break;
    }

    const noticeSize = Math.max(6, Math.min(7.5, size * 1.1));
    const noticeHeight = noticeSize + 5;
    const effectiveMaxTop = fitsAll ? rawMaxTop : rawMaxTop - noticeHeight;

    let panelRenderedTasks = 0;
    let panelRenderedSteps = 0;

    planned.forEach((chunk, col) => {
      const left = x + 6 + col * (cellWidth + 9);
      let baseline = top + 25 + size;
      for (const row of chunk) {
        const box = size * .7;
        const rowMainH = row.main.length * size * 1.2;
        if (baseline + rowMainH > effectiveMaxTop) break;
        panelRenderedTasks++;
        rect(left, baseline - box, box, box, row.item.completed ? TEAL : '#ffffff', row.item.completed ? TEAL : INK);
        row.main.forEach((line, i) => {
          text(line, left + size + 4, baseline + i * size * 1.2, size, row.item.completed ? TEAL : INK, true);
        });
        baseline += rowMainH;
        for (const step of row.details) {
          const stepH = step.lines.length * size * 1.1;
          if (baseline + stepH > effectiveMaxTop) break;
          panelRenderedSteps++;
          rect(left + size, baseline - box * .85, box * .75, box * .75, step.done ? TEAL : '#ffffff', TEAL);
          step.lines.forEach((line, i) => {
            text(line, left + size * 2 + 6, baseline + i * size * 1.1, size * .88);
          });
          baseline += stepH;
        }
        baseline += size * .65;
      }
    });

    const panelTotalTasks = items.length;
    const panelTotalSteps = options.includeChecklist
      ? items.reduce((n, it) => n + it.task.subtasks.length, 0)
      : 0;

    const panelOmittedTasks = Math.max(0, panelTotalTasks - panelRenderedTasks);
    const panelOmittedSteps = options.includeChecklist
      ? Math.max(0, panelTotalSteps - panelRenderedSteps)
      : 0;

    if (panelOmittedTasks > 0) {
      const noticeText = `+${panelOmittedTasks} more task${panelOmittedTasks === 1 ? '' : 's'} not shown`;
      text(noticeText, x + 6, top + safeH - 5, noticeSize, TEAL, true);
    } else if (panelOmittedSteps > 0) {
      const noticeText = `+${panelOmittedSteps} more step${panelOmittedSteps === 1 ? '' : 's'} not shown`;
      text(noticeText, x + 6, top + safeH - 5, noticeSize, TEAL, true);
    }

    return { omittedTasks: panelOmittedTasks, omittedSteps: panelOmittedSteps };
  }

  data.sections.forEach((section, i) => {
    const res = panel(section.title, section.items, margin + i % columns * (cellW + gap), y + Math.floor(i / columns) * (cellH + gap), cellW, cellH, options.scale === 'day' ? 3 : 1, section.outside);
    totalOmittedTasks += res.omittedTasks;
    totalOmittedSteps += res.omittedSteps;
  });
  if (data.undated.length && undatedHeight > 0) {
    const res = panel('UNDATED TASKS & ROUTINES · Set a date in the task editor to schedule', data.undated, margin, y + gridHeight + gap, inner, undatedHeight, options.scale === 'day' ? 3 : 4);
    totalOmittedTasks += res.omittedTasks;
    totalOmittedSteps += res.omittedSteps;
  } else if (data.undated.length > 0 && undatedHeight <= 0) {
    totalOmittedTasks += data.undated.length;
    if (options.includeChecklist) {
      totalOmittedSteps += data.undated.reduce((acc, it) => acc + it.task.subtasks.length, 0);
    }
  }

  text('Empty box = open · Filled box = complete · Checklist ticks show only the current saved occurrence', margin, height - 12, 6.5);
  text(`${options.paper.toUpperCase()} LANDSCAPE · 1 / 1`, width - 132, height - 12, 6.5, BLUE, true);
  svg.push('</svg>');
  return {
    svg: svg.join(''),
    pdf: pdf.output('blob'),
    smallestFont,
    taskCount: data.tasks.length,
    unsupportedChars,
    omittedTasks: totalOmittedTasks,
    omittedSteps: totalOmittedSteps
  };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
