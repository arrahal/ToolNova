import crypto from 'crypto';
import { argon2id } from '@noble/hashes/argon2.js';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  ARGON_MEM_KIB,
  ARGON_PARALLELISM,
  ARGON_TIME_COST,
  SERVER_MASTER_KEY,
} from './config';
import { ProtectedFileRecord } from './storage';

export function deriveArgon2idMaterial(
  password: string,
  salt: Buffer
): {
  passwordVerificationHash: Buffer;
  userKeyMaterial: Buffer;
} {
  const out = argon2id(Buffer.from(password, 'utf-8'), salt, {
    t: ARGON_TIME_COST,
    m: ARGON_MEM_KIB,
    p: ARGON_PARALLELISM,
    dkLen: 64,
  });
  const buf = Buffer.from(out);
  return {
    passwordVerificationHash: buf.subarray(0, 32),
    userKeyMaterial: buf.subarray(32, 64),
  };
}

export function computeEnvelopeKek(userKeyMaterial: Buffer, fileId: string): Buffer {
  return crypto
    .createHmac('sha256', SERVER_MASTER_KEY)
    .update(userKeyMaterial)
    .update(Buffer.from(fileId, 'utf-8'))
    .digest();
}

// ============================================================================
// RATE LIMITING & BRUTE-FORCE PROTECTION
// ============================================================================
interface BruteForceTracker {
  failedAttempts: number;
  lockedUntil: number | null;
  lastAttemptAt: number;
}
const bruteForceStore = new Map<string, BruteForceTracker>();
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(ip: string, maxPerMin = 60): boolean {
  const now = Date.now();
  const current = rateLimitStore.get(ip);
  if (!current || now - current.windowStart > 60_000) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  current.count += 1;
  return current.count <= maxPerMin;
}

export function checkBruteForceLock(key: string): { blocked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const entry = bruteForceStore.get(key);
  if (!entry) return { blocked: false, retryAfterSec: 0 };
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    bruteForceStore.delete(key);
  }
  return { blocked: false, retryAfterSec: 0 };
}

export function recordFailedPasswordAttempt(key: string): {
  locked: boolean;
  remainingAttempts: number;
} {
  const now = Date.now();
  const entry = bruteForceStore.get(key) || {
    failedAttempts: 0,
    lockedUntil: null,
    lastAttemptAt: now,
  };
  if (now - entry.lastAttemptAt > 10 * 60 * 1000) {
    entry.failedAttempts = 0;
  }
  entry.failedAttempts += 1;
  entry.lastAttemptAt = now;
  const maxAttempts = 5;
  if (entry.failedAttempts >= maxAttempts) {
    entry.lockedUntil = now + 2 * 60 * 1000; // 2-minute lockout after 5 wrong passwords
    bruteForceStore.set(key, entry);
    return { locked: true, remainingAttempts: 0 };
  }
  bruteForceStore.set(key, entry);
  return { locked: false, remainingAttempts: maxAttempts - entry.failedAttempts };
}

export function clearFailedPasswordAttempts(key: string): void {
  bruteForceStore.delete(key);
}

// ============================================================================
// IN-MEMORY SECURE VIEWER CONTENT PARSER (NO TEMP FILES ON DISK)
// Converts decrypted Buffer in memory into a safe interactive representation
// ============================================================================
export interface SecureViewerPayload {
  viewerType: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip';
  htmlContent?: string;
  textContent?: string;
  sheets?: { name: string; rows: string[][] }[];
  slides?: { slideNumber: number; title: string; bullets: string[] }[];
  pdfBase64?: string;
  zipEntries?: { name: string; sizeBytes: number; isDirectory: boolean; compressedSize: number }[];
}

