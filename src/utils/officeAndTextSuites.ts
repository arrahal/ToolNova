import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';
import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import mammoth from 'mammoth';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// ============================================================================
// 1. WORD (.DOCX) PROBLEM-SOLVING TOOLS
// ============================================================================

export interface WordDoctorOptions {
  fixBrokenLines: boolean;
  normalizeSpaces: boolean;
  fixArabicPunctuation: boolean;
  autoDetectHeadings: boolean;
  fontFamily: 'Calibri' | 'Arial' | 'Cairo';
  lineSpacing: 1.15 | 1.5 | 2.0;
}

export interface WordMergeFileItem {
  id: string;
  name: string;
  text: string;
}

export async function extractTextFromDocxOrTextFile(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (lower.endsWith('.docx')) {
    try {
      const res = await mammoth.extractRawText({ arrayBuffer: buf });
      if (res.value && res.value.trim()) {
        return res.value;
      }
    } catch {
      // fallback
    }
  }
  return new TextDecoder('utf-8').decode(buf);
}

export function cleanAndRepairWordText(
  rawText: string,
  opts: WordDoctorOptions
): {
  cleanedText: string;
  stats: {
    originalWords: number;
    cleanedWords: number;
    brokenLinesMerged: number;
    spacesFixed: number;
    headingsDetected: number;
  };
} {
  let text = rawText.replace(/\r\n/g, '\n');
  const origWords = text.trim() ? text.trim().split(/\s+/).length : 0;

  let spacesFixed = 0;
  let brokenLinesMerged = 0;
  let headingsDetected = 0;

  if (opts.normalizeSpaces) {
    const matches = text.match(/[ \t]{2,}/g);
    spacesFixed = matches ? matches.length : 0;
    text = text.replace(/[ \t]{2,}/g, ' ');
    text = text
      .split('\n')
      .map((l) => l.trim())
      .join('\n');
  }

  if (opts.fixArabicPunctuation) {
    // Fix space before Arabic/Latin punctuation and ensure space after
    text = text.replace(/\s+([،؛؟.,!:])/g, '$1');
    text = text.replace(/([،؛؟])([^\s\n])/g, '$1 $2');
  }

  if (opts.fixBrokenLines) {
    const lines = text.split('\n');
    const merged: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const curr = lines[i].trim();
      if (!curr) {
        merged.push('');
        continue;
      }
      const prev = merged.length > 0 ? merged[merged.length - 1] : '';
      const prevEndsSentence = /[.!؟:;،\-]$/.test(prev);
      const currLooksLikeHeading =
        curr.length < 55 &&
        (curr === curr.toUpperCase() ||
          /^(#|الفصل|المبحث|أولاً|ثانياً|ثالثاً|\d+[\.\-])/i.test(curr));

      if (
        prev &&
        !prevEndsSentence &&
        !currLooksLikeHeading &&
        prev.length > 25 &&
        !/^[•\-\*]/.test(curr)
      ) {
        merged[merged.length - 1] = `${prev} ${curr}`;
        brokenLinesMerged++;
      } else {
        merged.push(curr);
      }
    }
    text = merged.replace ? merged.join('\n') : merged.join('\n');
  }

  // Collapse 3+ blank lines into 2
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  const finalLines = text.split('\n');
  for (const l of finalLines) {
    const trimmed = l.trim();
    if (
      trimmed.length > 2 &&
      trimmed.length < 65 &&
      (trimmed.startsWith('#') ||
        trimmed === trimmed.toUpperCase() ||
        /^(Summary|Introduction|Conclusion|Profile|Experience|Education|ملخص|مقدمة|خاتمة|الخبرات|التعليم|المهارات)/i.test(
          trimmed
        ))
    ) {
      headingsDetected++;
    }
  }

  const cleanedWords = text.trim() ? text.trim().split(/\s+/).length : 0;

  return {
    cleanedText: text,
    stats: {
      originalWords: origWords,
      cleanedWords,
      brokenLinesMerged,
      spacesFixed,
      headingsDetected,
    },
  };
}

export async function exportStructuredWordDocx(
  title: string,
  paragraphsText: string,
  opts: WordDoctorOptions
): Promise<Uint8Array> {
  const lines = paragraphsText.split(/\r?\n/);
  const children: Paragraph[] = [];

  // Document Main Header
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 240 },
      border: {
        bottom: {
          color: 'E5322D',
          space: 6,
          style: BorderStyle.SINGLE,
          size: 12,
        },
      },
      children: [
        new TextRun({
          text: title,
          bold: true,
          size: 32,
          font: opts.fontFamily,
          color: '111827',
        }),
      ],
    })
  );

  for (const rawLine of lines) {
    const clean = rawLine.trim();
    if (!clean) {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    const isHeading =
      opts.autoDetectHeadings &&
      clean.length < 65 &&
      (clean.startsWith('#') ||
        (clean === clean.toUpperCase() && /[A-Z]/.test(clean)) ||
        /^(Summary|Introduction|Conclusion|Profile|Experience|Education|ملخص|مقدمة|خاتمة|الخبرات|التعليم|المهارات)/i.test(
          clean
        ));

    const hasArabic = /[\u0600-\u06FF]/.test(clean);

    if (isHeading) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          bidirectional: hasArabic,
          alignment: hasArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 260, after: 120 },
          children: [
            new TextRun({
              text: clean.replace(/^#+\s*/, ''),
              bold: true,
              size: 26,
              font: opts.fontFamily,
              color: '1E293B',
            }),
          ],
        })
      );
    } else {
      children.push(
        new Paragraph({
          bidirectional: hasArabic,
          alignment: hasArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: {
            after: 160,
            line: Math.round(opts.lineSpacing * 240),
          },
          children: [
            new TextRun({
              text: clean,
              size: 22,
              font: opts.fontFamily,
              color: '334155',
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

export async function mergeMultipleWordDocumentsToDocx(
  items: WordMergeFileItem[],
  addPageBreaks: boolean,
  addTableOfContentsHeader: boolean
): Promise<Uint8Array> {
  const children: Paragraph[] = [];

  if (addTableOfContentsHeader) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'ToolNova Merged Master Document — Table of Sections',
            bold: true,
            size: 30,
            color: 'E5322D',
          }),
        ],
      })
    );

    items.forEach((item, idx) => {
      children.push(
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `${idx + 1}. ${item.name}`,
              bold: true,
              size: 22,
              color: '1E293B',
            }),
          ],
        })
      );
    });

    children.push(
      new Paragraph({
        pageBreakBefore: addPageBreaks,
        children: [],
      })
    );
  }

  items.forEach((item, idx) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: idx > 0 && addPageBreaks,
        spacing: { before: 240, after: 180 },
        border: {
          bottom: {
            color: 'CBD5E1',
            space: 4,
            style: BorderStyle.SINGLE,
            size: 8,
          },
        },
        children: [
          new TextRun({
            text: `Section ${idx + 1}: ${item.name.replace(/\.[^/.]+$/, '')}`,
            bold: true,
            size: 28,
            color: '0F172A',
          }),
        ],
      })
    );

    const lines = item.text.split(/\r?\n/);
    for (const line of lines) {
      const clean = line.trim();
      if (!clean) continue;
      const hasArabic = /[\u0600-\u06FF]/.test(clean);
      children.push(
        new Paragraph({
          bidirectional: hasArabic,
          alignment: hasArabic ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { after: 140, line: 300 },
          children: [
            new TextRun({
              text: clean,
              size: 22,
              color: '334155',
            }),
          ],
        })
      );
    }
  });

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}

