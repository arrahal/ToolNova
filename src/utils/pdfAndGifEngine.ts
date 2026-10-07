import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import PptxGenJS from 'pptxgenjs';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  ImageRun,
  TabStopType,
  VerticalAlign,
} from 'docx';

// Configure Mozilla PDF.js worker for Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export interface PositionedTextItem {
  x: number;
  topY: number; // distance from top of page in points
  width: number;
  height: number;
  fontSize: number;
  text: string;
}

export interface ReconstructedLine {
  topY: number;
  minX: number;
  maxX: number;
  fontSize: number;
  cells: { x: number; text: string; fontSize: number }[];
  fullText: string;
}

export interface ExtractedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  isTwoColumn: boolean;
  hasDarkSidebar: boolean;
  sidebarBgHex: string; // e.g. "142642"
  accentHex: string; // e.g. "C86D3B"
  splitRatio: number; // e.g. 0.34
  extractedPhotoPngBytes?: Uint8Array;
  extractedPhotoDataUrl?: string;
  extractedPhotoAspect?: number; // width / height
  leftLines: ReconstructedLine[];
  rightLines: ReconstructedLine[];
  lines: {
    y: number;
    fontSize: number;
    isHeading: boolean;
    cells: { x: number; text: string }[];
    fullText: string;
  }[];
  rawText: string;
  pageDataUrl?: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

function groupItemsIntoLines(items: PositionedTextItem[], yTolerance = 4.5): ReconstructedLine[] {
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(a.topY - b.topY) > yTolerance) {
      return a.topY - b.topY;
    }
    return a.x - b.x;
  });

  const groups: {
    topY: number;
    fontSize: number;
    cells: { x: number; text: string; fontSize: number }[];
  }[] = [];

  for (const it of sorted) {
    const existing = groups.find((g) => Math.abs(g.topY - it.topY) <= yTolerance);
    if (existing) {
      existing.cells.push({ x: it.x, text: it.text, fontSize: it.fontSize });
      if (it.fontSize > existing.fontSize) existing.fontSize = it.fontSize;
    } else {
      groups.push({
        topY: it.topY,
        fontSize: it.fontSize,
        cells: [{ x: it.x, text: it.text, fontSize: it.fontSize }],
      });
    }
  }

  return groups.map((g) => {
    g.cells.sort((a, b) => a.x - b.x);
    const minX = g.cells[0]?.x ?? 0;
    const maxX = g.cells[g.cells.length - 1]?.x ?? 0;
    const fullText = g.cells
      .map((c) => c.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      topY: g.topY,
      minX,
      maxX,
      fontSize: g.fontSize,
      cells: g.cells,
      fullText,
    };
  });
}

/**
 * Extracts real text, detects 2-column CV layouts & sidebar background colors,
 * crops embedded profile photos/graphics, and prepares structured lines.
 */
export async function extractRealPdfContent(
  pdfBytes: Uint8Array,
  options: { renderPageImages?: boolean; imageScale?: number; imageQuality?: number } = {}
): Promise<ExtractedPdfPage[]> {
  // Trim any leading junk bytes before '%PDF-' if present
  let startOffset = 0;
  const searchLimit = Math.min(pdfBytes.length - 5, 1024);
  for (let i = 0; i <= searchLimit; i++) {
    if (
      pdfBytes[i] === 0x25 &&
      pdfBytes[i + 1] === 0x50 &&
      pdfBytes[i + 2] === 0x44 &&
      pdfBytes[i + 3] === 0x46 &&
      pdfBytes[i + 4] === 0x2d
    ) {
      startOffset = i;
      break;
    }
  }
  const dataCopy = new Uint8Array(pdfBytes.subarray(startOffset));

  let pdfDocument: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({ data: dataCopy });
    pdfDocument = await loadingTask.promise;
  } catch {
    // Fallback if user uploaded an image (PNG/JPG/WebP) instead of a PDF
    const blob = new Blob([pdfBytes]);
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Invalid image or PDF buffer'));
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 595;
      canvas.height = img.height || 842;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const pageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      return [
        {
          pageNumber: 1,
          width: canvas.width,
          height: canvas.height,
          isTwoColumn: false,
          hasDarkSidebar: false,
          sidebarBgHex: 'F8FAFC',
          accentHex: 'C86D3B',
          splitRatio: 0.34,
          leftLines: [],
          rightLines: [],
          lines: [],
          rawText: '',
          pageDataUrl,
        },
      ];
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const numPages = pdfDocument.numPages;
  const extractedPages: ExtractedPdfPage[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageW = viewport.width;
    const pageH = viewport.height;

    const textContent = await page.getTextContent();
    const rawItems: PositionedTextItem[] = [];

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const tx = item.transform;
        const x = tx[4];
        const pdfY = tx[5];
        const topY = pageH - pdfY;
        const fontSize = Math.round(Math.hypot(tx[0], tx[1]) || item.height || 11);
        rawItems.push({
          x,
          topY,
          width: item.width || 20,
          height: item.height || fontSize,
          fontSize,
          text: item.str,
        });
      }
    }

    // Always render a high-res canvas (scale 2.0) to inspect sidebar background color & extract profile photos
    const renderScale = options.imageScale || 2.0;
    const renderViewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(renderViewport.width);
    canvas.height = Math.floor(renderViewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: renderViewport,
      canvas,
    }).promise;

    // 1. Detect if there is a colored left sidebar by sampling pixels near the left edge vs right side
    const sampleY = Math.floor(canvas.height * 0.45);
    const rowPixels = ctx.getImageData(0, sampleY, canvas.width, 1).data;
    const leftR = rowPixels[12 * 4];
    const leftG = rowPixels[12 * 4 + 1];
    const leftB = rowPixels[12 * 4 + 2];

    const rightSampleX = Math.floor(canvas.width * 0.85);
    const rightR = rowPixels[rightSampleX * 4];
    const rightG = rowPixels[rightSampleX * 4 + 1];
    const rightB = rowPixels[rightSampleX * 4 + 2];

    const colorDelta =
      Math.abs(leftR - rightR) + Math.abs(leftG - rightG) + Math.abs(leftB - rightB);

    let hasColoredSidebar = colorDelta > 45;
    let splitRatio = 0.34;
    let sidebarBgHex = '142642';

    if (hasColoredSidebar) {
      sidebarBgHex = rgbToHex(leftR, leftG, leftB);
      // Find the exact X pixel where the sidebar color transitions to the main background
      for (let px = Math.floor(canvas.width * 0.18); px < Math.floor(canvas.width * 0.55); px++) {
        const r = rowPixels[px * 4];
        const g = rowPixels[px * 4 + 1];
        const b = rowPixels[px * 4 + 2];
        const distFromLeft = Math.abs(r - leftR) + Math.abs(g - leftG) + Math.abs(b - leftB);
        if (distFromLeft > 40) {
          splitRatio = px / canvas.width;
          break;
        }
      }
    }

    const leftLuminance = 0.299 * leftR + 0.587 * leftG + 0.114 * leftB;
    const hasDarkSidebar = hasColoredSidebar && leftLuminance < 140;

    // Also check if text items naturally form a 2-column layout even if sidebar is light
    const splitXPt = pageW * splitRatio;
    const leftItems = rawItems.filter((it) => it.x < splitXPt - 4);
    const rightItems = rawItems.filter((it) => it.x >= splitXPt - 4);
    const isTwoColumn =
      hasColoredSidebar || (leftItems.length >= 4 && rightItems.length >= 6);

    const leftLines = isTwoColumn ? groupItemsIntoLines(leftItems) : [];
    const rightLines = isTwoColumn
      ? groupItemsIntoLines(rightItems)
      : groupItemsIntoLines(rawItems);

    // 2. Extract the Profile Photo from the top of the Left Sidebar (if present)
    let extractedPhotoPngBytes: Uint8Array | undefined;
    let extractedPhotoDataUrl: string | undefined;
    let extractedPhotoAspect = 1;

    if (isTwoColumn) {
      const firstLeftTextTopY = leftLines[0]?.topY ?? pageH * 0.45;
      // If there is vertical space above the first left sidebar text item (at least 75pt),
      // inspect that box for a photo / avatar!
      if (firstLeftTextTopY > 85) {
        const cropLeftPx = Math.floor(canvas.width * 0.03);
        const cropWidthPx = Math.floor(canvas.width * (splitRatio - 0.06));
        const cropTopPx = Math.floor(canvas.height * 0.025);
        const cropHeightPx = Math.floor(
          Math.min(
            cropWidthPx * 1.12,
            (firstLeftTextTopY - 18) * renderScale - cropTopPx
          )
        );

        if (cropWidthPx > 40 && cropHeightPx > 40) {
          const imgRegion = ctx.getImageData(
            cropLeftPx,
            cropTopPx,
            cropWidthPx,
            cropHeightPx
          );
          const d = imgRegion.data;
          // Measure pixel variance compared to sidebar background color to verify a real photo exists
          let diffCount = 0;
          for (let i = 0; i < d.length; i += 16) {
            const diff =
              Math.abs(d[i] - leftR) +
              Math.abs(d[i + 1] - leftG) +
              Math.abs(d[i + 2] - leftB);
            if (diff > 35) diffCount++;
          }
          const totalSampled = d.length / 16;
          if (diffCount / totalSampled > 0.12) {
            // Real photo detected! Crop it cleanly onto a square/portrait offscreen canvas
            const photoCanvas = document.createElement('canvas');
            photoCanvas.width = cropWidthPx;
            photoCanvas.height = cropHeightPx;
            const pCtx = photoCanvas.getContext('2d')!;
            pCtx.putImageData(imgRegion, 0, 0);

            extractedPhotoDataUrl = photoCanvas.toDataURL('image/png');
            extractedPhotoPngBytes = dataUrlToUint8Array(extractedPhotoDataUrl);
            extractedPhotoAspect = cropWidthPx / cropHeightPx;
          }
        }
      }
    }

    // Legacy single-list lines for Markdown/Excel compatibility
    const allLines = isTwoColumn
      ? [...leftLines, ...rightLines]
      : rightLines;

    let pageDataUrl: string | undefined;
    if (options.renderPageImages || allLines.length === 0) {
      pageDataUrl = canvas.toDataURL('image/jpeg', options.imageQuality ?? 0.88);
    }

    extractedPages.push({
      pageNumber: pageNum,
      width: pageW,
      height: pageH,
      isTwoColumn,
      hasDarkSidebar,
      sidebarBgHex: hasColoredSidebar ? sidebarBgHex : 'F8FAFC',
      accentHex: 'C86D3B',
      splitRatio,
      extractedPhotoPngBytes,
      extractedPhotoDataUrl,
      extractedPhotoAspect,
      leftLines,
      rightLines,
      lines: allLines.map((l) => ({
        y: Math.round(pageH - l.topY),
        fontSize: l.fontSize,
        isHeading: l.fontSize >= 13,
        cells: l.cells.map((c) => ({ x: Math.round(c.x), text: c.text })),
        fullText: l.fullText,
      })),
      rawText: allLines.map((l) => l.fullText).join('\n'),
      pageDataUrl,
    });
  }

  return extractedPages;
}