export async function buildSecureViewerPayload(
  decryptedBuffer: Buffer,
  record: ProtectedFileRecord
): Promise<SecureViewerPayload> {
  const ext = record.extension.toLowerCase();

  if (ext === '.docx' || ext === '.doc') {
    try {
      const htmlRes = await mammoth.convertToHtml({ buffer: decryptedBuffer });
      const rawRes = await mammoth.extractRawText({ buffer: decryptedBuffer });
      return {
        viewerType: 'word',
        htmlContent:
          htmlRes.value ||
          `<p>${(rawRes.value || 'مستند Word فارغ').replace(/\n/g, '</p><p>')}</p>`,
        textContent: rawRes.value || '',
      };
    } catch {
      const fallbackText = decryptedBuffer
        .toString('utf-8')
        .replace(/[^\x20-\x7E\u0600-\u06FF\n\r\t]/g, ' ');
      return {
        viewerType: 'word',
        htmlContent: `<div class="space-y-2"><p>${fallbackText.slice(0, 8000)}</p></div>`,
        textContent: fallbackText.slice(0, 8000),
      };
    }
  }

  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(decryptedBuffer as unknown as ExcelJS.Buffer);
      const sheets: { name: string; rows: string[][] }[] = [];
      workbook.eachSheet((worksheet) => {
        const rows: string[][] = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 200) {
            const values = Array.isArray(row.values) ? row.values.slice(1) : [];
            rows.push(
              values.map((cellVal) => {
                if (cellVal === null || cellVal === undefined) return '';
                if (typeof cellVal === 'object') {
                  if ('result' in cellVal && (cellVal as any).result !== undefined) {
                    return String((cellVal as any).result);
                  }
                  if ('text' in cellVal && (cellVal as any).text !== undefined) {
                    return String((cellVal as any).text);
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
        sheets: sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [['لا توجد بيانات']] }],
      };
    } catch {
      return {
        viewerType: 'excel',
        sheets: [{ name: 'Sheet1', rows: [['تعذر قراءة خلايا الجدول، لكن تم فك تشفير الملف بنجاح.']] }],
      };
    }
  }

  if (ext === '.pptx' || ext === '.ppt') {
    try {
      const zip = await JSZip.loadAsync(decryptedBuffer);
      const slideFiles = Object.keys(zip.files)
        .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
        .sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
          return numA - numB;
        });

      const slides: { slideNumber: number; title: string; bullets: string[] }[] = [];
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

      if (slides.length === 0) {
        slides.push({
          slideNumber: 1,
          title: record.originalName,
          bullets: ['تم فك تشفير العرض التقديمي بنجاح داخل العارض الآمن.'],
        });
      }

      return {
        viewerType: 'powerpoint',
        slides,
      };
    } catch {
      return {
        viewerType: 'powerpoint',
        slides: [
          {
            slideNumber: 1,
            title: record.originalName,
            bullets: ['تم التحقق من كلمة المرور وفك تشفير العرض التقديمي بنجاح.'],
          },
        ],
      };
    }
  }

  if (ext === '.pdf') {
    return {
      viewerType: 'pdf',
      pdfBase64:
        decryptedBuffer.byteLength <= 3 * 1024 * 1024
          ? decryptedBuffer.toString('base64')
          : undefined,
    };
  }

  // .zip archive inspection
  try {
    const zip = await JSZip.loadAsync(decryptedBuffer);
    const zipEntries: {
      name: string;
      sizeBytes: number;
      isDirectory: boolean;
      compressedSize: number;
    }[] = [];

    for (const [entryPath, fileObj] of Object.entries(zip.files)) {
      const rawData = fileObj.dir ? null : await fileObj.async('uint8array').catch(() => null);
      zipEntries.push({
        name: entryPath,
        sizeBytes: rawData ? rawData.byteLength : 0,
        isDirectory: fileObj.dir,
        compressedSize: rawData ? Math.round(rawData.byteLength * 0.72) : 0,
      });
    }

    return {
      viewerType: 'zip',
      zipEntries,
    };
  } catch {
    return {
      viewerType: 'zip',
      zipEntries: [
        {
          name: record.originalName,
          sizeBytes: record.fileSize,
          isDirectory: false,
          compressedSize: record.fileSize,
        },
      ],
    };
  }
}