// ============================================================================
// 2. EXCEL (.XLSX / .CSV) PROBLEM-SOLVING TOOLS
// ============================================================================

export interface ExcelCleanerOptions {
  removeDuplicateRows: boolean;
  trimWhitespace: boolean;
  removeEmptyRows: boolean;
  standardizeTextCase: 'none' | 'title' | 'upper' | 'lower';
  highlightHeaderColor: string;
}

export interface SpreadsheetGridData {
  headers: string[];
  rows: string[][];
}

export const SAMPLE_DIRTY_EXCEL_DATA: SpreadsheetGridData = {
  headers: ['Full Name', 'Department', 'Email Address', 'Monthly Salary ($)', 'Status'],
  rows: [
    ['  arrahal lahcen  ', 'Quality Control', 'arrahallahcen17@gmail.com', '4200', 'Active'],
    ['arrahal lahcen', 'Quality Control', 'arrahallahcen17@gmail.com', '4200', 'Active'],
    ['   sara benali ', ' R&D Lab ', 'SARA.BENALI@COMPANY.MA ', '3850', 'Active'],
    ['', '', '', '', ''],
    ['youssef el amrani', 'Logistics & Supply', 'youssef.amrani@company.ma', '3100', 'Pending'],
    ['fatima zahra idrissi  ', 'Quality Control', 'f.idrissi@company.ma', '4500', 'Active'],
    ['youssef el amrani', 'Logistics & Supply', 'youssef.amrani@company.ma', '3100', 'Pending'],
    ['karim tazi', 'Production Engineering', 'karim.tazi@company.ma', '5100', 'Active'],
  ],
};