/**
 * Helper to split a right-column line into { leftTitle, rightDate } if it contains a right-aligned date/period
 * e.g. "Superviseur Fév. 2026 – Présent" or "Animateur 2023 – 2024" or "Stagiaire — Laboratoire 2023 (2 mois)"
 */
function splitJobTitleAndDate(line: ReconstructedLine, pageWidth: number): {
  leftTitle: string;
  rightDate: string | null;
} {
  // Check if the rightmost cell(s) are positioned on the far right (x > pageWidth * 0.68)
  if (line.cells.length >= 2) {
    const firstRightCellIdx = line.cells.findIndex((c, idx) => idx > 0 && c.x > pageWidth * 0.68);
    if (firstRightCellIdx !== -1) {
      const leftPart = line.cells
        .slice(0, firstRightCellIdx)
        .map((c) => c.text)
        .join(' ')
        .trim();
      const rightPart = line.cells
        .slice(firstRightCellIdx)
        .map((c) => c.text)
        .join(' ')
        .trim();
      if (leftPart && rightPart) {
        return { leftTitle: leftPart, rightDate: rightPart };
      }
    }
  }

  // Also check regex for trailing date patterns (e.g., "Fév. 2026 – Présent", "2023 – 2024", "2023 (2 mois)")
  const dateRegex =
    /^(.+?)\s+((?:Janv?\.?|Fév\.?|Mars|Avr\.?|Mai|Juin|Juil\.?|Août|Sept\.?|Oct\.?|Nov\.?|Déc\.?)?\s*\d{4}\s*(?:[–\-—]\s*(?:Présent|Present|\d{4})|\(\d+\s*mois\)))$/i;
  const match = line.fullText.match(dateRegex);
  if (match) {
    return { leftTitle: match[1].trim(), rightDate: match[2].trim() };
  }

  return { leftTitle: line.fullText, rightDate: null };
}

/**
 * Generates BOTH a native OpenXML .docx binary file (via the `docx` package)
 * AND a rich HTML visual preview that faithfully preserves 2-column CV layouts,
 * dark navy sidebars, circular profile photos, orange section underlines, and right-aligned dates!
 */
