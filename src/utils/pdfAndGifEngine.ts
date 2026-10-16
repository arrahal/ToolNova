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
  HeightRule,
  PageBreak,
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

export interface ExtractedPdfImage {
  x: number;
  topY: number;
  width: number;
  height: number;
  aspectRatio: number;
  dataUrl?: string;
  bytes?: Uint8Array;
}

export interface PdfColorPalette {
  pageBgHex: string;
  primaryBrandHex: string;
  secondaryAccentHex: string;
  textHex: string;
  hasDarkBg: boolean;
  isArabic: boolean;
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
  images: ExtractedPdfImage[];
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
  palette?: PdfColorPalette;
  isArabic?: boolean;
}

function rgbToHex(r: number, g: number, b: number): string {
  return [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Robust Color Palette Extractor: Samples page canvas to detect the exact
 * background color, dominant header/brand color, vibrant accent color, and text luminance.
 */
export function extractPageColorPalette(
  ctx: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null,
  rawText: string
): PdfColorPalette {
  const isArabic = /[\u0600-\u06FF]/.test(rawText);
  if (!ctx || !canvas) {
    return {
      pageBgHex: 'FFFFFF',
      primaryBrandHex: '1E3A8A',
      secondaryAccentHex: 'E5322D',
      textHex: '1E293B',
      hasDarkBg: false,
      isArabic,
    };
  }

  try {
    const W = canvas.width;
    const H = canvas.height;
    // 1. Detect background color from corner & edge margins
    const cornerSamples = [
      ctx.getImageData(10, 10, 1, 1).data,
      ctx.getImageData(Math.max(1, W - 15), 10, 1, 1).data,
      ctx.getImageData(10, Math.max(1, H - 15), 1, 1).data,
      ctx.getImageData(Math.max(1, W - 15), Math.max(1, H - 15), 1, 1).data,
      ctx.getImageData(Math.floor(W * 0.5), 8, 1, 1).data,
      ctx.getImageData(Math.floor(W * 0.5), Math.max(1, H - 8), 1, 1).data,
    ];
    let avgBgR = 0, avgBgG = 0, avgBgB = 0;
    for (const s of cornerSamples) {
      avgBgR += s[0];
      avgBgG += s[1];
      avgBgB += s[2];
    }
    avgBgR = Math.round(avgBgR / cornerSamples.length);
    avgBgG = Math.round(avgBgG / cornerSamples.length);
    avgBgB = Math.round(avgBgB / cornerSamples.length);
    const pageBgHex = rgbToHex(avgBgR, avgBgG, avgBgB);
    const bgLuminance = 0.299 * avgBgR + 0.587 * avgBgG + 0.114 * avgBgB;
    const hasDarkBg = bgLuminance < 130;

    // 2. Sample grid across the page to find dominant brand & accent colors
    const stepX = Math.max(2, Math.floor(W / 36));
    const stepY = Math.max(2, Math.floor(H / 36));
    const sampleImg = ctx.getImageData(0, 0, W, H);
    const pixels = sampleImg.data;

    const colorBuckets = new Map<string, { count: number; r: number; g: number; b: number }>();
    let darkTextCount = 0;
    let lightTextCount = 0;

    for (let y = 0; y < H; y += stepY) {
      for (let x = 0; x < W; x += stepX) {
        const idx = (y * W + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const chroma = max - min;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        const distFromBg = Math.abs(r - avgBgR) + Math.abs(g - avgBgG) + Math.abs(b - avgBgB);
        if (distFromBg < 35) continue;

        if (lum < 90) darkTextCount++;
        else if (lum > 180) lightTextCount++;

        // Saturated colors for brand/accent
        if (chroma >= 28) {
          const qR = Math.round(r / 32) * 32;
          const qG = Math.round(g / 32) * 32;
          const qB = Math.round(b / 32) * 32;
          const key = `${qR},${qG},${qB}`;
          const current = colorBuckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
          current.count += y < H * 0.35 ? 2.5 : 1.0;
          current.r += r;
          current.g += g;
          current.b += b;
          colorBuckets.set(key, current);
        }
      }
    }

    const sortedBuckets = Array.from(colorBuckets.values()).sort((a, b) => b.count - a.count);
    let primaryBrandHex = hasDarkBg ? '38BDF8' : '1E3A8A';
    let secondaryAccentHex = hasDarkBg ? 'F59E0B' : 'E5322D';

    if (sortedBuckets.length > 0) {
      const top1 = sortedBuckets[0];
      const r1 = Math.round(top1.r / top1.count);
      const g1 = Math.round(top1.g / top1.count);
      const b1 = Math.round(top1.b / top1.count);
      primaryBrandHex = rgbToHex(r1, g1, b1);

      if (sortedBuckets.length > 1) {
        const top2 = sortedBuckets.slice(1).find((b) => {
          const r2 = Math.round(b.r / b.count);
          const g2 = Math.round(b.g / b.count);
          const b2 = Math.round(b.b / b.count);
          const diff = Math.abs(r2 - r1) + Math.abs(g2 - g1) + Math.abs(b2 - b1);
          return diff > 50;
        });
        if (top2) {
          const r2 = Math.round(top2.r / top2.count);
          const g2 = Math.round(top2.g / top2.count);
          const b2 = Math.round(top2.b / top2.count);
          secondaryAccentHex = rgbToHex(r2, g2, b2);
        }
      }
    }

    const textHex = hasDarkBg
      ? 'F8FAFC'
      : darkTextCount >= lightTextCount
      ? '1E293B'
      : '0F172A';

    return {
      pageBgHex,
      primaryBrandHex,
      secondaryAccentHex,
      textHex,
      hasDarkBg,
      isArabic,
    };
  } catch {
    return {
      pageBgHex: 'FFFFFF',
      primaryBrandHex: '1E3A8A',
      secondaryAccentHex: 'E5322D',
      textHex: '1E293B',
      hasDarkBg: false,
      isArabic,
    };
  }
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
    const blob = new Blob([pdfBytes as BlobPart]);
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
          images: [
            {
              x: 0,
              topY: 0,
              width: canvas.width,
              height: canvas.height,
              aspectRatio: canvas.width / (canvas.height || 1),
              dataUrl: pageDataUrl,
              bytes: dataUrlToUint8Array(pageDataUrl),
            },
          ],
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

    let hasColoredSidebar = false;
    let splitRatio = 0.34;
    let sidebarBgHex = '142642';
    let hasDarkSidebar = false;
    let renderedPageDataUrl: string | undefined = undefined;

    let renderScale = 1.5;
    let canvasInstance: HTMLCanvasElement | null = null;
    let ctxInstance: CanvasRenderingContext2D | null = null;
    let leftR = 255, leftG = 255, leftB = 255;

    // For large documents (> 25 pages), render canvas lazily for page 1 or text-first to ensure 100% memory safety
    const shouldRenderCanvas = numPages <= 25 || pageNum === 1 || Boolean(options.renderPageImages);
    if (shouldRenderCanvas) {
      try {
        renderScale = options.imageScale || 1.5;
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

        canvasInstance = canvas;
        ctxInstance = ctx;
        renderedPageDataUrl = canvas.toDataURL('image/jpeg', 0.85);

        const sampleY = Math.floor(canvas.height * 0.45);
        const rowPixels = ctx.getImageData(0, sampleY, canvas.width, 1).data;
        leftR = rowPixels[12 * 4];
        leftG = rowPixels[12 * 4 + 1];
        leftB = rowPixels[12 * 4 + 2];

        const rightSampleX = Math.floor(canvas.width * 0.85);
        const rightR = rowPixels[rightSampleX * 4];
        const rightG = rowPixels[rightSampleX * 4 + 1];
        const rightB = rowPixels[rightSampleX * 4 + 2];

        const colorDelta =
          Math.abs(leftR - rightR) + Math.abs(leftG - rightG) + Math.abs(leftB - rightB);

        hasColoredSidebar = colorDelta > 45;
        if (hasColoredSidebar) {
          sidebarBgHex = rgbToHex(leftR, leftG, leftB);
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
        hasDarkSidebar = hasColoredSidebar && leftLuminance < 140;
      } catch {
        // continue safely
      }
    }

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

    if (isTwoColumn && canvasInstance && ctxInstance) {
      const firstLeftTextTopY = leftLines[0]?.topY ?? pageH * 0.45;
      // If there is vertical space above the first left sidebar text item (at least 75pt),
      // inspect that box for a photo / avatar!
      if (firstLeftTextTopY > 85) {
        const cropLeftPx = Math.floor(canvasInstance.width * 0.03);
        const cropWidthPx = Math.floor(canvasInstance.width * (splitRatio - 0.06));
        const cropTopPx = Math.floor(canvasInstance.height * 0.025);
        const cropHeightPx = Math.floor(
          Math.min(
            cropWidthPx * 1.12,
            (firstLeftTextTopY - 18) * renderScale - cropTopPx
          )
        );

        if (cropWidthPx > 40 && cropHeightPx > 40) {
          const imgRegion = ctxInstance.getImageData(
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

    // 3. Detect embedded images via PDF.js Operator List + CTM tracking
    const pageImages: ExtractedPdfImage[] = [];
    try {
      const ops = await page.getOperatorList();
      const matrixStack: number[][] = [[1, 0, 0, 1, 0, 0]];

      const multMat = (m1: number[], m2: number[]) => [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const opsObj = (pdfjsLib as any).OPS || {};
      const saveOp = opsObj.save ?? 10;
      const restoreOp = opsObj.restore ?? 11;
      const transformOp = opsObj.transform ?? 12;
      const paintImgXOp = opsObj.paintImageXObject ?? 82;
      const paintInlineImgOp = opsObj.paintInlineImageXObject ?? 83;
      const paintMaskOp = opsObj.paintImageMaskXObject ?? 84;

      for (let opIdx = 0; opIdx < ops.fnArray.length; opIdx++) {
        const fn = ops.fnArray[opIdx];
        const args = ops.argsArray[opIdx];

        if (fn === saveOp) {
          matrixStack.push([...matrixStack[matrixStack.length - 1]]);
        } else if (fn === restoreOp) {
          if (matrixStack.length > 1) matrixStack.pop();
        } else if (fn === transformOp) {
          if (Array.isArray(args) && args.length >= 6) {
            const current = matrixStack[matrixStack.length - 1];
            matrixStack[matrixStack.length - 1] = multMat(current, args);
          }
        } else if (fn === paintImgXOp || fn === paintInlineImgOp || fn === paintMaskOp) {
          const ctm = matrixStack[matrixStack.length - 1];
          const scaleX = Math.hypot(ctm[0], ctm[1]);
          const scaleY = Math.hypot(ctm[2], ctm[3]);
          const transX = ctm[4];
          const transY = ctm[5];

          const w = Math.round(scaleX);
          const h = Math.round(scaleY);
          const x = Math.round(transX);
          const topY = Math.max(0, Math.round(pageH - (transY + scaleY)));

          const isTiny = w < 20 || h < 20;
          const isFullBg = w >= pageW * 0.96 && h >= pageH * 0.96;
          const isDup = pageImages.some(
            (other) =>
              Math.abs(other.x - x) < 12 &&
              Math.abs(other.topY - topY) < 12 &&
              Math.abs(other.width - w) < 12
          );

          if (!isTiny && !isFullBg && !isDup) {
            pageImages.push({
              x,
              topY,
              width: w,
              height: h,
              aspectRatio: h > 0 ? w / h : 1,
            });
          }
        }
      }
    } catch {
      // Safe fallback if operator list parsing encounters any issue
    }

    // Crop thumbnails and bytes for each detected image
    if (canvasInstance && ctxInstance) {
      for (const img of pageImages) {
        try {
          const cropX = Math.max(0, Math.min(canvasInstance.width - 2, Math.floor(img.x * renderScale)));
          const cropY = Math.max(0, Math.min(canvasInstance.height - 2, Math.floor(img.topY * renderScale)));
          const cropW = Math.max(2, Math.min(canvasInstance.width - cropX, Math.floor(img.width * renderScale)));
          const cropH = Math.max(2, Math.min(canvasInstance.height - cropY, Math.floor(img.height * renderScale)));

          if (cropW > 10 && cropH > 10) {
            const imgData = ctxInstance.getImageData(cropX, cropY, cropW, cropH);
            const offscreen = document.createElement('canvas');
            offscreen.width = cropW;
            offscreen.height = cropH;
            const offCtx = offscreen.getContext('2d')!;
            offCtx.putImageData(imgData, 0, 0);
            img.dataUrl = offscreen.toDataURL('image/jpeg', 0.85);
            img.bytes = dataUrlToUint8Array(img.dataUrl);
          }
        } catch {
          // Safe skip
        }
      }

      // If profile photo was detected and not yet in pageImages, insert it
      if (extractedPhotoPngBytes && extractedPhotoDataUrl) {
        const photoW = Math.round((canvasInstance.width * (splitRatio - 0.06)) / renderScale);
        const photoH = Math.round(photoW / extractedPhotoAspect);
        const hasOverlap = pageImages.some((im) => im.x < pageW * splitRatio && im.topY < 160);
        if (!hasOverlap) {
          pageImages.unshift({
            x: Math.round(pageW * 0.03),
            topY: Math.round(pageH * 0.025),
            width: photoW,
            height: photoH,
            aspectRatio: extractedPhotoAspect,
            dataUrl: extractedPhotoDataUrl,
            bytes: extractedPhotoPngBytes,
          });
        }
      }

      // If document is purely an image/scanned page without text
      if (rawItems.length === 0 && pageImages.length === 0) {
        const fullUrl = canvasInstance.toDataURL('image/jpeg', 0.88);
        pageImages.push({
          x: 0,
          topY: 0,
          width: Math.round(pageW),
          height: Math.round(pageH),
          aspectRatio: pageW / (pageH || 1),
          dataUrl: fullUrl,
          bytes: dataUrlToUint8Array(fullUrl),
        });
      }
    }

    // Legacy single-list lines for Markdown/Excel compatibility
    const allLines = isTwoColumn
      ? [...leftLines, ...rightLines]
      : rightLines;

    let pageDataUrl: string | undefined = renderedPageDataUrl;
    if ((options.renderPageImages || allLines.length === 0) && canvasInstance && !pageDataUrl) {
      pageDataUrl = canvasInstance.toDataURL('image/jpeg', options.imageQuality ?? 0.88);
    }

    const pageRawText = allLines.map((l) => l.fullText).join('\n');
    const pagePalette = extractPageColorPalette(ctxInstance, canvasInstance, pageRawText);

    extractedPages.push({
      pageNumber: pageNum,
      width: pageW,
      height: pageH,
      isTwoColumn,
      hasDarkSidebar: hasDarkSidebar || (hasColoredSidebar && pagePalette.hasDarkBg),
      sidebarBgHex: hasColoredSidebar ? sidebarBgHex : pagePalette.primaryBrandHex,
      accentHex: pagePalette.secondaryAccentHex,
      splitRatio,
      extractedPhotoPngBytes,
      extractedPhotoDataUrl,
      extractedPhotoAspect,
      images: pageImages,
      leftLines,
      rightLines,
      lines: allLines.map((l) => ({
        y: Math.round(pageH - l.topY),
        fontSize: l.fontSize,
        isHeading: l.fontSize >= 13,
        cells: l.cells.map((c) => ({ x: Math.round(c.x), text: c.text })),
        fullText: l.fullText,
      })),
      rawText: pageRawText,
      pageDataUrl,
      palette: pagePalette,
      isArabic: pagePalette.isArabic,
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

export interface DocxGenerationOptions {
  includeFullPageSnapshot?: boolean;
  imageMode?: 'framed-placeholder' | 'framed-with-image' | 'no-frames';
  preservePageBreaks?: boolean;
}

function createImagePlaceholderDocxBox(
  image: ExtractedPdfImage,
  maxAvailableWidthDxa: number,
  imageMode: 'framed-placeholder' | 'framed-with-image' | 'no-frames' = 'framed-placeholder'
): Table {
  const maxWidthPt = maxAvailableWidthDxa / 20;
  const targetWidthPt = Math.max(120, Math.min(image.width, maxWidthPt));
  const targetHeightPt = Math.max(45, Math.min(image.height, 460));
  const targetWidthDxa = Math.round(targetWidthPt * 20);
  const targetHeightDxa = Math.round(targetHeightPt * 20);

  const cellChildren: Paragraph[] = [];

  if (imageMode === 'framed-with-image' && image.bytes) {
    cellChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 60 },
        children: [
          new ImageRun({
            data: image.bytes,
            transformation: {
              width: Math.min(targetWidthPt - 20, 420),
              height: Math.min(targetHeightPt - 20, 380),
            },
            type: 'jpg',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [
          new TextRun({
            text: `[ صورة / Image: ${Math.round(image.width)} × ${Math.round(image.height)} pt ]`,
            color: '64748B',
            size: 18,
            font: 'Calibri',
          }),
        ],
      })
    );
  } else {
    // Mode 'framed-placeholder' (exact user requirement)
    cellChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 40 },
        children: [
          new TextRun({
            text: '🖼️ [ صورة / Image ]',
            bold: true,
            color: '334155',
            size: 22,
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
        children: [
          new TextRun({
            text: `[ الحجم الأصلي في الملف: ${Math.round(image.width)} × ${Math.round(image.height)} pt ]`,
            color: '64748B',
            size: 18,
            font: 'Calibri',
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: targetWidthDxa, type: WidthType.DXA },
    alignment: AlignmentType.CENTER,
    borders: {
      top: { style: BorderStyle.DASHED, size: 8, color: '64748B' },
      bottom: { style: BorderStyle.DASHED, size: 8, color: '64748B' },
      left: { style: BorderStyle.DASHED, size: 8, color: '64748B' },
      right: { style: BorderStyle.DASHED, size: 8, color: '64748B' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        height: { value: targetHeightDxa, rule: HeightRule.ATLEAST },
        children: [
          new TableCell({
            width: { size: targetWidthDxa, type: WidthType.DXA },
            verticalAlign: VerticalAlign.CENTER,
            shading: {
              fill: 'F8FAFC',
              type: ShadingType.CLEAR,
              color: 'auto',
            },
            margins: {
              top: 140,
              bottom: 140,
              left: 180,
              right: 180,
            },
            children: cellChildren,
          }),
        ],
      }),
    ],
  });
}

function createImagePlaceholderHtml(
  image: ExtractedPdfImage,
  maxAvailableWidthPx: number,
  imageMode: 'framed-placeholder' | 'framed-with-image' | 'no-frames' = 'framed-placeholder'
): string {
  const w = Math.round(Math.max(120, Math.min(image.width, maxAvailableWidthPx)));
  const h = Math.round(Math.max(65, Math.min(260, image.height)));

  if (imageMode === 'framed-with-image' && image.dataUrl) {
    return `
      <div style="width:${w}px; max-width:100%; border:2px dashed #94a3b8; border-radius:8px; background:#f8fafc; padding:10px; margin:16px auto; box-sizing:border-box; text-align:center;">
        <img src="${image.dataUrl}" style="max-width:100%; max-height:${h}px; border-radius:4px; display:inline-block; margin-bottom:6px;" alt="Extracted Image" />
        <div style="font-size:11px; font-weight:700; color:#475569;">[ صورة / Image: ${Math.round(image.width)} × ${Math.round(image.height)} pt ]</div>
      </div>
    `;
  }

  return `
    <div style="width:${w}px; max-width:100%; min-height:${h}px; border:2px dashed #64748b; border-radius:8px; background:#f8fafc; display:flex; flex-direction:column; align-items:center; justify-content:center; margin:16px auto; padding:12px; box-sizing:border-box; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <div style="font-weight:700; color:#334155; font-size:13.5px; display:flex; align-items:center; gap:6px;">
        🖼️ [ صورة / Image ]
      </div>
      <div style="font-size:11px; color:#64748b; margin-top:4px; font-family:'JetBrains Mono',monospace;">
        الحجم في الملف الأصلي: ${Math.round(image.width)} × ${Math.round(image.height)} pt
      </div>
    </div>
  `;
}

/**
 * Generates BOTH a native OpenXML .docx binary file (via the `docx` package)
 * AND a rich HTML visual preview that faithfully preserves:
 * 1. Exact page order and page breaks (Page 1 = Page 1, Page 2 = Page 2)
 * 2. Mise-en-page (2-column sidebars or clean single-column hierarchy)
 * 3. Exact position and size-framed placeholder boxes for images ("الصورة / Image داخل إطار")
 */
export async function generateEditableDocxFromPages(
  extractedPages: ExtractedPdfPage[],
  options: DocxGenerationOptions = {}
): Promise<{ docxBytes: Uint8Array; previewHtml: string; imageFramesCount: number }> {
  const docChildren: (Paragraph | Table)[] = [];
  const previewHtmlSections: string[] = [];
  let totalImageFramesCount = 0;

  for (let pageIdx = 0; pageIdx < extractedPages.length; pageIdx++) {
    const page = extractedPages[pageIdx];
    const isFirstPage = pageIdx === 0;

    // Insert clean page break between pages to guarantee 100% preservation of multi-page layout
    if (!isFirstPage && options.preservePageBreaks !== false) {
      docChildren.push(
        new Paragraph({
          pageBreakBefore: true,
          children: [],
        })
      );
      previewHtmlSections.push(`
        <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin:28px 0 20px 0; color:#64748b; font-size:11.5px; font-weight:700;">
          <div style="flex:1; border-top:1px dashed #cbd5e1;"></div>
          <span style="background:#f1f5f9; padding:4px 12px; border-radius:6px; border:1px solid #e2e8f0;">📄 فاصل صفحة Word (الصفحة ${page.pageNumber} من ${extractedPages.length})</span>
          <div style="flex:1; border-top:1px dashed #cbd5e1;"></div>
        </div>
      `);
    }

    if (page.isTwoColumn) {
      // ================== 2-COLUMN CV / SIDEBAR RECONSTRUCTION ==================
      const leftParagraphs: (Paragraph | Table)[] = [];
      let leftHtml = '';

      // 1. Profile Photo / Avatar at top of Left Sidebar
      if (page.extractedPhotoPngBytes && page.extractedPhotoDataUrl) {
        totalImageFramesCount++;
        const imgW = 150;
        const imgH = Math.round(imgW / (page.extractedPhotoAspect || 1));

        if (options.imageMode === 'framed-placeholder') {
          // Framed placeholder box matching exact size
          leftParagraphs.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 120, after: 60 },
              border: {
                top: { color: '94A3B8', space: 6, style: BorderStyle.DASHED, size: 6 },
                bottom: { color: '94A3B8', space: 6, style: BorderStyle.DASHED, size: 6 },
                left: { color: '94A3B8', space: 6, style: BorderStyle.DASHED, size: 6 },
                right: { color: '94A3B8', space: 6, style: BorderStyle.DASHED, size: 6 },
              },
              children: [
                new TextRun({
                  text: '🖼️ [ صورة / Image ]',
                  bold: true,
                  color: page.hasDarkSidebar ? 'FFFFFF' : '1E293B',
                  size: 20,
                  font: 'Calibri',
                }),
                new TextRun({
                  text: `\n[ ${imgW} × ${imgH} pt ]`,
                  color: page.hasDarkSidebar ? 'CBD5E1' : '64748B',
                  size: 16,
                  font: 'Calibri',
                }),
              ],
            })
          );
          leftHtml += `<div style="text-align:center; margin:8px 0 22px 0; border:2px dashed #94a3b8; border-radius:8px; padding:16px 8px; background:rgba(255,255,255,0.08);">
            <div style="font-weight:700; color:${page.hasDarkSidebar ? '#ffffff' : '#1e293b'}; font-size:12px;">🖼️ [ صورة / Image ]</div>
            <div style="font-size:10px; color:${page.hasDarkSidebar ? '#cbd5e1' : '#64748b'}; margin-top:3px;">${imgW} × ${imgH} pt</div>
          </div>`;
        } else {
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

      // 3. Right Main Column Lines & In-Flow Images (Header, PROFIL, EXPERIENCES PROFESSIONNELLES, etc.)
      const rightParagraphs: (Paragraph | Table)[] = [];
      let rightHtml = '';

      // Merge right column lines and right column images by topY
      const rightSplitX = page.width * page.splitRatio;
      const rightImages = (page.images || []).filter((im) => im.x >= rightSplitX - 10);

      type RightFlowItem =
        | { type: 'line'; topY: number; line: ReconstructedLine }
        | { type: 'image'; topY: number; image: ExtractedPdfImage };

      const rightFlowItems: RightFlowItem[] = [
        ...page.rightLines.map((l) => ({ type: 'line' as const, topY: l.topY, line: l })),
        ...rightImages.map((im) => ({ type: 'image' as const, topY: im.topY, image: im })),
      ].sort((a, b) => a.topY - b.topY);

      let prevWasJobHeader = false;
      const rightMinX =
        page.rightLines.length > 0
          ? Math.min(...page.rightLines.map((l) => l.minX))
          : rightSplitX + 20;

      for (let i = 0; i < rightFlowItems.length; i++) {
        const item = rightFlowItems[i];

        if (item.type === 'image') {
          totalImageFramesCount++;
          if (options.imageMode !== 'no-frames') {
            const availableColDxa = Math.round((1 - page.splitRatio) * 9000);
            rightParagraphs.push(createImagePlaceholderDocxBox(item.image, availableColDxa, options.imageMode));
            rightHtml += createImagePlaceholderHtml(item.image, 380, options.imageMode);
          }
          prevWasJobHeader = false;
          continue;
        }

        const line = item.line;
        const text = line.fullText;

        // Detect Top Centered Name & Role Subtitle
        const isTopHeroName =
          i === 0 && (line.fontSize >= 16 || text === text.toUpperCase());
        const isTopRoleSubtitle =
          i === 1 &&
          rightFlowItems[0] &&
          text === text.toUpperCase() &&
          line.topY - rightFlowItems[0].topY < 35;

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
      // Merge all text lines and all detected images strictly sorted by vertical topY position
      type SingleFlowItem =
        | { type: 'line'; topY: number; line: ReconstructedLine }
        | { type: 'image'; topY: number; image: ExtractedPdfImage };

      const singleFlowItems: SingleFlowItem[] = [
        ...page.rightLines.map((l) => ({ type: 'line' as const, topY: l.topY, line: l })),
        ...(page.images || []).map((im) => ({ type: 'image' as const, topY: im.topY, image: im })),
      ].sort((a, b) => a.topY - b.topY);

      let singleColHtml = '';

      for (let i = 0; i < singleFlowItems.length; i++) {
        const item = singleFlowItems[i];

        if (item.type === 'image') {
          totalImageFramesCount++;
          if (options.imageMode !== 'no-frames') {
            // Insert framed box matching exact image size in the original PDF
            const docxImgBox = createImagePlaceholderDocxBox(item.image, 9000, options.imageMode);
            docChildren.push(docxImgBox);
            singleColHtml += createImagePlaceholderHtml(item.image, 520, options.imageMode);
          }
          continue;
        }

        const line = item.line;
        const text = line.fullText;
        const isHeading1 = line.fontSize >= 16 || (i === 0 && line.fontSize >= 14);
        const isHeading2 =
          !isHeading1 &&
          (line.fontSize >= 13 ||
            (text.length >= 4 && text === text.toUpperCase() && !/^\d/.test(text)));
        const isBullet =
          text.startsWith('•') ||
          text.startsWith('-') ||
          text.startsWith('*') ||
          /^\d+[\.\)]\s/.test(text);

        if (isHeading1) {
          docChildren.push(
            new Paragraph({
              spacing: { before: 260, after: 120 },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  size: 32, // 16pt
                  color: '0F172A',
                  font: 'Calibri',
                }),
              ],
            })
          );
          singleColHtml += `<h1 style="color:#0f172a; font-size:19px; font-weight:800; margin:18px 0 8px 0; letter-spacing:0.01em;">${text}</h1>`;
        } else if (isHeading2) {
          docChildren.push(
            new Paragraph({
              spacing: { before: 220, after: 80 },
              border: {
                bottom: {
                  color: 'E2E8F0',
                  space: 4,
                  style: BorderStyle.SINGLE,
                  size: 6,
                },
              },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  size: 26, // 13pt
                  color: '1E293B',
                  font: 'Calibri',
                }),
              ],
            })
          );
          singleColHtml += `<h2 style="color:#1e293b; font-size:15px; font-weight:700; border-bottom:1.5px solid #e2e8f0; padding-bottom:4px; margin:16px 0 8px 0;">${text}</h2>`;
        } else if (isBullet) {
          docChildren.push(
            new Paragraph({
              indent: { left: 360 }, // 0.25 inch
              spacing: { before: 45, after: 45 },
              children: [
                new TextRun({
                  text,
                  color: '334155',
                  size: 21, // 10.5pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          singleColHtml += `<div style="padding-right:14px; color:#334155; font-size:12.5px; line-height:1.6; margin:3px 0;">• ${text.replace(/^[•\-\*]\s*/, '')}</div>`;
        } else {
          docChildren.push(
            new Paragraph({
              spacing: { before: 60, after: 60 },
              children: [
                new TextRun({
                  text,
                  color: '1E293B',
                  size: 21, // 10.5pt
                  font: 'Calibri',
                }),
              ],
            })
          );
          singleColHtml += `<p style="color:#1e293b; font-size:12.5px; line-height:1.6; margin:5px 0;">${text}</p>`;
        }
      }

      if (singleFlowItems.length === 0 && page.pageDataUrl) {
        totalImageFramesCount++;
        const snapBytes = dataUrlToUint8Array(page.pageDataUrl);
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 180, after: 180 },
            children: [
              new ImageRun({
                data: snapBytes,
                transformation: { width: 480, height: 640 },
                type: 'jpg',
              }),
            ],
          })
        );
        singleColHtml += `<div style="text-align:center; padding:12px;"><img src="${page.pageDataUrl}" style="max-width:100%; height:auto; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.1);" alt="Page Snapshot" /></div>`;
      }

      if (options.includeFullPageSnapshot && page.pageDataUrl && singleFlowItems.length > 0) {
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
        <div style="padding:26px 30px; border:1px solid #cbd5e1; border-radius:8px; background:#ffffff; box-shadow:0 3px 10px rgba(0,0,0,0.05); margin-bottom:20px; font-family:'Calibri',sans-serif; min-height:480px;">
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
              top: 720, // 0.5 inch margins for standard official document look
              bottom: 720,
              left: 720,
              right: 720,
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
    imageFramesCount: totalImageFramesCount,
  };
}

export interface PptxGenerationOptions {
  mode?: 'editable-smart' | 'hybrid-with-snapshot' | 'visual-exact';
  theme?: 'original-brand' | 'executive-dark' | 'clean-light';
  documentTitle?: string;
  frameImages?: boolean;
  preserveMiseEnPage?: boolean;
}

/**
 * Generates a real, native Microsoft PowerPoint (.PPTX) presentation using PptxGenJS
 * AND a rich 16:9 slide deck visual preview HTML with:
 * - 100% Original Document Color Palette preservation (background, brand banner, accent lines)
 * - Exact layout & hierarchy preservation (headers, subheaders, bullet points, multi-columns)
 * - Professional Image Frames for all detected photos, logos, and diagrams ("إطار صورة / Image")
 * - Smart 2-Column CV / Executive Profile and 1-Column Presentation Deck layouts
 * - High-Resolution Full-Page Visual Slides in hybrid mode so no original graphics are lost
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
    const isArabic = Boolean(page.isArabic || page.palette?.isArabic || /[\u0600-\u06FF]/.test(page.rawText));
    const primaryDarkHex =
      theme === 'executive-dark'
        ? '0F172A'
        : theme === 'clean-light'
        ? '1E293B'
        : (page.palette?.primaryBrandHex || page.sidebarBgHex || '142642');
    const accentHex =
      theme === 'executive-dark'
        ? '38BDF8'
        : theme === 'clean-light'
        ? 'E5322D'
        : (page.palette?.secondaryAccentHex || page.accentHex || 'C86D3B');
    const rightBgHex =
      theme === 'executive-dark'
        ? '1E293B'
        : page.palette?.hasDarkBg
        ? '0F172A'
        : (page.palette?.pageBgHex && page.palette.pageBgHex !== '000000' ? page.palette.pageBgHex : 'FFFFFF');
    const rightTextHex =
      theme === 'executive-dark' || page.palette?.hasDarkBg ? 'F8FAFC' : '1E293B';
    const rightHeadingHex =
      theme === 'executive-dark' || page.palette?.hasDarkBg ? 'FFFFFF' : primaryDarkHex;

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

      // 1. Left Sidebar Background Shape in detected original brand color
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

      // 2. Profile Photo in Left Sidebar with framed border in accent color
      if (page.extractedPhotoDataUrl) {
        const photoW = 1.65;
        const photoH = Number((photoW / (page.extractedPhotoAspect || 1)).toFixed(2));
        const photoX = Number(((sidebarW - photoW) / 2).toFixed(2));

        slide.addShape(pptx.ShapeType.roundRect, {
          x: Number((photoX - 0.05).toFixed(2)),
          y: Number((leftCurY - 0.05).toFixed(2)),
          w: Number((photoW + 0.1).toFixed(2)),
          h: Number((photoH + 0.1).toFixed(2)),
          fill: { color: 'F8FAFC' },
          line: { color: accentHex, width: 2 },
        });
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
            <div style="display:inline-block; border:2.5px solid #${accentHex}; border-radius:50%; padding:3px; background:rgba(255,255,255,0.1); box-shadow:0 4px 12px rgba(0,0,0,0.25);">
              <img src="${page.extractedPhotoDataUrl}" style="width:84px; height:84px; object-fit:cover; border-radius:50%; display:block;" alt="Profile" />
            </div>
            <div style="font-size:9.5px; color:#${accentHex}; font-weight:800; margin-top:4px;">[ صورة / Image ]</div>
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
              fontFace: isArabic ? 'Cairo' : 'Calibri',
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
              fontFace: isArabic ? 'Cairo' : 'Calibri',
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
            fontFace: isArabic ? 'Cairo' : 'Calibri',
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
            fontFace: isArabic ? 'Cairo' : 'Calibri',
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
              fontFace: isArabic ? 'Cairo' : 'Calibri',
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
              fontFace: isArabic ? 'Cairo' : 'Calibri',
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
              fontFace: isArabic ? 'Cairo' : 'Calibri',
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
            fontFace: isArabic ? 'Cairo' : 'Calibri',
          });
          rightCurY += 0.19;
        }
        rightPreviewHtml += `<div style="color:#${rightTextHex}; font-size:9.5px; line-height:1.4; margin:1.5px 0;">${text}</div>`;
      }

      // Check if there are any additional right-panel images that need framed containers
      const rightImages = (page.images || []).filter(
        (im) => im.dataUrl && im.dataUrl !== page.extractedPhotoDataUrl && im.x >= page.width * (page.splitRatio - 0.05)
      );
      if (rightImages.length > 0 && rightCurY < 6.85) {
        for (const rImg of rightImages.slice(0, 2)) {
          if (rightCurY >= 6.85) break;
          const rAspect = rImg.aspectRatio || 1.33;
          const rW = Math.min(3.4, rightW * 0.52);
          const rH = Math.min(1.8, rW / rAspect);
          const rX = rightX + (rightW - rW) / 2;

          slide.addShape(pptx.ShapeType.rect, {
            x: rX - 0.05,
            y: rightCurY - 0.04,
            w: rW + 0.1,
            h: rH + 0.32,
            fill: { color: 'F8FAFC' },
            line: { color: accentHex, width: 1.5 },
          });
          slide.addImage({
            data: rImg.dataUrl!,
            x: rX,
            y: rightCurY,
            w: rW,
            h: rH,
          });
          slide.addText('🖼️ [ صورة / Image ]', {
            x: rX,
            y: rightCurY + rH + 0.04,
            w: rW,
            h: 0.22,
            fontSize: 9,
            bold: true,
            align: 'center',
            color: accentHex,
            fontFace: isArabic ? 'Cairo' : 'Calibri',
          });
          rightCurY += rH + 0.45;
          rightPreviewHtml += `
            <div style="text-align:center; margin:10px 0;">
              <div style="display:inline-block; border:2px solid #${accentHex}; background:#f8fafc; border-radius:8px; padding:6px; box-shadow:0 3px 10px rgba(0,0,0,0.08);">
                <img src="${rImg.dataUrl}" style="max-height:100px; border-radius:4px; display:block; margin:0 auto;" alt="Framed Image" />
                <div style="font-size:9.5px; font-weight:800; color:#${accentHex}; margin-top:4px;">🖼️ [ صورة / Image ]</div>
              </div>
            </div>
          `;
        }
      }

      slidePreviewCards.push(`
        <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#ffffff; box-shadow:0 6px 18px rgba(15,23,42,0.08); font-family:'Calibri','Cairo','Plus Jakarta Sans',sans-serif;">
          <div style="padding:8px 14px; background:#0f172a; color:#f8fafc; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
            <span>SLIDE ${slideCount} · EDITABLE 16:9 WIDESCREEN POWERPOINT LAYOUT</span>
            <span style="background:#${accentHex}; color:#fff; padding:2px 8px; border-radius:4px; font-size:10px;">NATIVE .PPTX</span>
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
      // ================== 1-COLUMN / FULL-WIDTH PRESENTATION SLIDE WITH EMBEDDED FRAMED IMAGES ==================
      slideCount++;
      const slide = pptx.addSlide();
      slide.background = { color: rightBgHex };

      // Top Header Accent Bar matching detected PDF brand color
      const bannerH = 0.85;
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.333,
        h: bannerH,
        fill: { color: primaryDarkHex },
        line: { color: primaryDarkHex, width: 0 },
      });

      // Accent underline strip below banner
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: bannerH - 0.05,
        w: 13.333,
        h: 0.05,
        fill: { color: accentHex },
        line: { color: accentHex, width: 0 },
      });

      // Slide Title
      const rawTitle = page.lines[0]?.fullText || `Page ${page.pageNumber}`;
      const slideTitle = rawTitle.slice(0, 85);
      slide.addText(slideTitle, {
        x: 0.6,
        y: 0.16,
        w: 12.13,
        h: 0.52,
        fontSize: 18,
        bold: true,
        color: 'FFFFFF',
        fontFace: isArabic ? 'Cairo' : 'Calibri',
        align: isArabic ? 'right' : 'left',
      });

      let imagesPreviewHtml = '';
      const validImages = (page.images || []).filter((im) => im.width > 20 && im.height > 20);

      // Determine spatial layout:
      // If validImages exist, determine if they belong to right, left, or top/center
      const avgImgX = validImages.length > 0
        ? validImages.reduce((acc, im) => acc + im.x, 0) / validImages.length
        : page.width * 0.7;

      const imagesOnLeft = avgImgX < page.width * 0.4;
      const isWideHeroImage =
        validImages.length === 1 &&
        (validImages[0].width / page.width > 0.55 || validImages[0].aspectRatio > 2.0);

      // Columns geometry:
      let textX = 0.6;
      let textW = 12.13;
      let imgColX = 7.6;
      let imgColW = 5.1;

      if (validImages.length > 0 && !isWideHeroImage) {
        if (imagesOnLeft) {
          imgColX = 0.6;
          imgColW = 4.8;
          textX = 5.7;
          textW = 7.0;
        } else {
          textX = 0.6;
          textW = 6.8;
          imgColX = 7.7;
          imgColW = 5.0;
        }
      }

      // Render Framed Images ("وان وجدت صورة يضعها في إطار صورة أو image")
      if (validImages.length > 0) {
        let curImgY = 1.1;
        for (const img of validImages) {
          if (curImgY >= 6.8) break;
          const imgAspect = img.aspectRatio || (img.width / Math.max(1, img.height)) || 1.33;

          let targetW = Math.min(imgColW, Math.max(2.2, (img.width / Math.max(1, page.width)) * 13.333));
          if (isWideHeroImage) {
            targetW = Math.min(9.5, Math.max(4.5, (img.width / Math.max(1, page.width)) * 13.333));
          }
          let targetH = targetW / imgAspect;
          if (targetH > 3.4) {
            targetH = 3.4;
            targetW = targetH * imgAspect;
          }

          const targetX = isWideHeroImage ? (13.333 - targetW) / 2 : imgColX + (imgColW - targetW) / 2;

          // 1. Sleek Container Card Frame with accent line
          slide.addShape(pptx.ShapeType.rect, {
            x: Number((targetX - 0.06).toFixed(2)),
            y: Number((curImgY - 0.05).toFixed(2)),
            w: Number((targetW + 0.12).toFixed(2)),
            h: Number((targetH + 0.38).toFixed(2)),
            fill: { color: 'F8FAFC' },
            line: { color: accentHex, width: 2 },
          });

          if (img.dataUrl) {
            slide.addImage({
              data: img.dataUrl,
              x: Number(targetX.toFixed(2)),
              y: Number(curImgY.toFixed(2)),
              w: Number(targetW.toFixed(2)),
              h: Number(targetH.toFixed(2)),
            });
            slide.addText('🖼️ [ صورة / Image ]', {
              x: Number(targetX.toFixed(2)),
              y: Number((curImgY + targetH + 0.05).toFixed(2)),
              w: Number(targetW.toFixed(2)),
              h: 0.22,
              fontSize: 9.5,
              bold: true,
              align: 'center',
              color: accentHex,
              fontFace: isArabic ? 'Cairo' : 'Calibri',
            });
            imagesPreviewHtml += `
              <div style="display:inline-block; margin:6px; text-align:center;">
                <div style="border:2px solid #${accentHex}; background:#f8fafc; border-radius:8px; padding:6px; box-shadow:0 3px 10px rgba(0,0,0,0.08);">
                  <img src="${img.dataUrl}" style="max-height:120px; max-width:260px; border-radius:4px; display:block; margin:0 auto;" alt="Framed Image" />
                  <div style="font-size:9.5px; font-weight:800; color:#${accentHex}; margin-top:5px;">🖼️ [ صورة / Image ]</div>
                </div>
              </div>
            `;
          } else {
            slide.addText('🖼️ [ إطار صورة / Image ]', {
              x: Number(targetX.toFixed(2)),
              y: Number((curImgY + targetH / 2 - 0.15).toFixed(2)),
              w: Number(targetW.toFixed(2)),
              h: 0.3,
              fontSize: 11,
              bold: true,
              align: 'center',
              color: accentHex,
              fontFace: isArabic ? 'Cairo' : 'Calibri',
            });
          }

          curImgY += targetH + 0.55;
        }
      }

      // Render Text Content with exact layout and hierarchy
      let curY = isWideHeroImage ? 4.9 : 1.1;
      let bodyHtml = '';
      const bodyLines = page.lines.slice(page.lines[0]?.fullText === slideTitle ? 1 : 0);

      for (const l of bodyLines) {
        if (!l.fullText.trim()) continue;
        if (curY >= 7.15) break;

        const textClean = l.fullText.trim();
        const isBullet = /^[•\-\*]/.test(textClean) || /^\d+[\.\)]\s/.test(textClean);
        const isHead = !isBullet && (l.fontSize >= 13 || (textClean.length < 55 && textClean === textClean.toUpperCase() && !/^\d/.test(textClean)));
        const lineH = isHead ? 0.36 : 0.26;

        const displayText = isBullet ? textClean.replace(/^[•\-\*]\s*/, '') : textClean;

        slide.addText(displayText, {
          x: textX + (isBullet ? (isArabic ? 0 : 0.25) : 0),
          y: curY,
          w: textW - (isBullet ? 0.3 : 0),
          h: lineH,
          fontSize: isHead ? 13.5 : 10.5,
          bold: isHead,
          color: isHead ? rightHeadingHex : rightTextHex,
          fontFace: isArabic ? 'Cairo' : 'Calibri',
          align: isArabic ? 'right' : 'left',
        });

        if (isBullet) {
          slide.addText('•', {
            x: isArabic ? textX + textW - 0.25 : textX,
            y: curY,
            w: 0.25,
            h: lineH,
            fontSize: 12,
            bold: true,
            color: accentHex,
            fontFace: 'Calibri',
            align: 'center',
          });
        }

        if (isHead) {
          slide.addShape(pptx.ShapeType.line, {
            x: textX,
            y: curY + lineH - 0.02,
            w: Math.min(textW * 0.7, Math.max(1.8, textClean.length * 0.12)),
            h: 0,
            line: { color: accentHex, width: 1.5 },
          });
          curY += 0.08;
        }

        curY += lineH + 0.06;
        bodyHtml += `<div style="color:#${isHead ? rightHeadingHex : rightTextHex}; font-weight:${isHead ? '800' : '400'}; font-size:${isHead ? '12.5px' : '10.5px'}; margin:3px 0; padding-left:${isBullet ? '12px' : '0'}; text-align:${isArabic ? 'right' : 'left'};">${isHead ? '📌 ' : isBullet ? '• ' : ''}${displayText}</div>`;
      }

      slidePreviewCards.push(`
        <div style="margin-bottom:18px; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden; background:#${rightBgHex}; box-shadow:0 6px 18px rgba(15,23,42,0.08); font-family:'Calibri','Cairo',sans-serif;">
          <div style="padding:10px 16px; background:#${primaryDarkHex}; color:#ffffff; font-weight:800; font-size:13px; display:flex; justify-content:space-between; align-items:center;">
            <span>${slideTitle}</span>
            <div style="display:flex; gap:8px; align-items:center;">
              ${validImages.length > 0 ? `<span style="background:rgba(255,255,255,0.2); font-size:10px; padding:2px 6px; border-radius:4px;">🖼️ ${validImages.length} Image(s) Framed</span>` : ''}
              <span style="font-size:10px; opacity:0.85;">SLIDE ${slideCount}</span>
            </div>
          </div>
          <div style="padding:16px 20px; min-height:210px;">
            ${imagesPreviewHtml ? `<div style="margin-bottom:12px; text-align:center;">${imagesPreviewHtml}</div>` : ''}
            ${bodyHtml || '<div style="color:#64748b; font-size:12px;">Visual Content</div>'}
          </div>
        </div>
      `);
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
  smartColumnClustering?: boolean;
  preserveColors?: boolean;
}

/**
 * Clusters X-coordinates across multi-cell lines to discover the true column grid
 * of financial tables, invoices, price lists, and tabular reports.
 */
function clusterColumnCoordinates(
  lines: { cells: { x: number; text: string }[] }[],
  pageWidth: number
): { colXBoundaries: number[]; maxCols: number } {
  const rawXs: number[] = [];
  for (const l of lines) {
    if (l.cells.length >= 2) {
      for (const c of l.cells) {
        const txt = c.text.trim();
        if (txt.length > 0 && !/^[\s•\-\*]+$/.test(txt)) {
          rawXs.push(c.x);
        }
      }
    }
  }

  if (rawXs.length < 4) {
    return {
      colXBoundaries: [pageWidth * 0.05, pageWidth * 0.35, pageWidth * 0.65, pageWidth * 0.85],
      maxCols: 4,
    };
  }

  rawXs.sort((a, b) => a - b);
  const clusters: { sum: number; count: number }[] = [];

  for (const x of rawXs) {
    const matching = clusters.find((cl) => Math.abs(x - cl.sum / cl.count) <= 32);
    if (matching) {
      matching.sum += x;
      matching.count++;
    } else {
      clusters.push({ sum: x, count: 1 });
    }
  }

  // Filter clusters: keep reliable column anchors that appear across lines
  const sortedClusters = clusters
    .filter((cl) => cl.count >= 2 || clusters.length <= 4)
    .map((cl) => Math.round(cl.sum / cl.count))
    .sort((a, b) => a - b);

  const cleanClusters: number[] = [];
  for (const x of sortedClusters) {
    if (cleanClusters.length === 0 || x - cleanClusters[cleanClusters.length - 1] >= 34) {
      cleanClusters.push(x);
    }
  }

  if (cleanClusters.length < 2) {
    return {
      colXBoundaries: [pageWidth * 0.05, pageWidth * 0.32, pageWidth * 0.60, pageWidth * 0.82],
      maxCols: 4,
    };
  }

  const maxCols = Math.min(8, Math.max(2, cleanClusters.length));
  return {
    colXBoundaries: cleanClusters.slice(0, maxCols),
    maxCols,
  };
}

/**
 * Maps a line's text cells to the clustered canonical column boundaries,
 * joining words that belong to the same cell so text is never chopped or scattered.
 */
function mapLineCellsToColumns(
  cells: { x: number; text: string }[],
  colBoundaries: number[]
): string[] {
  const numCols = colBoundaries.length;
  const colTexts: string[][] = Array.from({ length: numCols }, () => []);

  for (const cell of cells) {
    const txt = cell.text.trim();
    if (!txt) continue;

    let bestColIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < numCols; i++) {
      const diff = Math.abs(cell.x - colBoundaries[i]);
      if (diff < minDiff) {
        minDiff = diff;
        bestColIdx = i;
      }
    }
    colTexts[bestColIdx].push(txt);
  }

  return colTexts.map((group) => group.join(' '));
}

/**
 * Detects numbers, amounts, currencies, and percentages for Excel cell formatting.
 */
function parseNumericValue(val: string): {
  isNumeric: boolean;
  num?: number;
  isCurrency: boolean;
  isPercent: boolean;
} {
  const trimmed = val.trim();
  if (!trimmed) return { isNumeric: false, isCurrency: false, isPercent: false };

  // Skip 4-digit years like 2024, 1998
  if (/^(19\d\d|20\d\d)$/.test(trimmed)) {
    return { isNumeric: false, isCurrency: false, isPercent: false };
  }

  const isPercent = trimmed.endsWith('%');
  const isCurrency = /(?:[\$€£]|MAD|DH|USD|EUR)/i.test(trimmed);

  const cleanNumStr = trimmed
    .replace(/[^\d.,\-+]/g, '')
    .replace(/\s+/g, '');

  if (!cleanNumStr) return { isNumeric: false, isCurrency: false, isPercent: false };

  let normalized = cleanNumStr;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(cleanNumStr)) {
    normalized = cleanNumStr.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+\.\d+$/.test(cleanNumStr)) {
    normalized = cleanNumStr.replace(/,/g, '');
  } else if (/^\d+,\d+$/.test(cleanNumStr)) {
    normalized = cleanNumStr.replace(',', '.');
  }

  const parsed = parseFloat(normalized);
  if (!isNaN(parsed) && isFinite(parsed)) {
    return {
      isNumeric: true,
      num: isPercent ? parsed / 100 : parsed,
      isCurrency,
      isPercent,
    };
  }
  return { isNumeric: false, isCurrency: false, isPercent: false };
}

/**
 * Detects date strings for center alignment in Excel.
 */
function isDateString(val: string): boolean {
  const trimmed = val.trim();
  return (
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(trimmed) ||
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/.test(trimmed) ||
    /^(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{4}$/i.test(trimmed)
  );
}

/**
 * Generates a real, native Microsoft Excel (.XLSX) workbook using ExcelJS
 * with drawn table borders, colored headers, merged cells, embedded images,
 * and smart column alignment matching the original PDF mise-en-page.
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
    const isArabic = Boolean(page.isArabic || page.palette?.isArabic || /[\u0600-\u06FF]/.test(page.rawText));
    const isFrench = !isArabic && /(?:poste|fonction|entreprise|établissement|missions|compétences|période)/i.test(page.rawText);

    const ws = workbook.addWorksheet(isArabic ? `صفحة ${page.pageNumber}` : `Page ${page.pageNumber}`, {
      views: [{ rightToLeft: isArabic, showGridLines: true } as ExcelJS.WorksheetView],
    });

    const primaryHex = page.palette?.primaryBrandHex || page.sidebarBgHex || '142642';
    const accentHex = page.palette?.secondaryAccentHex || page.accentHex || 'C86D3B';

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

      // Embed Profile Photo if available with stylish bordered frame
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

      // Row 1 & 2: Top Banner in detected original colors
      ws.mergeCells('A1:B2');
      const sidebarTopCell = ws.getCell('A1');
      sidebarTopCell.value = isArabic
        ? 'المعلومات الشخصية والمهارات'
        : isFrench
        ? 'INFORMATIONS & COMPÉTENCES'
        : 'PROFILE & SKILLS';
      sidebarTopCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${primaryHex}` },
      };
      sidebarTopCell.font = {
        name: isArabic ? 'Cairo' : 'Calibri',
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
        name: isArabic ? 'Cairo' : 'Calibri',
        size: 16,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      heroNameCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(1).height = 28;

      ws.mergeCells('D2:G2');
      const heroRoleCell = ws.getCell('D2');
      heroRoleCell.value = heroRole || (isArabic ? 'مستند مخصص عالي الدقة' : 'Structured Document');
      heroRoleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${accentHex}` },
      };
      heroRoleCell.font = {
        name: isArabic ? 'Cairo' : 'Calibri',
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
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 10.5,
            bold: true,
            color: { argb: `FF${accentHex}` },
          };
          cell.border = {
            bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
          };
        } else {
          cell.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 9.5,
            color: { argb: 'FFFFFFFF' },
          };
        }
        cell.alignment = { vertical: 'middle', wrapText: true, horizontal: isArabic ? 'right' : 'left' };
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
            name: isArabic ? 'Cairo' : 'Calibri',
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
          secCell.alignment = { vertical: 'middle', horizontal: isArabic ? 'right' : 'left' };
          ws.getRow(rightRowCursor).height = 24;
          rightRowCursor++;
        } else if (rItem.kind === 'profile-text') {
          ws.mergeCells(`D${rightRowCursor}:G${rightRowCursor}`);
          const pCell = ws.getCell(`D${rightRowCursor}`);
          pCell.value = rItem.col1;
          pCell.font = { name: isArabic ? 'Cairo' : 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          pCell.border = thinBorder;
          pCell.alignment = { vertical: 'middle', wrapText: true, horizontal: isArabic ? 'right' : 'left' };
          ws.getRow(rightRowCursor).height = 19;
          rightRowCursor++;
        } else if (rItem.kind === 'exp-row') {
          if (!expHeaderDrawn) {
            const dynamicHeaders = isArabic
              ? [
                  { col: 'D', label: 'المسمى الوظيفي / الدور' },
                  { col: 'E', label: 'المؤسسة / الجهة' },
                  { col: 'F', label: 'المهام والمسؤوليات' },
                  { col: 'G', label: 'الفترة / التاريخ' },
                ]
              : isFrench
              ? [
                  { col: 'D', label: 'Poste / Fonction' },
                  { col: 'E', label: 'Entreprise / Établissement' },
                  { col: 'F', label: 'Missions & Réalisations Clés' },
                  { col: 'G', label: 'Période / Date' },
                ]
              : [
                  { col: 'D', label: 'Role / Title' },
                  { col: 'E', label: 'Organization / Company' },
                  { col: 'F', label: 'Key Responsibilities' },
                  { col: 'G', label: 'Period / Date' },
                ];

            for (const h of dynamicHeaders) {
              const hCell = ws.getCell(`${h.col}${rightRowCursor}`);
              hCell.value = h.label;
              hCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: `FF${primaryHex}` },
              };
              hCell.font = {
                name: isArabic ? 'Cairo' : 'Calibri',
                size: 10,
                bold: true,
                color: { argb: 'FFFFFFFF' },
              };
              hCell.border = thinBorder;
              hCell.alignment = { vertical: 'middle', horizontal: isArabic ? 'right' : 'left' };
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
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 10,
            bold: true,
            color: { argb: `FF${primaryHex}` },
          };

          cOrg.value = rItem.col2;
          cOrg.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 10,
            italic: true,
            color: { argb: `FF${accentHex}` },
          };

          cDesc.value = rItem.col3;
          cDesc.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 9.5,
            color: { argb: 'FF1E293B' },
          };

          cDate.value = rItem.col4;
          cDate.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 9.5,
            bold: true,
            color: { argb: 'FF334155' },
          };

          [cRole, cOrg, cDesc, cDate].forEach((c) => {
            c.border = thinBorder;
            c.alignment = { vertical: 'top', wrapText: true, horizontal: isArabic ? 'right' : 'left' };
          });

          ws.getRow(rightRowCursor).height = 42;
          rightRowCursor++;
        }
      }

      // Check if there are other images to frame in the right main panel
      const extraImages = (page.images || []).filter(
        (im) => im.dataUrl && im.dataUrl !== page.extractedPhotoDataUrl && im.x >= page.width * (page.splitRatio - 0.05)
      );
      if (embedPhotos && extraImages.length > 0) {
        for (const extraImg of extraImages) {
          try {
            const imgId = workbook.addImage({
              base64: extraImg.dataUrl!,
              extension: 'png',
            });
            const imgRowStart = rightRowCursor;
            ws.mergeCells(`D${imgRowStart}:F${imgRowStart + 2}`);
            const fCell = ws.getCell(`D${imgRowStart}`);
            fCell.value = `[ 🖼️ صورة / Image: ${Math.round(extraImg.width)}×${Math.round(extraImg.height)} pt ]`;
            fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            fCell.font = { name: isArabic ? 'Cairo' : 'Calibri', size: 9.5, bold: true, color: { argb: `FF${accentHex}` } };
            fCell.border = {
              top: { style: 'medium', color: { argb: `FF${accentHex}` } },
              bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
              left: { style: 'medium', color: { argb: `FF${accentHex}` } },
              right: { style: 'medium', color: { argb: `FF${accentHex}` } },
            };
            fCell.alignment = { vertical: 'bottom', horizontal: 'center' };

            ws.addImage(imgId, {
              tl: { col: 3.2, row: imgRowStart - 0.9 },
              ext: {
                width: Math.min(180, Math.round(extraImg.width * 0.9) || 130),
                height: Math.min(75, Math.round(extraImg.height * 0.9) || 60),
              },
            });
            rightRowCursor += 3;
          } catch {
            // safe skip
          }
        }
      }

      const finalMaxRow = Math.max(maxLeftRow, rightRowCursor - 1);
      // Fill remaining sidebar cells down to finalMaxRow so the dark sidebar is continuous
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
            ? `<div style="color:#${accentHex}; font-weight:800; font-size:10.5px; border-bottom:1.5px solid #${accentHex}; padding:6px 0 3px 0; margin-top:8px; text-align:${isArabic ? 'right' : 'left'};">${it.text}</div>`
            : `<div style="color:#ffffff; font-size:10px; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.08); text-align:${isArabic ? 'right' : 'left'};">${it.text}</div>`
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
            <div style="background:#f1f5f9; color:#${primaryHex}; font-weight:800; font-size:11px; padding:6px 10px; border:1px solid #cbd5e1; border-bottom:2px solid #${accentHex}; margin-top:10px; text-align:${isArabic ? 'right' : 'left'};">
              ${rItem.col1}
            </div>
          `;
        } else if (rItem.kind === 'profile-text') {
          rightTableHtml += `
            <div style="padding:4px 10px; font-size:10.5px; color:#1e293b; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; border-bottom:1px solid #f1f5f9; text-align:${isArabic ? 'right' : 'left'};">
              ${rItem.col1}
            </div>
          `;
        } else if (rItem.kind === 'exp-row') {
          if (!inExpTable) {
            const previewHeaders = isArabic
              ? ['المسمى / الدور', 'المؤسسة', 'المهام والتفاصيل', 'الفترة']
              : isFrench
              ? ['Poste / Fonction', 'Établissement', 'Missions & Détails', 'Période']
              : ['Role / Title', 'Organization', 'Responsibilities', 'Period'];
            rightTableHtml += `
              <table style="width:100%; border-collapse:collapse; font-size:10.5px; margin-top:4px; direction:${isArabic ? 'rtl' : 'ltr'};">
                <thead>
                  <tr style="background:#${primaryHex}; color:#ffffff; text-align:${isArabic ? 'right' : 'left'};">
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:20%;">${previewHeaders[0]}</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:22%;">${previewHeaders[1]}</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:40%;">${previewHeaders[2]}</th>
                    <th style="padding:6px 8px; border:1px solid #cbd5e1; width:18%;">${previewHeaders[3]}</th>
                  </tr>
                </thead>
                <tbody>
            `;
            inExpTable = true;
          }
          rightTableHtml += `
            <tr style="background:#ffffff;">
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:700; color:#${primaryHex}; vertical-align:top; text-align:${isArabic ? 'right' : 'left'};">${rItem.col1}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-style:italic; color:#${accentHex}; vertical-align:top; text-align:${isArabic ? 'right' : 'left'};">${rItem.col2}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; color:#1e293b; vertical-align:top; line-height:1.45; text-align:${isArabic ? 'right' : 'left'};">${rItem.col3}</td>
              <td style="padding:6px 8px; border:1px solid #cbd5e1; font-weight:600; color:#334155; vertical-align:top; white-space:nowrap; text-align:${isArabic ? 'right' : 'left'};">${rItem.col4}</td>
            </tr>
          `;
        }
      }
      if (inExpTable) {
        rightTableHtml += `</tbody></table>`;
      }

      sheetPreviewHtmlBlocks.push(`
        <div style="border:1px solid #94a3b8; border-radius:10px; overflow:hidden; background:#ffffff; box-shadow:0 4px 14px rgba(15,23,42,0.08); margin-bottom:18px; font-family:'Calibri','Cairo','Plus Jakarta Sans',sans-serif;">
          <!-- Excel Sheet Header Bar -->
          <div style="background:#107c41; color:#ffffff; padding:7px 12px; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
            <span>SHEET: ${isArabic ? `صفحة ${page.pageNumber}` : `Page ${page.pageNumber}`} · DRAWN EXCEL TABLE (.XLSX)</span>
            <span style="background:rgba(255,255,255,0.2); padding:2px 8px; border-radius:4px; font-family:monospace; font-size:10px;">${isArabic ? 'اتجاه RTL' : 'LTR'} · ${finalMaxRow} Rows</span>
          </div>
          <!-- Excel Column Letters Header -->
          <div style="display:grid; grid-template-columns: 32% 68%; background:#f1f5f9; border-bottom:1px solid #cbd5e1; font-family:monospace; font-size:10px; color:#475569; font-weight:700; text-align:center;">
            <div style="padding:4px; border-right:1px solid #cbd5e1;">COL A : B (${isArabic ? 'الشريط الجانبي' : 'SIDEBAR'})</div>
            <div style="padding:4px;">COL D : E : F : G (${isArabic ? 'جداول البيانات' : 'DATA TABLES'})</div>
          </div>
          <div style="display:flex; width:100%; direction:${isArabic ? 'rtl' : 'ltr'};">
            <div style="width:32%; background:#${primaryHex}; padding:12px; box-sizing:border-box;">
              ${
                embedPhotos && page.extractedPhotoDataUrl
                  ? `<div style="text-align:center; margin-bottom:10px;"><div style="display:inline-block; border:2px solid #${accentHex}; border-radius:50%; padding:2px;"><img src="${page.extractedPhotoDataUrl}" style="width:78px; height:78px; border-radius:50%; display:block;" alt="Avatar" /></div><div style="font-size:9.5px; color:#${accentHex}; font-weight:700; margin-top:2px;">[ صورة / Image ]</div></div>`
                  : ''
              }
              ${leftRowsHtml}
            </div>
            <div style="width:68%; padding:12px; box-sizing:border-box; background:#ffffff; overflow-x:auto;">
              <div style="background:#${primaryHex}; color:#ffffff; font-weight:800; font-size:14px; text-align:center; padding:6px;">${heroName}</div>
              <div style="background:#${accentHex}; color:#ffffff; font-weight:700; font-size:10px; text-align:center; padding:4px; margin-bottom:8px;">${heroRole || (isArabic ? 'جدول بيانات' : 'Data Sheet')}</div>
              ${rightTableHtml}
            </div>
          </div>
        </div>
      `);
    } else {
      // ================== 2. SMART CLUSTERED GENERAL EXCEL TABLE WITH FRAMED IMAGES ==================
      const allLines = page.lines;

      // Detect Canonical Column Grid via spatial clustering of X coordinates
      const { colXBoundaries, maxCols } = clusterColumnCoordinates(allLines, page.width);

      // Set Excel Column Widths
      for (let c = 1; c <= maxCols; c++) {
        ws.getColumn(c).width = c === 1 ? 26 : Math.max(16, Math.round(78 / Math.max(1, maxCols - 1)));
      }

      let curRow = 1;
      let htmlRows = '';

      // 1. Sheet Title / Document Banner Row
      const topTitle = page.lines[0]?.fullText || options.documentTitle || (isArabic ? `صفحة ${page.pageNumber}` : `Page ${page.pageNumber}`);
      ws.mergeCells(curRow, 1, curRow, maxCols);
      const titleCell = ws.getCell(curRow, 1);
      titleCell.value = topTitle;
      titleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${primaryHex}` },
      };
      titleCell.font = {
        name: isArabic ? 'Cairo' : 'Calibri',
        size: 13,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(curRow).height = 28;
      curRow++;

      // 2. Embed Framed Images ("وان وجدت صورة يضعها في إطار صورة أو image")
      let imagesHtml = '';
      if (embedPhotos && page.images && page.images.length > 0) {
        for (const img of page.images) {
          if (img.dataUrl && img.width > 20 && img.height > 20) {
            try {
              const imgId = workbook.addImage({
                base64: img.dataUrl,
                extension: 'png',
              });
              const imgRowStart = curRow;
              const frameCols = Math.min(3, maxCols);
              ws.mergeCells(imgRowStart, 1, imgRowStart + 2, frameCols);
              const frameCell = ws.getCell(imgRowStart, 1);
              frameCell.value = `[ 🖼️ صورة / Image: ${Math.round(img.width)}×${Math.round(img.height)} pt ]`;
              frameCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8FAFC' },
              };
              frameCell.font = {
                name: isArabic ? 'Cairo' : 'Calibri',
                size: 9.5,
                bold: true,
                color: { argb: `FF${accentHex}` },
              };
              frameCell.border = {
                top: { style: 'medium', color: { argb: `FF${accentHex}` } },
                bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
                left: { style: 'medium', color: { argb: `FF${accentHex}` } },
                right: { style: 'medium', color: { argb: `FF${accentHex}` } },
              };
              frameCell.alignment = { vertical: 'bottom', horizontal: 'center' };

              ws.addImage(imgId, {
                tl: { col: 0.15, row: imgRowStart - 0.9 },
                ext: {
                  width: Math.min(190, Math.round(img.width * 0.95) || 130),
                  height: Math.min(75, Math.round(img.height * 0.95) || 60),
                },
              });

              curRow += 3;
              imagesHtml += `
                <div style="display:inline-block; border:2px solid #${accentHex}; background:#f8fafc; border-radius:8px; padding:6px 10px; margin:6px; text-align:center; box-shadow:0 3px 8px rgba(0,0,0,0.08);">
                  <img src="${img.dataUrl}" style="max-height:85px; max-width:240px; border-radius:4px; display:block; margin:0 auto;" alt="Framed Image" />
                  <div style="font-size:9.5px; color:#${accentHex}; font-weight:800; margin-top:4px;">🖼️ [ صورة / Image ]</div>
                </div>
              `;
            } catch {
              // safe skip
            }
          }
        }
      }

      // 3. Process Lines: Distribute Multi-Column cells or Clean Narrative Paragraphs
      const dataLines = page.lines.slice(page.lines[0]?.fullText === topTitle ? 1 : 0);
      let isFirstTableBlock = true;

      for (const line of dataLines) {
        if (!line.fullText.trim()) continue;
        const row = ws.getRow(curRow);

        // A) Section Header (Distinct larger font or bold single text)
        if (line.isHeading || (line.cells.length === 1 && line.fullText.length < 55 && line.fullText === line.fullText.toUpperCase() && !/^\d/.test(line.fullText))) {
          ws.mergeCells(curRow, 1, curRow, maxCols);
          const cell = ws.getCell(curRow, 1);
          cell.value = line.fullText;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          cell.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 11,
            bold: true,
            color: { argb: `FF${primaryHex}` },
          };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
          cell.alignment = { vertical: 'middle', horizontal: isArabic ? 'right' : 'left' };
          row.height = 24;

          htmlRows += `
            <tr style="background:#f1f5f9; color:#${primaryHex}; font-weight:800;">
              <td colspan="${maxCols}" style="padding:6px 10px; border:1px solid #cbd5e1; border-bottom:2px solid #${accentHex}; text-align:${isArabic ? 'right' : 'left'};">${line.fullText}</td>
            </tr>
          `;
          isFirstTableBlock = true;
          curRow++;
          continue;
        }

        // B) Single Narrative Paragraph (Avoid chopping sentences into weird columns)
        if (line.cells.length === 1 && line.fullText.length >= 50) {
          ws.mergeCells(curRow, 1, curRow, maxCols);
          const cell = ws.getCell(curRow, 1);
          cell.value = line.fullText;
          cell.font = { name: isArabic ? 'Cairo' : 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', wrapText: true, horizontal: isArabic ? 'right' : 'left' };
          row.height = 22;

          htmlRows += `
            <tr>
              <td colspan="${maxCols}" style="padding:5px 8px; border:1px solid #cbd5e1; color:#1e293b; text-align:${isArabic ? 'right' : 'left'};">${line.fullText}</td>
            </tr>
          `;
          curRow++;
          continue;
        }

        // C) Multi-Column Data Row mapped to Canonical Column Clusters
        const mappedColTexts = mapLineCellsToColumns(line.cells, colXBoundaries);

        // Check if this row is a Table Header (e.g. first row of multi-column data, or contains uppercase labels)
        const isHeaderLike =
          isFirstTableBlock &&
          mappedColTexts.filter(Boolean).length >= 2 &&
          mappedColTexts.some((t) => t.length > 2 && (t === t.toUpperCase() || /(?:nom|description|qty|qte|total|prix|date|amount|code|libellé)/i.test(t)));

        if (isHeaderLike) {
          isFirstTableBlock = false;
          let ths = '';
          for (let cIdx = 0; cIdx < maxCols; cIdx++) {
            const cellVal = mappedColTexts[cIdx] || '';
            const c = ws.getCell(curRow, cIdx + 1);
            c.value = cellVal;
            c.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: `FF${primaryHex}` },
            };
            c.font = {
              name: isArabic ? 'Cairo' : 'Calibri',
              size: 10.5,
              bold: true,
              color: { argb: 'FFFFFFFF' },
            };
            c.border = {
              top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              bottom: { style: 'medium', color: { argb: `FF${accentHex}` } },
              left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
              right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            };
            c.alignment = { vertical: 'middle', horizontal: isArabic ? 'right' : 'left', wrapText: true };
            ths += `<th style="padding:7px 8px; border:1px solid #cbd5e1; background:#${primaryHex}; color:#ffffff; font-weight:700; text-align:${isArabic ? 'right' : 'left'};">${cellVal}</th>`;
          }
          row.height = 25;
          htmlRows += `<tr>${ths}</tr>`;
          curRow++;
          continue;
        }

        // Standard Data Row with Smart Type Formatting
        let tds = '';
        const isZebraOdd = curRow % 2 === 1;

        for (let cIdx = 0; cIdx < maxCols; cIdx++) {
          const rawVal = mappedColTexts[cIdx] || '';
          const c = ws.getCell(curRow, cIdx + 1);

          const { isNumeric, num, isPercent } = parseNumericValue(rawVal);
          const isDate = isDateString(rawVal);

          if (isNumeric && num !== undefined) {
            c.value = num;
            c.numFmt = isPercent ? '0.0%' : rawVal.includes('.') || rawVal.includes(',') ? '#,##0.00' : '#,##0';
          } else {
            c.value = rawVal;
          }

          if (isZebraOdd) {
            c.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' },
            };
          }

          c.font = {
            name: isArabic ? 'Cairo' : 'Calibri',
            size: 10,
            bold: cIdx === 0 && !isNumeric,
            color: { argb: 'FF1E293B' },
          };
          c.border = thinBorder;
          c.alignment = {
            vertical: 'middle',
            wrapText: true,
            horizontal: isNumeric ? 'right' : isDate ? 'center' : isArabic ? 'right' : 'left',
          };

          tds += `<td style="padding:6px 8px; border:1px solid #cbd5e1; ${
            cIdx === 0 && !isNumeric ? 'font-weight:700; background:#f1f5f9;' : isZebraOdd ? 'background:#f8fafc;' : ''
          } text-align:${isNumeric ? 'right' : isDate ? 'center' : isArabic ? 'right' : 'left'};">${rawVal}</td>`;
        }

        row.height = 21;
        htmlRows += `<tr>${tds}</tr>`;
        curRow++;
      }

      totalRows += curRow - 1;
      sheetPreviewHtmlBlocks.push(`
        <div style="border:1px solid #94a3b8; border-radius:10px; overflow:hidden; background:#ffffff; margin-bottom:18px; font-family:'Calibri','Cairo',sans-serif;">
          <div style="background:#107c41; color:#ffffff; padding:7px 12px; font-size:11px; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
            <span>SHEET: ${isArabic ? `صفحة ${page.pageNumber}` : `Page ${page.pageNumber}`} · DRAWN TABLE (.XLSX)</span>
            <div style="display:flex; gap:8px; align-items:center;">
              ${imagesHtml ? `<span style="background:rgba(255,255,255,0.2); padding:2px 6px; border-radius:4px; font-size:10px;">🖼️ ${page.images.length} Image(s) Framed</span>` : ''}
              <span>${curRow - 1} Rows · ${isArabic ? 'RTL' : 'LTR'}</span>
            </div>
          </div>
          ${imagesHtml ? `<div style="padding:10px; background:#f8fafc; border-bottom:1px solid #e2e8f0; text-align:center;">${imagesHtml}</div>` : ''}
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:11px; direction:${isArabic ? 'rtl' : 'ltr'};">
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
    const blob = new Blob([pdfBytes as BlobPart]);
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

/**
 * Ultra-fast non-blocking page count extractor for large PDFs.
 * 1. Checks byte stream for /Type /Pages ... /Count in first 256KB and last 512KB (~0.2ms)
 * 2. Checks PDF.js document catalog without loading page streams (~10ms)
 * 3. Fallbacks safely
 */
export async function getFastPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  if (!pdfBytes || pdfBytes.length < 10) return 1;

  // 1. Instant regex scan on head & tail
  try {
    const headLen = Math.min(pdfBytes.length, 256 * 1024);
    const tailLen = Math.min(pdfBytes.length, 512 * 1024);
    const headStr = new TextDecoder('latin1').decode(pdfBytes.subarray(0, headLen));
    const tailStr = new TextDecoder('latin1').decode(
      pdfBytes.subarray(Math.max(0, pdfBytes.length - tailLen))
    );
    const combined = headStr + '\n' + tailStr;

    const match =
      combined.match(/\/Type\s*\/Pages[\s\S]{0,150}\/Count\s+(\d+)/) ||
      combined.match(/\/Count\s+(\d+)[\s\S]{0,150}\/Type\s*\/Pages/);

    if (match && match[1]) {
      const count = parseInt(match[1], 10);
      if (count > 0 && count <= 50000) {
        return count;
      }
    }
  } catch {
    // continue
  }

  // 2. Fast PDF.js catalog check
  try {
    const task = pdfjsLib.getDocument({
      data: pdfBytes,
      disableFontFace: true,
      stopAtErrors: false,
    });
    const doc = await task.promise;
    const num = doc.numPages;
    try {
      doc.cleanup();
      task.destroy();
    } catch {
      // ignore
    }
    return num || 1;
  } catch {
    // continue
  }

  return 1;
}