export function cleanSpreadsheetGrid(
  input: SpreadsheetGridData,
  opts: ExcelCleanerOptions
): {
  cleaned: SpreadsheetGridData;
  duplicatesRemoved: number;
  emptyRowsRemoved: number;
  cellsTrimmed: number;
} {
  let duplicatesRemoved = 0;
  let emptyRowsRemoved = 0;
  let cellsTrimmed = 0;

  const toTitleCase = (s: string) =>
    s.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());

  const processedRows: string[][] = [];
  const seenKeys = new Set<string>();

  for (const row of input.rows) {
    const newRow = row.map((cell) => {
      let c = cell ?? '';
      if (opts.trimWhitespace) {
        const trimmed = c.replace(/\s+/g, ' ').trim();
        if (trimmed !== c) cellsTrimmed++;
        c = trimmed;
      }
      if (opts.standardizeTextCase !== 'none' && c && !c.includes('@') && isNaN(Number(c))) {
        if (opts.standardizeTextCase === 'title') c = toTitleCase(c);
        else if (opts.standardizeTextCase === 'upper') c = c.toUpperCase();
        else if (opts.standardizeTextCase === 'lower') c = c.toLowerCase();
      }
      return c;
    });

    const isAllEmpty = newRow.every((c) => c.trim() === '');
    if (opts.removeEmptyRows && isAllEmpty) {
      emptyRowsRemoved++;
      continue;
    }

    const rowKey = newRow.map((c) => c.toLowerCase().trim()).join('||');
    if (opts.removeDuplicateRows) {
      if (seenKeys.has(rowKey)) {
        duplicatesRemoved++;
        continue;
      }
      seenKeys.add(rowKey);
    }

    processedRows.push(newRow);
  }

  return {
    cleaned: {
      headers: input.headers,
      rows: processedRows,
    },
    duplicatesRemoved,
    emptyRowsRemoved,
    cellsTrimmed,
  };
}

export async function parseUploadedExcelOrCsv(file: File): Promise<SpreadsheetGridData> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    try {
      const buf = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      if (ws) {
        const allRows: string[][] = [];
        ws.eachRow({ includeEmpty: true }, (row) => {
          const vals = Array.isArray(row.values) ? row.values.slice(1) : [];
          allRows.push(
            vals.map((v) =>
              v === null || v === undefined
                ? ''
                : typeof v === 'object' && 'text' in v
                ? String((v as { text: string }).text)
                : String(v)
            )
          );
        });
        if (allRows.length > 0) {
          return {
            headers: allRows[0],
            rows: allRows.slice(1),
          };
        }
      }
    } catch {
      // fallback to text parse
    }
  }

  const rawText = await file.text();
  return parseCsvOrJsonToGrid(rawText);
}