export async function generateEditableDocxFromPages(
  extractedPages: ExtractedPdfPage[],
  options: { includeFullPageSnapshot?: boolean } = {}
): Promise<{ docxBytes: Uint8Array; previewHtml: string }> {
  const docChildren: (Paragraph | Table)[] = [];
  const previewHtmlSections: string[] = [];

  for (const page of extractedPages) {
    if (page.isTwoColumn) {
      // ================== 2-COLUMN CV / SIDEBAR RECONSTRUCTION ==================
      const leftParagraphs: Paragraph[] = [];
      let leftHtml = '';

      // 1. Profile Photo at top of Left Sidebar
      if (page.extractedPhotoPngBytes && page.extractedPhotoDataUrl) {
        const imgW = 150;
        const imgH = Math.round(imgW / (page.extractedPhotoAspect || 1));
        leftParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 280 },
            children: [
              new ImageRun({
                data: page.extractedPhotoPngBytes,
                transformation: { width: imgW, height: imgH },
                type: 'png',
              }),
            ],
          })
        );
        leftHtml += `<div style="text-align:center; margin: 8px 0 22px 0;">
          <img src="${page.extractedPhotoDataUrl}" style="width:155px; height:auto; border-radius:8px; display:inline-block;" alt="Profile Photo" />
        </div>`;
      }

      // 2. Left Sidebar Lines (CONTACT, COMPETENCES TECHNIQUES, etc.)
      for (const line of page.leftLines) {
        const text = line.fullText;
        const isSectionHeader =
          text.length >= 4 &&
          text === text.toUpperCase() &&
          !/^\d/.test(text) &&
          !text.includes('@');

        if (isSectionHeader) {
          leftParagraphs.push(
            new Paragraph({
              spacing: { before: 280, after: 120 },
              border: {
                bottom: {
                  color: page.accentHex,
                  space: 4,
                  style: BorderStyle.SINGLE,
                  size: 8,
                },
              },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  color: page.accentHex,
                  size: 20, // 10pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          leftHtml += `<div style="color:#${page.accentHex}; font-weight:700; font-size:12px; letter-spacing:0.03em; border-bottom:1.5px solid #${page.accentHex}; padding-bottom:5px; margin:20px 0 10px 0;">${text}</div>`;
        } else {
          const textColor = page.hasDarkSidebar ? 'FFFFFF' : '1E293B';
          leftParagraphs.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [
                new TextRun({
                  text,
                  color: textColor,
                  size: 19, // 9.5pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          leftHtml += `<div style="color:#${textColor}; font-size:12px; line-height:1.6; margin:4px 0;">${text}</div>`;
        }
      }

      // 3. Right Main Column Lines (Header, PROFIL, EXPERIENCES PROFESSIONNELLES, etc.)
      const rightParagraphs: Paragraph[] = [];
      let rightHtml = '';

      let prevWasJobHeader = false;
      const rightMinX =
        page.rightLines.length > 0
          ? Math.min(...page.rightLines.map((l) => l.minX))
          : page.width * page.splitRatio + 20;

      for (let i = 0; i < page.rightLines.length; i++) {
        const line = page.rightLines[i];
        const text = line.fullText;

        // Detect Top Centered Name & Role Subtitle (first 1-2 lines of right column if centered or large font)
        const isTopHeroName =
          i === 0 && (line.fontSize >= 16 || text === text.toUpperCase());
        const isTopRoleSubtitle =
          i === 1 &&
          page.rightLines[0] &&
          text === text.toUpperCase() &&
          line.topY - page.rightLines[0].topY < 35;

        if (isTopHeroName) {
          rightParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 140, after: 60 },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  color: '142642',
                  size: 40, // 20pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          rightHtml += `<h1 style="text-align:center; color:#142642; font-size:24px; font-weight:800; margin:10px 0 4px 0; letter-spacing:0.02em;">${text}</h1>`;
          prevWasJobHeader = false;
          continue;
        }

        if (isTopRoleSubtitle) {
          rightParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 320 },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  color: page.accentHex,
                  size: 20, // 10pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          rightHtml += `<div style="text-align:center; color:#${page.accentHex}; font-size:12.5px; font-weight:600; margin:0 0 26px 0;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        // Detect Section Header (e.g., PROFIL, EXPERIENCES PROFESSIONNELLES, FORMATION)
        const isRightSectionHeader =
          text.length >= 4 &&
          text === text.toUpperCase() &&
          !/^\d/.test(text);

        if (isRightSectionHeader) {
          rightParagraphs.push(
            new Paragraph({
              spacing: { before: 280, after: 140 },
              border: {
                bottom: {
                  color: page.accentHex,
                  space: 4,
                  style: BorderStyle.SINGLE,
                  size: 12,
                },
              },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  color: '142642',
                  size: 24, // 12pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          rightHtml += `<div style="color:#142642; font-weight:800; font-size:14px; border-bottom:2px solid #${page.accentHex}; padding-bottom:5px; margin:22px 0 12px 0;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        // Detect Job Title + Right-Aligned Date row
        const { leftTitle, rightDate } = splitJobTitleAndDate(line, page.width);
        if (rightDate) {
          rightParagraphs.push(
            new Paragraph({
              spacing: { before: 180, after: 40 },
              tabStops: [
                {
                  type: TabStopType.RIGHT,
                  position: 5600,
                },
              ],
              children: [
                new TextRun({
                  text: leftTitle,
                  bold: true,
                  color: '142642',
                  size: 21, // 10.5pt
                  font: 'Calibri',
                }),
                new TextRun({
                  text: `\t${rightDate}`,
                  italics: true,
                  color: '334155',
                  size: 19, // 9.5pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          rightHtml += `<div style="display:flex; justify-content:space-between; align-items:baseline; margin:14px 0 2px 0;">
            <span style="color:#142642; font-weight:700; font-size:13px;">${leftTitle}</span>
            <span style="color:#334155; font-style:italic; font-size:11.5px;">${rightDate}</span>
          </div>`;
          prevWasJobHeader = true;
          continue;
        }

        // Detect Company / Organization Subtitle immediately after Job Header (e.g. "Fondation Zakoura")
        if (prevWasJobHeader && text.length < 48) {
          rightParagraphs.push(
            new Paragraph({
              spacing: { before: 0, after: 80 },
              children: [
                new TextRun({
                  text,
                  italics: true,
                  color: page.accentHex,
                  size: 20,
                  font: 'Calibri',
                }),
              ],
            })
          );
          rightHtml += `<div style="color:#${page.accentHex}; font-style:italic; font-size:12px; margin:0 0 6px 0;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        prevWasJobHeader = false;
        const isIndented = line.minX - rightMinX > 6;

        rightParagraphs.push(
          new Paragraph({
            indent: isIndented ? { left: 180 } : undefined,
            spacing: { before: 35, after: 35 },
            children: [
              new TextRun({
                text,
                color: '1E293B',
                size: 20, // 10pt
                font: 'Calibri',
              }),
            ],
          })
        );
        rightHtml += `<p style="color:#1E293B; font-size:12px; line-height:1.55; margin:3px 0; ${
          isIndented ? 'padding-left:12px;' : ''
        }">${text}</p>`;
      }

      // Build 2-Column Word Table for this Page
      const leftWidthPct = Math.round(page.splitRatio * 100);
      const rightWidthPct = 100 - leftWidthPct;

      const twoColTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: leftWidthPct, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                shading: {
                  fill: page.sidebarBgHex,
                  type: ShadingType.CLEAR,
                  color: 'auto',
                },
                margins: {
                  top: 280,
                  bottom: 360,
                  left: 240,
                  right: 220,
                },
                children:
                  leftParagraphs.length > 0
                    ? leftParagraphs
                    : [new Paragraph({ text: '' })],
              }),
              new TableCell({
                width: { size: rightWidthPct, type: WidthType.PERCENTAGE },
                verticalAlign: VerticalAlign.TOP,
                shading: {
                  fill: 'FFFFFF',
                  type: ShadingType.CLEAR,
                  color: 'auto',
                },
                margins: {
                  top: 280,
                  bottom: 360,
                  left: 320,
                  right: 260,
                },
                children:
                  rightParagraphs.length > 0
                    ? rightParagraphs
                    : [new Paragraph({ text: '' })],
              }),
            ],
          }),
        ],
      });

      docChildren.push(twoColTable);

      previewHtmlSections.push(`
        <div style="display:flex; width:100%; min-height:540px; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#ffffff; box-shadow:0 4px 12px rgba(0,0,0,0.06); margin-bottom:20px; font-family:'Calibri','Plus Jakarta Sans',sans-serif;">
          <div style="width:${leftWidthPct}%; background:#${page.sidebarBgHex}; padding:20px 16px; box-sizing:border-box;">
            ${leftHtml}
          </div>
          <div style="width:${rightWidthPct}%; background:#ffffff; padding:22px 24px; box-sizing:border-box;">
            ${rightHtml}
          </div>
        </div>
      `);
    } else {
      // ================== 1-COLUMN DOCUMENT RECONSTRUCTION ==================
      let singleColHtml = '';
      for (const line of page.rightLines) {
        const isHeading = line.fontSize >= 14;
        docChildren.push(
          new Paragraph({
            spacing: { before: isHeading ? 200 : 60, after: isHeading ? 100 : 60 },
            children: [
              new TextRun({
                text: line.fullText,
                bold: isHeading,
                size: isHeading ? 28 : 21,
                color: isHeading ? '0F172A' : '1E293B',
                font: 'Calibri',
              }),
            ],
          })
        );
        singleColHtml += isHeading
          ? `<h2 style="color:#0f172a; font-size:16px; font-weight:700; margin:14px 0 6px 0;">${line.fullText}</h2>`
          : `<p style="color:#1e293b; font-size:12.5px; line-height:1.6; margin:5px 0;">${line.fullText}</p>`;
      }

      if (options.includeFullPageSnapshot && page.pageDataUrl) {
        const snapBytes = dataUrlToUint8Array(page.pageDataUrl);
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200, after: 200 },
            children: [
              new ImageRun({
                data: snapBytes,
                transformation: { width: 480, height: 620 },
                type: 'jpg',
              }),
            ],
          })
        );
      }

      previewHtmlSections.push(`
        <div style="padding:24px; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; margin-bottom:20px; font-family:'Calibri',sans-serif;">
          ${singleColHtml}
        </div>
      `);
    }
  }

  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 360, // 0.25 inch margins so CV fills the Word page cleanly
              bottom: 360,
              left: 360,
              right: 360,
            },
          },
        },
        children: docChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(wordDoc);
  const arrayBuf = await blob.arrayBuffer();
  return {
    docxBytes: new Uint8Array(arrayBuf),
    previewHtml: previewHtmlSections.join('\n'),
  };
}

export interface PptxGenerationOptions {
  mode?: 'editable-smart' | 'hybrid-with-snapshot' | 'visual-exact';
  theme?: 'original-brand' | 'executive-dark' | 'clean-light';
  documentTitle?: string;
}

/**
 * Generates a real, native Microsoft PowerPoint (.PPTX) presentation using PptxGenJS
 * AND a rich 16:9 slide deck visual preview HTML.
 * Supports:
 * - Smart 2-Column CV / Executive Profile Slide Reconstruction (with dark sidebar, circular avatar photo, orange section underlines, and right-aligned dates)
 * - Structured Multi-Section Slides when content is long
 * - High-Resolution Full-Page Visual Slides so zero graphics or tables are ever lost
 */
