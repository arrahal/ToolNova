import { parentPort, workerData } from 'worker_threads';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { sanitizeHtml } from './sanitizeHtml.js';

const MAX_ZIP_ENTRIES = 2000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_PER_ENTRY_BYTES = 50 * 1024 * 1024; // 50MB

async function parsePayload(data) {
  const { buffer, ext, originalName } = data;
  const lowerExt = (ext || '').toLowerCase();

  // Helper to validate zip files against zip-bomb attacks
  async function validateZipSafety(zip) {
    const fileKeys = Object.keys(zip.files);
    if (fileKeys.length > MAX_ZIP_ENTRIES) {
      throw new Error(`ZIP_BOMB: عدد الملفات داخل الأرشيف (${fileKeys.length}) يتجاوز الحد الأقصى المسموح به (2,000 ملف).`);
    }

    let totalUncompressed = 0;
    for (const key of fileKeys) {
      const entry = zip.files[key];
      if (entry.dir) continue;

      // Extract uncompressed size from JSZip internal metadata if present
      const uncompressed = entry._data ? entry._data.uncompressedSize : 0;
      if (uncompressed > MAX_PER_ENTRY_BYTES) {
        throw new Error(`ZIP_BOMB: حجم أحد الملفات داخل الأرشيف يتجاوز الحد الأقصى المسموح به (50 ميجابايت).`);
      }
      totalUncompressed += uncompressed;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(`ZIP_BOMB: إجمالي حجم الملفات بعد فك الضغط يتجاوز 200 ميجابايت.`);
      }
    }
  }

  // 1. DOCX / DOC
  if (lowerExt === '.docx' || lowerExt === '.doc') {
    // Quick ZIP check if it's a docx
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      const zip = await JSZip.loadAsync(buffer);
      await validateZipSafety(zip);
    }

    const htmlRes = await mammoth.convertToHtml({ buffer });
    const rawRes = await mammoth.extractRawText({ buffer });
    const rawHtml =
      htmlRes.value ||
      `<p>${(rawRes.value || 'مستند Word فارغ').replace(/\n/g, '</p><p>')}</p>`;

    return {
      viewerType: 'word',
      previewAvailable: true,
      htmlContent: sanitizeHtml(rawHtml),
      textContent: rawRes.value || '',
    };
  }

  // 2. XLSX / XLS
  if (lowerExt === '.xlsx' || lowerExt === '.xls') {
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      const zip = await JSZip.loadAsync(buffer);
      await validateZipSafety(zip);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheets = [];

    workbook.eachSheet((worksheet) => {
      const rows = [];
      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= 200) {
          const values = Array.isArray(row.values) ? row.values.slice(1) : [];
          rows.push(
            values.map((cellVal) => {
              if (cellVal === null || cellVal === undefined) return '';
              if (typeof cellVal === 'object') {
                if ('result' in cellVal && cellVal.result !== undefined) {
                  return String(cellVal.result);
                }
                if ('text' in cellVal && cellVal.text !== undefined) {
                  return String(cellVal.text);
                }
                return JSON.stringify(cellVal);
              }
              return String(cellVal);
            })
          );
        }
      });
      sheets.push({
        name: worksheet.name || 'Sheet1',
        rows: rows.length > 0 ? rows : [['(جدول فارغ / Empty Sheet)']],
      });
    });

    return {
      viewerType: 'excel',
      previewAvailable: true,
      sheets: sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [['لا توجد بيانات']] }],
    };
  }

  // 3. PPTX / PPT
  if (lowerExt === '.pptx' || lowerExt === '.ppt') {
    const zip = await JSZip.loadAsync(buffer);
    await validateZipSafety(zip);

    const slideFiles = Object.keys(zip.files)
      .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
        return numA - numB;
      });

    const slides = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async('string');
      const matches = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))
        .map((m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
        )
        .filter(Boolean);

      slides.push({
        slideNumber: i + 1,
        title: matches[0] || `الشريحة ${i + 1}`,
        bullets: matches.slice(1),
      });
    }

    return {
      viewerType: 'powerpoint',
      previewAvailable: true,
      slides: slides.length > 0 ? slides : [{ slideNumber: 1, title: originalName, bullets: ['تم فك تشفير العرض التقديمي بنجاح.'] }],
    };
  }

  // 4. ZIP Archives
  const zip = await JSZip.loadAsync(buffer);
  await validateZipSafety(zip);

  const zipEntries = [];
  for (const [entryPath, fileObj] of Object.entries(zip.files)) {
    // Determine real compressed size and uncompressed size
    const uncompressedSize = fileObj._data ? Number(fileObj._data.uncompressedSize || 0) : 0;
    const realCompressedSize = fileObj._data ? Number(fileObj._data.compressedSize || uncompressedSize) : uncompressedSize;

    zipEntries.push({
      name: entryPath,
      sizeBytes: uncompressedSize,
      isDirectory: fileObj.dir,
      compressedSize: realCompressedSize,
    });
  }

  return {
    viewerType: 'zip',
    previewAvailable: true,
    zipEntries,
  };
}

// Execute worker logic
(async () => {
  try {
    const input = workerData;
    const result = await parsePayload(input);
    parentPort?.postMessage({ ok: true, result });
  } catch (err) {
    parentPort?.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
})();