export function parseCsvOrJsonToGrid(rawText: string): SpreadsheetGridData {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
        const headers = Object.keys(arr[0]);
        const rows = arr.map((obj) =>
          headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? String(obj[h]) : ''))
        );
        return { headers, rows };
      }
    } catch {
      // fallback to CSV
    }
  }

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return SAMPLE_DIRTY_EXCEL_DATA;
  }
  const delimiter = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const splitLine = (l: string) => l.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(splitLine);
  return { headers, rows };
}

export async function exportGridToStyledExcelBytes(
  grid: SpreadsheetGridData,
  sheetTitle = 'Cleaned Data',
  headerHex = '10B981'
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ToolNova Excel Studio';
  const ws = wb.addWorksheet(sheetTitle);

  const headerRow = ws.addRow(grid.headers);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${headerHex.replace('#', '')}` },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  grid.rows.forEach((r, idx) => {
    const rowValues = r.map((val) => {
      const num = Number(val);
      return val.trim() !== '' && !isNaN(num) ? num : val;
    });
    const added = ws.addRow(rowValues);
    added.height = 21;
    added.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });
  });

  ws.columns.forEach((col) => {
    col.width = 24;
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function exportGridToPdfBytes(
  grid: SpreadsheetGridData,
  title = 'Excel Spreadsheet Report'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const page = pdfDoc.addPage([842, 595]); // Landscape A4
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: 0,
    y: height - 58,
    width,
    height: 58,
    color: rgb(0.06, 0.45, 0.32),
  });

  page.drawText(title, {
    x: 36,
    y: height - 36,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const cols = Math.max(1, grid.headers.length);
  const tableWidth = width - 72;
  const colWidth = tableWidth / cols;
  let y = height - 95;

  // Draw Header Row
  page.drawRectangle({
    x: 36,
    y: y - 6,
    width: tableWidth,
    height: 26,
    color: rgb(0.08, 0.15, 0.26),
  });

  grid.headers.forEach((h, cIdx) => {
    const safeH = h.replace(/[^\x20-\x7E]/g, '').slice(0, 22);
    page.drawText(safeH || `Col ${cIdx + 1}`, {
      x: 42 + cIdx * colWidth,
      y: y + 3,
      size: 9.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  });

  y -= 26;

  grid.rows.slice(0, 18).forEach((row, rIdx) => {
    page.drawRectangle({
      x: 36,
      y: y - 6,
      width: tableWidth,
      height: 22,
      color: rIdx % 2 === 0 ? rgb(0.98, 0.99, 1) : rgb(0.94, 0.96, 0.98),
    });
    row.forEach((cell, cIdx) => {
      if (cIdx >= cols) return;
      const safeCell = String(cell ?? '')
        .replace(/[^\x20-\x7E]/g, '')
        .slice(0, 25);
      page.drawText(safeCell, {
        x: 42 + cIdx * colWidth,
        y: y + 2,
        size: 8.8,
        font: fontRegular,
        color: rgb(0.15, 0.2, 0.28),
      });
    });
    y -= 22;
  });

  return await pdfDoc.save();
}

// ============================================================================
// 3. POWERPOINT (.PPTX) PROBLEM-SOLVING TOOLS
// ============================================================================

export interface PresentationSlideDraft {
  title: string;
  bullets: string[];
  notes?: string;
}

export const SAMPLE_PRESENTATION_OUTLINE = `# Project Quality & Process Optimization
- Real-time monitoring of physicochemical parameters (pH, density, conductivity)
- Zero-defect compliance with international QHSE laboratory standards
- Automated anomaly detection and instant corrective reporting

# Key Operational Milestones (Q1 - Q4)
- Reduced sample turnaround time by 38% across regional laboratories
- Standardized Excel & PDF reporting pipelines for 12 field teams
- Achieved 99.4% audit accuracy in quarterly industrial inspections

# Next Strategic Steps & Action Plan
- Deploy automated client-side document workflows across all departments
- Expand quality control training and safety certification modules
- Finalize annual performance dashboard for executive review`;

export function parseOutlineToSlides(rawOutline: string): PresentationSlideDraft[] {
  const lines = rawOutline.split(/\r?\n/);
  const slides: PresentationSlideDraft[] = [];
  let current: PresentationSlideDraft | null = null;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (t.startsWith('#') || (t.length < 60 && !t.startsWith('-') && !t.startsWith('•') && !current)) {
      if (current) slides.push(current);
      current = {
        title: t.replace(/^#+\s*/, '').trim(),
        bullets: [],
      };
    } else {
      if (!current) {
        current = { title: 'Executive Overview', bullets: [] };
      }
      current.bullets.push(t.replace(/^[\-\*•\d\.]+\s*/, '').trim());
    }
  }
  if (current) slides.push(current);
  return slides.length > 0
    ? slides
    : [{ title: 'Presentation Slide 1', bullets: ['Add your bullet points on the left panel'] }];
}

export async function generatePptxFromOutline(
  deckTitle: string,
  slides: PresentationSlideDraft[],
  theme: 'crimson-exec' | 'navy-corporate' | 'minimal-light'
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'ToolNova Presentation Studio';
  pptx.title = deckTitle;

  const palette =
    theme === 'navy-corporate'
      ? { bg: '0F172A', card: '1E293B', title: 'FFFFFF', accent: 'F97316', text: 'E2E8F0' }
      : theme === 'minimal-light'
      ? { bg: 'F8FAFC', card: 'FFFFFF', title: '0F172A', accent: '2563EB', text: '334155' }
      : { bg: 'FFFFFF', card: 'FFF5F5', title: '111827', accent: 'E5322D', text: '334155' };

  // Title Cover Slide
  const cover = pptx.addSlide();
  cover.background = { color: palette.bg };
  cover.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 0.45,
    h: 5.625,
    fill: { color: palette.accent },
  });
  cover.addText(deckTitle, {
    x: 1.0,
    y: 1.8,
    w: 8.2,
    h: 1.2,
    fontSize: 32,
    bold: true,
    color: palette.title,
  });
  cover.addText(`Generated via ToolNova Instant Slide Builder · ${slides.length} Content Slides`, {
    x: 1.0,
    y: 3.1,
    w: 7.5,
    h: 0.5,
    fontSize: 14,
    color: palette.accent,
  });

  // Content Slides
  slides.forEach((s, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };

    // Top Accent Bar
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.6,
      y: 0.5,
      w: 8.8,
      h: 0.06,
      fill: { color: palette.accent },
    });

    slide.addText(`${idx + 1}. ${s.title}`, {
      x: 0.6,
      y: 0.7,
      w: 8.8,
      h: 0.65,
      fontSize: 22,
      bold: true,
      color: palette.title,
    });

    const bulletObjects = s.bullets.map((b) => ({
      text: b,
      options: {
        bullet: true,
        fontSize: 15,
        color: palette.text,
        breakLine: true,
        paraSpaceAfter: 12,
      },
    }));

    if (bulletObjects.length > 0) {
      slide.addText(bulletObjects, {
        x: 0.8,
        y: 1.6,
        w: 8.4,
        h: 3.4,
        valign: 'top',
      });
    }
  });

  const out = await pptx.write({ outputType: 'arraybuffer' });
  return new Uint8Array(out as ArrayBuffer);
}

// ============================================================================
// 4. IMAGE PROBLEM-SOLVING TOOLS (ID PHOTO MAKER, WATERMARK/PRIVACY BLUR, SOCIAL RESIZER)
// ============================================================================

export function renderPassportIdPhotoSheet(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  options: {
    sizePreset: '35x45mm' | '2x2inch' | '30x40mm';
    backdropColor: '#FFFFFF' | '#DBEAFE' | '#F1F5F9' | '#FEE2E2';
    layoutMode: 'single' | 'sheet-4' | 'sheet-8';
    addCutGuides: boolean;
  }
) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const ratio =
    options.sizePreset === '2x2inch'
      ? 1
      : options.sizePreset === '30x40mm'
      ? 30 / 40
      : 35 / 45;

  if (options.layoutMode === 'single') {
    const w = 420;
    const h = Math.round(w / ratio);
    targetCanvas.width = w;
    targetCanvas.height = h;

    ctx.fillStyle = options.backdropColor;
    ctx.fillRect(0, 0, w, h);

    // Center-crop source image
    const srcRatio = sourceCanvas.width / sourceCanvas.height;
    let sx = 0,
      sy = 0,
      sw = sourceCanvas.width,
      sh = sourceCanvas.height;
    if (srcRatio > ratio) {
      sw = sourceCanvas.height * ratio;
      sx = (sourceCanvas.width - sw) / 2;
    } else {
      sh = sourceCanvas.width / ratio;
      sy = (sourceCanvas.height - sh) / 2;
    }
    ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, w, h);

    if (options.addCutGuides) {
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    }
    return;
  }

  // Printable 4x6 inch (1200 x 800 px) Multi-Photo Sheet
  const sheetW = 960;
  const sheetH = 640;
  targetCanvas.width = sheetW;
  targetCanvas.height = sheetH;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheetW, sheetH);

  const cols = options.layoutMode === 'sheet-8' ? 4 : 2;
  const rows = 2;
  const cellH = 250;
  const cellW = Math.round(cellH * ratio);
  const gapX = 28;
  const gapY = 28;

  const totalGridW = cols * cellW + (cols - 1) * gapX;
  const totalGridH = rows * cellH + (rows - 1) * gapY;
  const startX = Math.round((sheetW - totalGridW) / 2);
  const startY = Math.round((sheetH - totalGridH) / 2);

  // Center-crop coordinates
  const srcRatio = sourceCanvas.width / sourceCanvas.height;
  let sx = 0,
    sy = 0,
    sw = sourceCanvas.width,
    sh = sourceCanvas.height;
  if (srcRatio > ratio) {
    sw = sourceCanvas.height * ratio;
    sx = (sourceCanvas.width - sw) / 2;
  } else {
    sh = sourceCanvas.width / ratio;
    sy = (sourceCanvas.height - sh) / 2;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * (cellW + gapX);
      const y = startY + r * (cellH + gapY);

      ctx.fillStyle = options.backdropColor;
      ctx.fillRect(x, y, cellW, cellH);
      ctx.drawImage(sourceCanvas, sx, sy, sw, sh, x, y, cellW, cellH);

      if (options.addCutGuides) {
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, cellW, cellH);
        ctx.setLineDash([]);
      }
    }
  }

  ctx.fillStyle = '#64748B';
  ctx.font = 'bold 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(
    `ToolNova Printable ID Sheet (${options.sizePreset} · ${cols * rows} Photos · 300 DPI Ready)`,
    24,
    sheetH - 14
  );
}

export function renderImageWatermarkAndPrivacyStudio(
  targetCanvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement,
  options: {
    watermarkText: string;
    watermarkPattern: 'tiled-diagonal' | 'center-badge' | 'bottom-corner';
    watermarkOpacity: number;
    enablePrivacyRedaction: boolean;
    redactionYPercent: number;
    redactionHeightPercent: number;
    redactionMode: 'pixelate' | 'blackout';
  }
) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  targetCanvas.width = w;
  targetCanvas.height = h;

  ctx.drawImage(sourceCanvas, 0, 0);

  // 1. Privacy Blur / Redaction Bar (for hiding ID numbers, serials, faces, or signatures)
  if (options.enablePrivacyRedaction) {
    const ry = Math.round((options.redactionYPercent / 100) * h);
    const rh = Math.max(16, Math.round((options.redactionHeightPercent / 100) * h));
    const rx = Math.round(w * 0.12);
    const rw = Math.round(w * 0.76);

    if (options.redactionMode === 'blackout') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('REDACTED / CONFIDENTIAL', rx + rw / 2, ry + rh / 2 + 4);
    } else {
      // Pixelate region
      const blockSize = 14;
      const imgData = ctx.getImageData(rx, ry, rw, rh);
      const data = imgData.data;
      for (let py = 0; py < rh; py += blockSize) {
        for (let px = 0; px < rw; px += blockSize) {
          const i = (py * rw + px) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(rx + px, ry + py, blockSize, blockSize);
        }
      }
    }
  }

  // 2. Watermark Overlay
  if (options.watermarkText.trim()) {
    ctx.save();
    ctx.globalAlpha = options.watermarkOpacity;
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.lineWidth = 3;

    if (options.watermarkPattern === 'tiled-diagonal') {
      ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-Math.PI / 6);
      for (let x = -w; x < w; x += 260) {
        for (let y = -h; y < h; y += 130) {
          ctx.strokeText(options.watermarkText, x, y);
          ctx.fillText(options.watermarkText, x, y);
        }
      }
    } else if (options.watermarkPattern === 'center-badge') {
      ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(options.watermarkText, w / 2, h / 2);
      ctx.fillText(options.watermarkText, w / 2, h / 2);
    } else {
      ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';
      ctx.strokeText(options.watermarkText, w - 24, h - 24);
      ctx.fillText(options.watermarkText, w - 24, h - 24);
    }
    ctx.restore();
  }
}

// ============================================================================
// 5. SMART TEXT PROBLEM-SOLVING TOOLS
// ============================================================================

export function processSmartTextProblemSolver(
  inputText: string,
  options: {
    mode:
      | 'clean-all'
      | 'remove-duplicate-lines'
      | 'extract-emails-phones'
      | 'remove-arabic-tashkeel'
      | 'sort-lines-az'
      | 'number-lines';
  }
): {
  outputText: string;
  wordCount: number;
  charCount: number;
  lineCount: number;
  extractedItemsCount: number;
} {
  let result = inputText.replace(/\r\n/g, '\n');
  let extractedItemsCount = 0;

  if (options.mode === 'clean-all') {
    result = result
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter((l, idx, arr) => l !== '' || arr[idx - 1] !== '')
      .join('\n')
      .trim();
  } else if (options.mode === 'remove-duplicate-lines') {
    const seen = new Set<string>();
    const outLines: string[] = [];
    for (const line of result.split('\n')) {
      const key = line.trim();
      if (!key) continue;
      if (!seen.has(key)) {
        seen.add(key);
        outLines.push(line.trim());
      } else {
        extractedItemsCount++;
      }
    }
    result = outLines.join('\n');
  } else if (options.mode === 'extract-emails-phones') {
    const emails = result.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    const phones =
      result.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{2,4}[\s-]?\d{2,4}[\s-]?\d{2,4}/g) ||
      [];
    const validPhones = phones.filter((p) => p.replace(/\D/g, '').length >= 8);
    const uniqueEmails = Array.from(new Set(emails));
    const uniquePhones = Array.from(new Set(validPhones));
    extractedItemsCount = uniqueEmails.length + uniquePhones.length;

    result = [
      `=== EXTRACTED EMAILS (${uniqueEmails.length}) ===`,
      ...(uniqueEmails.length ? uniqueEmails : ['No email addresses found.']),
      '',
      `=== EXTRACTED PHONE NUMBERS (${uniquePhones.length}) ===`,
      ...(uniquePhones.length ? uniquePhones : ['No phone numbers found.']),
    ].join('\n');
  } else if (options.mode === 'remove-arabic-tashkeel') {
    // Strip Arabic diacritics (Tashkeel / Harakat) and Tatweel (Kashida)
    result = result.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  } else if (options.mode === 'sort-lines-az') {
    result = result
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .join('\n');
  } else if (options.mode === 'number-lines') {
    result = result
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l, i) => `${i + 1}. ${l}`)
      .join('\n');
  }

  const wordCount = result.trim() ? result.trim().split(/\s+/).length : 0;
  const charCount = result.length;
  const lineCount = result ? result.split('\n').length : 0;

  return {
    outputText: result,
    wordCount,
    charCount,
    lineCount,
    extractedItemsCount,
  };
}