export async function generateProfessionalPptxFromPages(
  extractedPages: ExtractedPdfPage[],
  options: PptxGenerationOptions = {}
): Promise<{ pptxBytes: Uint8Array; previewHtml: string; slideCount: number }> {
  const mode = options.mode || 'hybrid-with-snapshot';
  const theme = options.theme || 'original-brand';

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches (16:9 Widescreen)
  pptx.author = 'ToolNova Smart Presentation Engine';
  pptx.company = 'ToolNova.com';
  pptx.title = options.documentTitle || 'ToolNova Presentation';

  const slidePreviewCards: string[] = [];
  let slideCount = 0;

  for (const page of extractedPages) {
    const primaryDarkHex =
      theme === 'executive-dark'
        ? '0F172A'
        : theme === 'clean-light'
        ? '1E293B'
        : page.hasDarkSidebar
        ? page.sidebarBgHex
        : '142642';
    const accentHex = page.accentHex || 'C86D3B';
    const rightBgHex = theme === 'executive-dark' ? '1E293B' : 'FFFFFF';
    const rightTextHex = theme === 'executive-dark' ? 'F8FAFC' : '1E293B';
    const rightHeadingHex = theme === 'executive-dark' ? 'FFFFFF' : '142642';

    // MODE 1: Pure Visual High-Res Slide
    if (mode === 'visual-exact' && page.pageDataUrl) {
      slideCount++;
      const slide = pptx.addSlide();
      slide.background = { color: '0F172A' };

      const pageAspect = page.width / Math.max(1, page.height);
      const slideH = 7.1;
      const slideW = Math.min(12.5, slideH * pageAspect);
      const offsetX = (13.333 - slideW) / 2;

      slide.addImage({
        data: page.pageDataUrl,
        x: offsetX,
        y: 0.2,
        w: slideW,
        h: slideH,
      });

      slidePreviewCards.push(`
        <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#0f172a; box-shadow:0 8px 20px rgba(15,23,42,0.12);">
          <div style="padding:8px 14px; background:#1e293b; color:#e2e8f0; font-size:11px; font-weight:700; display:flex; justify-content:space-between;">
            <span>SLIDE ${slideCount} · HIGH-RESOLUTION VISUAL SLIDE (16:9)</span>
            <span style="color:#38bdf8;">PAGE ${page.pageNumber}</span>
          </div>
          <div style="padding:16px; display:flex; justify-content:center; background:#0f172a;">
            <img src="${page.pageDataUrl}" style="max-height:320px; width:auto; border-radius:6px; box-shadow:0 4px 14px rgba(0,0,0,0.4);" alt="Slide ${slideCount}" />
          </div>
        </div>
      `);
      continue;
    }

    // MODE 2 & 3: Smart Editable Slide Reconstruction (2-Column CV / Sidebar or 1-Column Deck)
    if (page.isTwoColumn) {
      slideCount++;
      const slide = pptx.addSlide();
      slide.background = { color: rightBgHex };

      const sidebarW = 3.95; // inches out of 13.333

      // 1. Left Sidebar Background Shape
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: sidebarW,
        h: 7.5,
        fill: { color: primaryDarkHex },
        line: { color: primaryDarkHex, width: 0 },
      });

      let leftCurY = 0.35;
      let leftPreviewHtml = '';

      // 2. Profile Photo in Left Sidebar
      if (page.extractedPhotoDataUrl) {
        const photoW = 1.65;
        const photoH = Number((photoW / (page.extractedPhotoAspect || 1)).toFixed(2));
        const photoX = Number(((sidebarW - photoW) / 2).toFixed(2));

        slide.addImage({
          data: page.extractedPhotoDataUrl,
          x: photoX,
          y: leftCurY,
          w: photoW,
          h: photoH,
        });
        leftCurY += photoH + 0.25;

        leftPreviewHtml += `
          <div style="text-align:center; margin-bottom:12px;">
            <img src="${page.extractedPhotoDataUrl}" style="width:88px; height:88px; object-fit:cover; border-radius:50%; border:2px solid #${accentHex}; display:inline-block;" alt="Profile" />
          </div>
        `;
      }

      // 3. Left Sidebar Editable Text Blocks
      for (const line of page.leftLines) {
        const text = line.fullText;
        const isSectionHeader =
          text.length >= 4 &&
          text === text.toUpperCase() &&
          !/^\d/.test(text) &&
          !text.includes('@');

        if (isSectionHeader) {
          leftCurY += 0.12;
          if (leftCurY < 6.9) {
            slide.addText(text, {
              x: 0.28,
              y: leftCurY,
              w: sidebarW - 0.56,
              h: 0.28,
              fontSize: 10.5,
              bold: true,
              color: accentHex,
              fontFace: 'Calibri',
            });
            slide.addShape(pptx.ShapeType.line, {
              x: 0.28,
              y: leftCurY + 0.26,
              w: sidebarW - 0.56,
              h: 0,
              line: { color: accentHex, width: 1.5 },
            });
            leftCurY += 0.34;
          }
          leftPreviewHtml += `<div style="color:#${accentHex}; font-weight:800; font-size:10px; border-bottom:1.5px solid #${accentHex}; padding-bottom:3px; margin:10px 0 5px 0; letter-spacing:0.04em;">${text}</div>`;
        } else {
          if (leftCurY < 7.1) {
            slide.addText(text, {
              x: 0.28,
              y: leftCurY,
              w: sidebarW - 0.56,
              h: 0.24,
              fontSize: 9.5,
              color: 'FFFFFF',
              fontFace: 'Calibri',
            });
            leftCurY += 0.22;
          }
          leftPreviewHtml += `<div style="color:#ffffff; font-size:9.5px; line-height:1.4; margin:2px 0;">${text}</div>`;
        }
      }

      // 4. Right Main Column Editable Blocks
      const rightX = sidebarW + 0.42;
      const rightW = 13.333 - rightX - 0.42;
      let rightCurY = 0.35;
      let rightPreviewHtml = '';
      let prevWasJobHeader = false;

      for (let i = 0; i < page.rightLines.length; i++) {
        const line = page.rightLines[i];
        const text = line.fullText;

        const isTopHeroName =
          i === 0 && (line.fontSize >= 16 || text === text.toUpperCase());
        const isTopRoleSubtitle =
          i === 1 &&
          page.rightLines[0] &&
          text === text.toUpperCase() &&
          line.topY - page.rightLines[0].topY < 35;

        if (isTopHeroName) {
          slide.addText(text, {
            x: rightX,
            y: rightCurY,
            w: rightW,
            h: 0.45,
            fontSize: 22,
            bold: true,
            align: 'center',
            color: rightHeadingHex,
            fontFace: 'Calibri',
          });
          rightCurY += 0.42;
          rightPreviewHtml += `<div style="text-align:center; color:#${rightHeadingHex}; font-size:17px; font-weight:800; letter-spacing:0.02em;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        if (isTopRoleSubtitle) {
          slide.addText(text, {
            x: rightX,
            y: rightCurY,
            w: rightW,
            h: 0.3,
            fontSize: 11,
            bold: true,
            align: 'center',
            color: accentHex,
            fontFace: 'Calibri',
          });
          rightCurY += 0.38;
          rightPreviewHtml += `<div style="text-align:center; color:#${accentHex}; font-size:10px; font-weight:700; margin-bottom:10px;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        const isRightSectionHeader =
          text.length >= 4 &&
          text === text.toUpperCase() &&
          !/^\d/.test(text);

        if (isRightSectionHeader) {
          rightCurY += 0.1;
          if (rightCurY < 6.85) {
            slide.addText(text, {
              x: rightX,
              y: rightCurY,
              w: rightW,
              h: 0.28,
              fontSize: 12,
              bold: true,
              color: rightHeadingHex,
              fontFace: 'Calibri',
            });
            slide.addShape(pptx.ShapeType.line, {
              x: rightX,
              y: rightCurY + 0.27,
              w: rightW,
              h: 0,
              line: { color: accentHex, width: 1.5 },
            });
            rightCurY += 0.34;
          }
          rightPreviewHtml += `<div style="color:#${rightHeadingHex}; font-weight:800; font-size:11px; border-bottom:1.5px solid #${accentHex}; padding-bottom:2px; margin:10px 0 5px 0;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        const { leftTitle, rightDate } = splitJobTitleAndDate(line, page.width);
        if (rightDate) {
          if (rightCurY < 6.95) {
            slide.addText(leftTitle, {
              x: rightX,
              y: rightCurY,
              w: rightW * 0.68,
              h: 0.24,
              fontSize: 10.5,
              bold: true,
              color: rightHeadingHex,
              fontFace: 'Calibri',
            });
            slide.addText(rightDate, {
              x: rightX + rightW * 0.68,
              y: rightCurY,
              w: rightW * 0.32,
              h: 0.24,
              fontSize: 9.5,
              italic: true,
              align: 'right',
              color: theme === 'executive-dark' ? 'CBD5E1' : '334155',
              fontFace: 'Calibri',
            });
            rightCurY += 0.23;
          }
          rightPreviewHtml += `
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-top:6px;">
              <span style="color:#${rightHeadingHex}; font-weight:700; font-size:10.5px;">${leftTitle}</span>
              <span style="color:#64748b; font-style:italic; font-size:9.5px;">${rightDate}</span>
            </div>
          `;
          prevWasJobHeader = true;
          continue;
        }

        if (prevWasJobHeader && text.length < 48) {
          if (rightCurY < 7.0) {
            slide.addText(text, {
              x: rightX,
              y: rightCurY,
              w: rightW,
              h: 0.22,
              fontSize: 9.5,
              italic: true,
              color: accentHex,
              fontFace: 'Calibri',
            });
            rightCurY += 0.22;
          }
          rightPreviewHtml += `<div style="color:#${accentHex}; font-style:italic; font-size:9.5px; margin-bottom:2px;">${text}</div>`;
          prevWasJobHeader = false;
          continue;
        }

        prevWasJobHeader = false;
        if (rightCurY < 7.15) {
          slide.addText(text, {
            x: rightX,
            y: rightCurY,
            w: rightW,
            h: 0.22,
            fontSize: 9.2,
            color: rightTextHex,
            fontFace: 'Calibri',
          });
          rightCurY += 0.19;
        }
        rightPreviewHtml += `<div style="color:#${rightTextHex}; font-size:9.5px; line-height:1.4; margin:1.5px 0;">${text}</div>`;
      }

      slidePreviewCards.push(`
        <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 6px 18px rgba(15,23,42,0.08); font-family:'Calibri','Plus Jakarta Sans',sans-serif;">
          <div style="padding:8px 14px; background:#0f172a; color:#f8fafc; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
            <span>SLIDE ${slideCount} · EDITABLE 16:9 WIDESCREEN POWERPOINT LAYOUT</span>
            <span style="background:#c86d3b; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px;">NATIVE .PPTX</span>
          </div>
          <div style="display:flex; width:100%; aspect-ratio: 16 / 9; background:#${rightBgHex}; overflow:hidden;">
            <div style="width:31%; background:#${primaryDarkHex}; padding:14px 12px; box-sizing:border-box; overflow-y:auto;">
              ${leftPreviewHtml}
            </div>
            <div style="width:69%; background:#${rightBgHex}; padding:14px 18px; box-sizing:border-box; overflow-y:auto;">
              ${rightPreviewHtml}
            </div>
          </div>
        </div>
      `);
    } else {
      // ================== 1-COLUMN PROFESSIONAL PRESENTATION SLIDES ==================
      const linesPerSlide = 12;
      const chunks: ReconstructedLine[][] = [];
      for (let i = 0; i < page.rightLines.length; i += linesPerSlide) {
        chunks.push(page.rightLines.slice(i, i + linesPerSlide));
      }
      if (chunks.length === 0) chunks.push([]);

      for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
        slideCount++;
        const chunk = chunks[cIdx];
        const slide = pptx.addSlide();
        slide.background = { color: rightBgHex };

        // Top Header Accent Bar
        slide.addShape(pptx.ShapeType.rect, {
          x: 0,
          y: 0,
          w: 13.333,
          h: 0.85,
          fill: { color: primaryDarkHex },
          line: { color: primaryDarkHex, width: 0 },
        });

        const slideTitle =
          chunk[0]?.fullText || `Page ${page.pageNumber} — Slide ${cIdx + 1}`;
        slide.addText(slideTitle.slice(0, 85), {
          x: 0.5,
          y: 0.18,
          w: 12.3,
          h: 0.5,
          fontSize: 18,
          bold: true,
          color: 'FFFFFF',
          fontFace: 'Calibri',
        });

        let curY = 1.15;
        let bodyHtml = '';
        const bodyLines = chunk.slice(1);

        for (const l of bodyLines) {
          const isHead = l.fontSize >= 13;
          if (curY < 6.9) {
            slide.addText(l.fullText, {
              x: 0.6,
              y: curY,
              w: 12.1,
              h: isHead ? 0.35 : 0.28,
              fontSize: isHead ? 13 : 11,
              bold: isHead,
              color: isHead ? accentHex : rightTextHex,
              fontFace: 'Calibri',
            });
            curY += isHead ? 0.38 : 0.3;
          }
          bodyHtml += `<div style="color:#${
            isHead ? accentHex : rightTextHex
          }; font-weight:${isHead ? '700' : '400'}; font-size:${
            isHead ? '12px' : '11px'
          }; margin:5px 0;">• ${l.fullText}</div>`;
        }

        slidePreviewCards.push(`
          <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#${rightBgHex}; box-shadow:0 6px 18px rgba(15,23,42,0.08);">
            <div style="padding:10px 16px; background:#${primaryDarkHex}; color:#ffffff; font-weight:800; font-size:13px; display:flex; justify-content:space-between;">
              <span>${slideTitle.slice(0, 70)}</span>
              <span style="font-size:10px; opacity:0.8;">SLIDE ${slideCount}</span>
            </div>
            <div style="padding:16px 20px; min-height:210px;">
              ${bodyHtml || '<div style="color:#64748b; font-size:12px;">Visual Page Content</div>'}
            </div>
          </div>
        `);
      }
    }

    // If mode is 'hybrid-with-snapshot' and we have a high-res page render, append a High-Fidelity Visual Reference Slide
    if (mode === 'hybrid-with-snapshot' && page.pageDataUrl) {
      slideCount++;
      const snapSlide = pptx.addSlide();
      snapSlide.background = { color: '0F172A' };

      snapSlide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.55,
        fill: { color: primaryDarkHex },
        line: { color: primaryDarkHex, width: 0 },
      });
      snapSlide.addText(
        `Page ${page.pageNumber} — Original High-Resolution Visual Layout`,
        {
          x: 0.4,
          y: 0.1,
          w: 12.5,
          h: 0.35,
          fontSize: 12,
          bold: true,
          color: 'FFFFFF',
          fontFace: 'Calibri',
        }
      );

      const pageAspect = page.width / Math.max(1, page.height);
      const imgH = 6.65;
      const imgW = Math.min(12.2, Number((imgH * pageAspect).toFixed(2)));
      const imgX = Number(((13.333 - imgW) / 2).toFixed(2));

      snapSlide.addImage({
        data: page.pageDataUrl,
        x: imgX,
        y: 0.68,
        w: imgW,
        h: imgH,
      });

      slidePreviewCards.push(`
        <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#0f172a; box-shadow:0 6px 18px rgba(15,23,42,0.12);">
          <div style="padding:8px 14px; background:#1e293b; color:#e2e8f0; font-size:11px; font-weight:700; display:flex; justify-content:space-between;">
            <span>SLIDE ${slideCount} · FULL-FIDELITY ORIGINAL VISUAL SLIDE</span>
            <span style="color:#f59e0b;">100% EXACT LAYOUT</span>
          </div>
          <div style="padding:14px; display:flex; justify-content:center; background:#0f172a;">
            <img src="${page.pageDataUrl}" style="max-height:260px; width:auto; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.4);" alt="Original Page ${page.pageNumber}" />
          </div>
        </div>
      `);
    }
  }

  const outArrayBuffer = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  return {
    pptxBytes: new Uint8Array(outArrayBuffer),
    previewHtml: slidePreviewCards.join('\n'),
    slideCount,
  };
}

export interface ExcelGenerationOptions {
  mode?: 'auto-smart' | 'structured-tables' | 'visual-layout';
  drawBorders?: boolean;
  embedPhotos?: boolean;
  documentTitle?: string;
}

/**
 * Generates a real, native Microsoft Excel (.XLSX) workbook using ExcelJS
 * with drawn table borders, colored headers, merged cells, embedded images,
 * AND a rich HTML Excel Spreadsheet Grid preview.
 */
export async function generateProfessionalExcelFromPages(
  extractedPages: ExtractedPdfPage[],
  options: ExcelGenerationOptions = {}
): Promise<{ xlsxBytes: Uint8Array; previewHtml: string; totalRows: number }> {
  const mode = options.mode || 'auto-smart';
  const drawBorders = options.drawBorders !== false;
  const embedPhotos = options.embedPhotos !== false;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ToolNova Smart Excel Engine';
  workbook.created = new Date();

  const sheetPreviewHtmlBlocks: string[] = [];
  let totalRows = 0;

  const thinBorder: Partial<ExcelJS.Borders> = drawBorders
    ? {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      }
    : {};

  for (const page of extractedPages) {
    const ws = workbook.addWorksheet(`Page ${page.pageNumber}`, {
      views: [{ showGridLines: true }],
    });

    const primaryHex = page.hasDarkSidebar ? page.sidebarBgHex : '142642';
    const accentHex = page.accentHex || 'C86D3B';

    const useTwoColVisual =
      mode === 'visual-layout' || (mode === 'auto-smart' && page.isTwoColumn);

    if (useTwoColVisual && page.isTwoColumn) {
      // ================== 1. DRAWN 2-COLUMN CV / SIDEBAR + STRUCTURED EXPERIENCES TABLE ==================
      ws.columns = [
        { key: 'colA', width: 22 }, // Left Sidebar Category / Label
        { key: 'colB', width: 32 }, // Left Sidebar Value
        { key: 'colC', width: 3 },  // Spacer Gutter
        { key: 'colD', width: 28 }, // Right Main Role / Section
        { key: 'colE', width: 26 }, // Right Main Organization / Subtitle
        { key: 'colF', width: 48 }, // Right Main Details / Description
        { key: 'colG', width: 18 }, // Right Main Period / Date
      ];

      // Embed Profile Photo if available
      if (embedPhotos && page.extractedPhotoDataUrl) {
        const imgId = workbook.addImage({
          base64: page.extractedPhotoDataUrl,
          extension: 'png',
        });
        ws.addImage(imgId, {
          tl: { col: 0.35, row: 1.2 },
          ext: { width: 115, height: 115 },
        });
      }

      // Structured Parse of Left Sidebar into rows
      const leftStructured: { type: 'header' | 'item'; text: string }[] = [];
      for (const l of page.leftLines) {
        const t = l.fullText;
        const isHead =
          t.length >= 4 &&
          t === t.toUpperCase() &&
          !/^\d/.test(t) &&
          !t.includes('@');
        leftStructured.push({ type: isHead ? 'header' : 'item', text: t });
      }

      // Structured Parse of Right Column into Hero, Sections, and Tabular Experience Rows!
      let heroName = options.documentTitle || 'DOCUMENT';
      let heroRole = '';
      const rightTableRows: {
        kind: 'section' | 'profile-text' | 'exp-row';
        col1: string;
        col2?: string;
        col3?: string;
        col4?: string;
      }[] = [];

      let currentExp: {
        role: string;
        date: string;
        org: string;
        bullets: string[];
      } | null = null;

      const flushCurrentExp = () => {
        if (currentExp) {
          rightTableRows.push({
            kind: 'exp-row',
            col1: currentExp.role,
            col2: currentExp.org || '—',
            col3: currentExp.bullets.join(' • '),
            col4: currentExp.date,
          });
          currentExp = null;
        }
      };

      for (let i = 0; i < page.rightLines.length; i++) {
        const line = page.rightLines[i];
        const text = line.fullText;

        if (i === 0 && (line.fontSize >= 16 || text === text.toUpperCase())) {
          heroName = text;
          continue;
        }
        if (
          i === 1 &&
          page.rightLines[0] &&
          text === text.toUpperCase() &&
          line.topY - page.rightLines[0].topY < 35
        ) {
          heroRole = text;
          continue;
        }

        const isSection =
          text.length >= 4 && text === text.toUpperCase() && !/^\d/.test(text);
        if (isSection) {
          flushCurrentExp();
          rightTableRows.push({ kind: 'section', col1: text });
          continue;
        }

        const { leftTitle, rightDate } = splitJobTitleAndDate(line, page.width);
        if (rightDate) {
          flushCurrentExp();
          currentExp = {
            role: leftTitle,
            date: rightDate,
            org: '',
            bullets: [],
          };
          continue;
        }

        if (currentExp) {
          if (!currentExp.org && text.length < 48) {
            currentExp.org = text;
          } else {
            currentExp.bullets.push(text);
          }
        } else {
          rightTableRows.push({ kind: 'profile-text', col1: text });
        }
      }
      flushCurrentExp();

      // Build Excel Sheet Rows
      // Row 1 & 2: Top Banner
      ws.mergeCells('A1:B2');
      const sidebarTopCell = ws.getCell('A1');
      sidebarTopCell.value = 'INFORMATIONS & COMPÉTENCES';
      sidebarTopCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${primaryHex}` },
      };
      sidebarTopCell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: `FF${accentHex}` },
      };
      sidebarTopCell.alignment = { vertical: 'middle', horizontal: 'center' };

      ws.mergeCells('D1:G1');
      const heroNameCell = ws.getCell('D1');
      heroNameCell.value = heroName;
      heroNameCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${primaryHex}` },
      };
      heroNameCell.font = {
        name: 'Calibri',
        size: 16,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      heroNameCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(1).height = 28;

      ws.mergeCells('D2:G2');
      const heroRoleCell = ws.getCell('D2');
      heroRoleCell.value = heroRole;
      heroRoleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${accentHex}` },
      };
      heroRoleCell.font = {
        name: 'Calibri',
        size: 10.5,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      heroRoleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(2).height = 22;

      // Reserve rows 3..7 on Left Sidebar if photo is embedded
      const leftStartRow = embedPhotos && page.extractedPhotoDataUrl ? 8 : 3;
      for (let r = 3; r < leftStartRow; r++) {
        ws.mergeCells(`A${r}:B${r}`);
        const c = ws.getCell(`A${r}`);
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${primaryHex}` },
        };
        ws.getRow(r).height = 20;
      }

      // Populate Left Sidebar Items starting at leftStartRow
      let maxLeftRow = leftStartRow;
      leftStructured.forEach((item, idx) => {
        const rNum = leftStartRow + idx;
        maxLeftRow = Math.max(maxLeftRow, rNum);
        ws.mergeCells(`A${rNum}:B${rNum}`);
        const cell = ws.getCell(`A${rNum}`);
        cell.value = item.text;
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${primaryHex}` },
        };
        if (item.type === 'header') {
          cell.font = {
            name: 'Calibri',
            size: 10.5,
            bold: true,
            color: { argb: `FF${accentHex}` },
          };
          cell.border = {
            bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
          };
        } else {
          cell.font = {
            name: 'Calibri',
            size: 9.5,
            color: { argb: 'FFFFFFFF' },
          };
        }
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (!ws.getRow(rNum).height) ws.getRow(rNum).height = 20;
      });

      // Populate Right Main Column Drawn Tables starting at Row 4
      let rightRowCursor = 4;
      let expHeaderDrawn = false;

      for (const rItem of rightTableRows) {
        if (rItem.kind === 'section') {
          expHeaderDrawn = false;
          ws.mergeCells(`D${rightRowCursor}:G${rightRowCursor}`);
          const secCell = ws.getCell(`D${rightRowCursor}`);
          secCell.value = rItem.col1;
          secCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          secCell.font = {
            name: 'Calibri',
            size: 11,
            bold: true,
            color: { argb: `FF${primaryHex}` },
          };
          secCell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
          secCell.alignment = { vertical: 'middle' };
          ws.getRow(rightRowCursor).height = 24;
          rightRowCursor++;
        } else if (rItem.kind === 'profile-text') {
          ws.mergeCells(`D${rightRowCursor}:G${rightRowCursor}`);
          const pCell = ws.getCell(`D${rightRowCursor}`);
          pCell.value = rItem.col1;
          pCell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          pCell.border = thinBorder;
          pCell.alignment = { vertical: 'middle', wrapText: true };
          ws.getRow(rightRowCursor).height = 19;
          rightRowCursor++;
        } else if (rItem.kind === 'exp-row') {
          // Automatically draw a formal Table Header row before the first structured Experience row!
          if (!expHeaderDrawn) {
            const headers = [
              { col: 'D', label: 'Poste / Fonction' },
              { col: 'E', label: 'Entreprise / Établissement' },
              { col: 'F', label: 'Missions & Réalisations Clés' },
              { col: 'G', label: 'Période / Date' },
            ];
            for (const h of headers) {
              const hCell = ws.getCell(`${h.col}${rightRowCursor}`);
              hCell.value = h.label;
              hCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: `FF${primaryHex}` },
              };
              hCell.font = {
                name: 'Calibri',
                size: 10,
                bold: true,
                color: { argb: 'FFFFFFFF' },
              };
              hCell.border = thinBorder;
              hCell.alignment = { vertical: 'middle', horizontal: 'left' };
            }
            ws.getRow(rightRowCursor).height = 23;
            rightRowCursor++;
            expHeaderDrawn = true;
          }

          const cRole = ws.getCell(`D${rightRowCursor}`);
          const cOrg = ws.getCell(`E${rightRowCursor}`);
          const cDesc = ws.getCell(`F${rightRowCursor}`);
          const cDate = ws.getCell(`G${rightRowCursor}`);

          cRole.value = rItem.col1;
          cRole.font = {
            name: 'Calibri',
            size: 10,
            bold: true,
            color: { argb: `FF${primaryHex}` },
          };

          cOrg.value = rItem.col2;
          cOrg.font = {
            name: 'Calibri',
            size: 10,
            italic: true,
            color: { argb: `FF${accentHex}` },
          };

          cDesc.value = rItem.col3;
          cDesc.font = {
            name: 'Calibri',
            size: 9.5,
            color: { argb: 'FF1E293B' },
          };

          cDate.value = rItem.col4;
          cDate.font = {
            name: 'Calibri',
            size: 9.5,
            bold: true,
            color: { argb: 'FF334155' },
          };

          [cRole, cOrg, cDesc, cDate].forEach((c) => {
            c.border = thinBorder;
            c.alignment = { vertical: 'top', wrapText: true };
          });

          ws.getRow(rightRowCursor).height = 42;
          rightRowCursor++;
        }
      }

      const finalMaxRow = Math.max(maxLeftRow, rightRowCursor - 1);
      // Fill any remaining sidebar cells down to finalMaxRow so the dark navy column is continuous
      for (let r = maxLeftRow + 1; r <= finalMaxRow; r++) {
        ws.mergeCells(`A${r}:B${r}`);
        const c = ws.getCell(`A${r}`);
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: `FF${primaryHex}` },
        };
      }

      totalRows += finalMaxRow;

      // Build Interactive Excel Grid Preview HTML for this 2-Column Sheet
      const leftRowsHtml = leftStructured
        .map((it) =>
          it.type === 'header'
            ? `<div style="color:#${accentHex}; font-weight:800; font-size:10.5px; border-bottom:1.5px solid #${accentHex}; padding:6px 0 3px 0; margin-top:8px;">${it.text}</div>`
            : `<div style="color:#ffffff; font-size:10px; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.08);">${it.text}</div>`
        )
        .join('');

      let rightTableHtml = '';
      let inExpTable = false;

      for (const rItem of rightTableRows) {
        if (rItem.kind === 'section') {
          if (inExpTable) {
            rightTableHtml += `</tbody></table>`;
            inExpTable = false;
          }
          rightTableHtml += `
            <div style="background:#f1f5f9; color:#${primaryHex}; font-weight:800; font-size:11px; padding:6px 10px; border:1px solid #cbd5e1; border-bottom:2px solid #${accentHex}; margin-top:10px;">
              ${rItem.col1}
            </div>
          `;
        } else if (rItem.kind === 'profile-text') {
          rightTableHtml += `
            <div style="padding:4px 10px; font-size:10.5px; color:#1e293b; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #f1f5f9;">
              ${rItem.col1}
            </div>
          `;
        } else if (rItem.kind === 'exp-row') {
          if (!inExpTable) {
            rightTableHtml += `
              <table style="width:100%; border-collapse:collapse; font-size:10.5px; margin-top:4px;">
                <thead>
                  <tr style="background:#${primaryHex}; color:#ffffff; text-align:left;">
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:20%;">Poste / Fonction</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:22%;">Établissement</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:40%;">Missions &amp; Détails</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:18%;">Période</th>
                  </tr>
                </thead>
                <tbody>
            `;
            inExpTable = true;
          }
          rightTableHtml += `
            <tr style="background:#ffffff;">
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:700; color:#${primaryHex}; vertical-align:top;">${rItem.col1}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-style:italic; color:#${accentHex}; vertical-align:top;">${rItem.col2}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; color:#1e293b; vertical-align:top; line-height:1.45;">${rItem.col3}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:600; color:#334155; vertical-align:top; white-space:nowrap;">${rItem.col4}</td>
            </tr>
          `;
        }
      }
      if (inExpTable) {
        rightTableHtml += `</tbody></table>`;
      }

      sheetPreviewHtmlBlocks.push(`
        <div style="border:1px solid #94a3b8; border-radius:10px; overflow:hidden; background:#ffffff; box-shadow:0 4px 14px rgba(15,23,42,0.08); margin-bottom:18px; font-family:'Calibri','Plus Jakarta Sans',sans-serif;">
          <!-- Excel Formula / Sheet Header Bar -->
          <div style="background:#107c41; color:#ffffff; padding:7px 12px; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
            <span>SHEET: Page ${page.pageNumber} · DRAWN EXCEL TABLE (.XLSX)</span>
            <span style="background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:4px; font-family:monospace; font-size:10px;">Columns A–G · ${finalMaxRow} Rows</span>
          </div>
          <!-- Excel Column Letters Header -->
          <div style="display:grid; grid-template-columns: 32% 68%; background:#f1f5f9; border-bottom:1px solid #cbd5e1; font-family:monospace; font-size:10px; color:#475569; font-weight:700; text-align:center;">
            <div style="padding:4px; border-right:1px solid #cbd5e1;">COL A : B (SIDEBAR)</div>
            <div style="padding:4px;">COL D : E : F : G (DRAWN DATA TABLES)</div>
          </div>
          <div style="display:flex; width:100%;">
            <div style="width:32%; background:#${primaryHex}; padding:12px; box-sizing:border-box;">
              ${
                embedPhotos && page.extractedPhotoDataUrl
                  ? `<div style="text-align:center; margin-bottom:10px;"><img src="${page.extractedPhotoDataUrl}" style="width:78px; height:78px; border-radius:50%; border:2px solid #${accentHex}; display:inline-block;" alt="Avatar" /></div>`
                  : ''
              }
              ${leftRowsHtml}
            </div>
            <div style="width:68%; padding:12px; box-sizing:border-box; background:#ffffff; overflow-x:auto;">
              <div style="background:#${primaryHex}; color:#ffffff; font-weight:800; font-size:14px; text-align:center; padding:6px;">${heroName}</div>
              <div style="background:#${accentHex}; color:#ffffff; font-weight:700; font-size:10px; text-align:center; padding:4px; margin-bottom:8px;">${heroRole}</div>
              ${rightTableHtml}
            </div>
          </div>
        </div>
      `);
    } else {
      // ================== 2. GENERAL MULTI-COLUMN DRAWN EXCEL TABLE ==================
      // Cluster X coordinates across the page to detect columns automatically
      const allLines = page.lines;
      let maxCols = Math.max(1, ...allLines.map((l) => l.cells.length));
      maxCols = Math.min(8, Math.max(2, maxCols));

      for (let c = 1; c <= maxCols; c++) {
        ws.getColumn(c).width = c === 1 ? 28 : Math.round(75 / Math.max(1, maxCols - 1));
      }

      let curRow = 1;
      let htmlRows = '';

      for (const line of allLines) {
        const row = ws.getRow(curRow);
        if (line.isHeading || line.cells.length === 1) {
          ws.mergeCells(curRow, 1, curRow, maxCols);
          const cell = ws.getCell(curRow, 1);
          cell.value = line.fullText;
          if (line.isHeading) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: `FF${primaryHex}` },
            };
            cell.font = {
              name: 'Calibri',
              size: 11,
              bold: true,
              color: { argb: 'FFFFFFFF' },
            };
            row.height = 24;
          } else {
            cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
            row.height = 19;
          }
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', wrapText: true };

          htmlRows += `
            <tr style="background:${line.isHeading ? `#${primaryHex}` : '#ffffff'}; color:${
            line.isHeading ? '#ffffff' : '#1e293b'
          }; font-weight:${line.isHeading ? '700' : '400'};">
              <td colspan="${maxCols}" style="padding:6px 10px; border:1px solid #cbd5e1;">${
            line.fullText
          }</td>
            </tr>
          `;
        } else {
          let tds = '';
          for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const cellVal = line.cells[cIdx]?.text || '';
            const c = ws.getCell(curRow, cIdx + 1);
            c.value = cellVal;
            c.font = {
              name: 'Calibri',
              size: 10,
              bold: cIdx === 0,
              color: { argb: 'FF1E293B' },
            };
            c.border = thinBorder;
            c.alignment = { vertical: 'middle', wrapText: true };
            tds += `<td style="padding:6px 8px; border:1px solid #cbd5e1; ${
              cIdx === 0 ? 'font-weight:700; background:#f8fafc;' : ''
            }">${cellVal}</td>`;
          }
          row.height = 20;
          htmlRows += `<tr>${tds}</tr>`;
        }
        curRow++;
      }

      totalRows += curRow - 1;
      sheetPreviewHtmlBlocks.push(`
        <div style="border:1px solid #94a3b8; border-radius:10px; overflow:hidden; background:#ffffff; margin-bottom:18px; font-family:'Calibri',sans-serif;">
          <div style="background:#107c41; color:#ffffff; padding:7px 12px; font-size:11px; font-weight:700; display:flex; justify-content:space-between;">
            <span>SHEET: Page ${page.pageNumber} · DRAWN TABLE (.XLSX)</span>
            <span>${curRow - 1} Rows</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:11px;">
              <tbody>${htmlRows}</tbody>
            </table>
          </div>
        </div>
      `);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    xlsxBytes: new Uint8Array(buffer as ArrayBuffer),
    previewHtml: sheetPreviewHtmlBlocks.join('\n'),
    totalRows,
  };
}

/**
 * Renders a specific page (1-indexed) of a PDF to an HTMLCanvasElement using pdfjs-dist.
 */
export async function renderPdfPageToCanvas(
  pdfBytes: Uint8Array,
  pageNumber = 1,
  scale = 2.0,
  password?: string
): Promise<{ canvas: HTMLCanvasElement; totalPages: number }> {
  let startOffset = 0;
  const searchLimit = Math.min(pdfBytes.length - 5, 1024);
  for (let i = 0; i <= searchLimit; i++) {
    if (
      pdfBytes[i] === 0x25 &&
      pdfBytes[i + 1] === 0x50 &&
      pdfBytes[i + 2] === 0x44 &&
      pdfBytes[i + 3] === 0x46 &&
      pdfBytes[i + 4] === 0x2d
    ) {
      startOffset = i;
      break;
    }
  }
  const dataCopy = new Uint8Array(pdfBytes.subarray(startOffset));

  try {
    const loadingTask = pdfjsLib.getDocument(
      password ? { data: dataCopy, password } : { data: dataCopy }
    );
    const pdfDoc = await loadingTask.promise;
    const clampedPage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber));
    const page = await pdfDoc.getPage(clampedPage);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    }).promise;

    return { canvas, totalPages: pdfDoc.numPages };
  } catch {
    // Fallback: try rendering as an image (JPG/PNG/WebP) onto the canvas
    const blob = new Blob([pdfBytes]);
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Unsupported buffer for canvas rendering'));
        el.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.width || 595;
      canvas.height = img.height || 842;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      return { canvas, totalPages: 1 };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Checks if a PDF buffer is encrypted with a standard PDF user password (e.g. RC4/AES /Encrypt dictionary)
 * by attempting to open it with Mozilla PDF.js without a password, or with the supplied password.
 */
export async function inspectAndUnlockStandardEncryptedPdf(
  pdfBytes: Uint8Array,
  password?: string
): Promise<{
  requiresPassword: boolean;
  passwordValid: boolean;
  totalPages: number;
  pageCanvases: HTMLCanvasElement[];
}> {
  let startOffset = 0;
  const searchLimit = Math.min(pdfBytes.length - 5, 1024);
  for (let i = 0; i <= searchLimit; i++) {
    if (
      pdfBytes[i] === 0x25 &&
      pdfBytes[i + 1] === 0x50 &&
      pdfBytes[i + 2] === 0x44 &&
      pdfBytes[i + 3] === 0x46 &&
      pdfBytes[i + 4] === 0x2d
    ) {
      startOffset = i;
      break;
    }
  }

  // First test without password to see if the PDF actually requires a user password to open
  try {
    const noPwCopy = new Uint8Array(pdfBytes.subarray(startOffset));
    const testDoc = await pdfjsLib.getDocument({ data: noPwCopy }).promise;
    return {
      requiresPassword: false,
      passwordValid: true,
      totalPages: testDoc.numPages,
      pageCanvases: [],
    };
  } catch (err: unknown) {
    const errName = (err as { name?: string })?.name || '';
    const errMsg = String((err as { message?: string })?.message || err || '');
    const isPasswordErr =
      errName === 'PasswordException' ||
      /password/i.test(errMsg) ||
      /encrypted/i.test(errMsg);

    if (!isPasswordErr) {
      return {
        requiresPassword: false,
        passwordValid: true,
        totalPages: 1,
        pageCanvases: [],
      };
    }
  }

  // If it requires a password and none was provided yet:
  if (!password || !password.trim()) {
    return {
      requiresPassword: true,
      passwordValid: false,
      totalPages: 1,
      pageCanvases: [],
    };
  }

  // Try opening with the provided password
  try {
    const pwCopy = new Uint8Array(pdfBytes.subarray(startOffset));
    const unlockedDoc = await pdfjsLib.getDocument({
      data: pwCopy,
      password: password.trim(),
    }).promise;

    const canvases: HTMLCanvasElement[] = [];
    const scale = 1.8;
    for (let p = 1; p <= unlockedDoc.numPages; p++) {
      const page = await unlockedDoc.getPage(p);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      canvases.push(canvas);
    }

    return {
      requiresPassword: true,
      passwordValid: true,
      totalPages: unlockedDoc.numPages,
      pageCanvases: canvases,
    };
  } catch {
    return {
      requiresPassword: true,
      passwordValid: false,
      totalPages: 1,
      pageCanvases: [],
    };
  }
}

/**
 * Pure TypeScript GIF89a Animated GIF Encoder
 */
export function encodeFramesToAnimatedGif(
  frames: ImageData[],
  width: number,
  height: number,
  fps = 12
): Blob {
  const bytes: number[] = [];
  const writeByte = (b: number) => bytes.push(b & 0xff);
  const writeShort = (s: number) => {
    writeByte(s & 0xff);
    writeByte((s >> 8) & 0xff);
  };
  const writeString = (str: string) => {
    for (let i = 0; i < str.length; i++) writeByte(str.charCodeAt(i));
  };

  writeString('GIF89a');
  writeShort(width);
  writeShort(height);
  writeByte(0xf7);
  writeByte(0x00);
  writeByte(0x00);

  for (let i = 0; i < 256; i++) {
    const r = ((i >> 5) & 0x07) * 36;
    const g = ((i >> 2) & 0x07) * 36;
    const b = (i & 0x03) * 85;
    writeByte(r);
    writeByte(g);
    writeByte(b);
  }

  writeByte(0x21);
  writeByte(0xff);
  writeByte(0x0b);
  writeString('NETSCAPE2.0');
  writeByte(0x03);
  writeByte(0x01);
  writeShort(0x0000);
  writeByte(0x00);

  const delayHundredths = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  for (const frame of frames) {
    writeByte(0x21);
    writeByte(0xf9);
    writeByte(0x04);
    writeByte(0x00);
    writeShort(delayHundredths);
    writeByte(0x00);
    writeByte(0x00);

    writeByte(0x2c);
    writeShort(0);
    writeShort(0);
    writeShort(width);
    writeShort(height);
    writeByte(0x00);

    const rgba = frame.data;
    const numPixels = width * height;
    const indexed = new Uint8Array(numPixels);
    for (let p = 0; p < numPixels; p++) {
      const offset = p * 4;
      const r = rgba[offset] >> 5;
      const g = rgba[offset + 1] >> 5;
      const b = rgba[offset + 2] >> 6;
      indexed[p] = (r << 5) | (g << 2) | b;
    }

    writeByte(minCodeSize);

    let bitBuffer = 0;
    let bitCount = 0;
    const subBlock: number[] = [];

    const flushSubBlock = () => {
      if (subBlock.length > 0) {
        writeByte(subBlock.length);
        for (let i = 0; i < subBlock.length; i++) writeByte(subBlock[i]);
        subBlock.length = 0;
      }
    };

    const writeCode = (code: number, codeSize: number) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        subBlock.push(bitBuffer & 0xff);
        if (subBlock.length === 255) flushSubBlock();
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };

    const codeSize = 9;
    writeCode(clearCode, codeSize);
    let codesSinceClear = 0;

    for (let p = 0; p < numPixels; p++) {
      writeCode(indexed[p], codeSize);
      codesSinceClear++;
      if (codesSinceClear === 248) {
        writeCode(clearCode, codeSize);
        codesSinceClear = 0;
      }
    }

    writeCode(endCode, codeSize);
    if (bitCount > 0) {
      subBlock.push(bitBuffer & 0xff);
    }
    flushSubBlock();
    writeByte(0x00);
  }

  writeByte(0x3b);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}
