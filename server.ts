import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { argon2id } from '@noble/hashes/argon2.js';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VAULT_STORE_FILE = path.join(__dirname, '.vault_quotas.json');
const PROTECTOR_DB_FILE = path.join(__dirname, '.protector_db.json');
const SECURE_STORAGE_DIR = path.join(__dirname, '.secure_storage');

// Ensure isolated encrypted storage directory exists outside public web root
if (!fs.existsSync(SECURE_STORAGE_DIR)) {
  fs.mkdirSync(SECURE_STORAGE_DIR, { recursive: true, mode: 0o700 });
}

// Persistent server master secret for AES-256-GCM envelope key wrapping
const MASTER_KEY_FILE = path.join(SECURE_STORAGE_DIR, '.master_key');
function getOrCreateServerMasterKey(): Buffer {
  try {
    if (fs.existsSync(MASTER_KEY_FILE)) {
      const hex = fs.readFileSync(MASTER_KEY_FILE, 'utf-8').trim();
      if (hex.length === 64) {
        return Buffer.from(hex, 'hex');
      }
    }
    const newKey = crypto.randomBytes(32);
    fs.writeFileSync(MASTER_KEY_FILE, newKey.toString('hex'), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    return newKey;
  } catch {
    return crypto.createHash('sha256').update('toolnova-fallback-master-secret-v1').digest();
  }
}
const SERVER_MASTER_KEY = getOrCreateServerMasterKey();

// ============================================================================
// EXTENSIBLE SUPPORTED FILE TYPES REGISTRY (Easy to add new formats in future)
// ============================================================================
export interface SupportedFileFormatSpec {
  extension: string;
  category: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip' | 'other';
  labelAr: string;
  labelEn: string;
  mimeTypes: string[];
  maxSizeBytes: number;
}

export const SUPPORTED_PROTECTED_FORMATS: Record<string, SupportedFileFormatSpec> = {
  '.docx': {
    extension: '.docx',
    category: 'word',
    labelAr: 'مستند Word (.docx)',
    labelEn: 'Word Document (.docx)',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    maxSizeBytes: 50 * 1024 * 1024, // 50 MB
  },
  '.xlsx': {
    extension: '.xlsx',
    category: 'excel',
    labelAr: 'جدول بيانات Excel (.xlsx)',
    labelEn: 'Excel Spreadsheet (.xlsx)',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.pptx': {
    extension: '.pptx',
    category: 'powerpoint',
    labelAr: 'عرض تقديمي PowerPoint (.pptx)',
    labelEn: 'PowerPoint Presentation (.pptx)',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
    ],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.pdf': {
    extension: '.pdf',
    category: 'pdf',
    labelAr: 'مستند PDF (.pdf)',
    labelEn: 'PDF Document (.pdf)',
    mimeTypes: ['application/pdf'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.zip': {
    extension: '.zip',
    category: 'zip',
    labelAr: 'أرشيف مضغوط ZIP (.zip)',
    labelEn: 'ZIP Archive (.zip)',
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
};

// ============================================================================
// DATABASE TYPES FOR FILE PROTECTOR SERVICE
// ============================================================================
export type ProtectedFileStatus = 'active' | 'expired' | 'exhausted' | 'revoked' | 'deleted';

export interface ProtectedFileRecord {
  fileId: string;
  ownerId: string;
  originalName: string;
  secureFileName: string;
  extension: string;
  category: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip' | 'other';
  mimeType: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number | null;
  expirationLabel: string;
  maxOpens: number | null; // null = unlimited (بدون حد)
  usedOpens: number;
  remainingOpens: number | null; // null = unlimited
  status: ProtectedFileStatus;
  lastOpenedAt: number | null;
  passwordHash: string; // Argon2id hash hex (NEVER plaintext)
  cryptoMeta: {
    algorithm: 'AES-256-GCM';
    kdf: 'Argon2id';
    argonSaltHex: string;
    argonTimeCost: number;
    argonMemCostKiB: number;
    argonParallelism: number;
    fileIvHex: string;
    fileAuthTagHex: string;
    wrappedDekHex: string;
    dekIvHex: string;
    dekAuthTagHex: string;
    containerHmacHex: string;
    webCryptoSaltHex?: string;
    webCryptoIvHex?: string;
    webViewerCiphertextBase64?: string;
    webFileCiphertextBase64?: string;
  };
  openLogs: {
    attemptId: string;
    openedAt: number;
    openNumber: number;
    clientSummary: string;
  }[];
}

function readProtectorDb(): Record<string, ProtectedFileRecord> {
  try {
    if (fs.existsSync(PROTECTOR_DB_FILE)) {
      const raw = fs.readFileSync(PROTECTOR_DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read protector DB:', e);
  }
  return {};
}

function writeProtectorDb(db: Record<string, ProtectedFileRecord>): void {
  try {
    const tmpFile = `${PROTECTOR_DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpFile, PROTECTOR_DB_FILE);
  } catch (e) {
    console.error('Failed to write protector DB:', e);
  }
}

// ============================================================================
// ATOMIC MUTEX LOCK FOR CONCURRENT OPEN-LIMIT CONSUMPTION
// Ensures that if maxOpens = 1 and 2 requests arrive simultaneously,
// they execute strictly sequentially and only the first one succeeds!
// ============================================================================
let protectorMutexChain: Promise<unknown> = Promise.resolve();

function withAtomicProtectorLock<T>(task: () => Promise<T>): Promise<T> {
  const next = protectorMutexChain.then(task, task);
  protectorMutexChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

// ============================================================================
// CRYPTOGRAPHY HELPERS: ARGON2ID + AES-256-GCM ENVELOPE ENCRYPTION
// ============================================================================
const ARGON_TIME_COST = 2;
const ARGON_MEM_KIB = 16384; // 16 MiB memory-hard
const ARGON_PARALLELISM = 1;

function deriveArgon2idMaterial(password: string, salt: Buffer): {
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

function computeEnvelopeKek(userKeyMaterial: Buffer, fileId: string): Buffer {
  return crypto
    .createHmac('sha256', SERVER_MASTER_KEY)
    .update(userKeyMaterial)
    .update(Buffer.from(fileId, 'utf-8'))
    .digest();
}

function sanitizeFileId(rawId: unknown): string | null {
  if (typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  // Strict UUID / hex-hyphen check to prevent any Path Traversal
  if (!/^[a-fA-F0-9-]{16,64}$/.test(trimmed)) return null;
  return trimmed;
}

function getEncryptedFilePath(fileId: string): string {
  const safeId = sanitizeFileId(fileId);
  if (!safeId) {
    throw new Error('Invalid file ID');
  }
  const resolved = path.resolve(SECURE_STORAGE_DIR, `${safeId}.enc`);
  if (!resolved.startsWith(path.resolve(SECURE_STORAGE_DIR))) {
    throw new Error('Path traversal blocked');
  }
  return resolved;
}

function computeDynamicStatus(record: ProtectedFileRecord, now = Date.now()): ProtectedFileStatus {
  if (record.status === 'revoked' || record.status === 'deleted') {
    return record.status;
  }
  if (record.expiresAt !== null && now > record.expiresAt) {
    return 'expired';
  }
  if (record.maxOpens !== null && record.usedOpens >= record.maxOpens) {
    return 'exhausted';
  }
  return 'active';
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

function checkRateLimit(ip: string, maxPerMin = 60): boolean {
  const now = Date.now();
  const current = rateLimitStore.get(ip);
  if (!current || now - current.windowStart > 60_000) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }
  current.count += 1;
  return current.count <= maxPerMin;
}

function checkBruteForceLock(key: string): { blocked: boolean; retryAfterSec: number } {
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

function recordFailedPasswordAttempt(key: string): { locked: boolean; remainingAttempts: number } {
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

function clearFailedPasswordAttempts(key: string): void {
  bruteForceStore.delete(key);
}

// ============================================================================
// IN-MEMORY SECURE VIEWER CONTENT PARSER (NO TEMP FILES ON DISK)
// Converts decrypted Buffer in memory into a safe interactive representation
// ============================================================================
async function buildSecureViewerPayload(
  decryptedBuffer: Buffer,
  record: ProtectedFileRecord
): Promise<{
  viewerType: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip';
  htmlContent?: string;
  textContent?: string;
  sheets?: { name: string; rows: string[][] }[];
  slides?: { slideNumber: number; title: string; bullets: string[] }[];
  pdfBase64?: string;
  zipEntries?: { name: string; sizeBytes: number; isDirectory: boolean; compressedSize: number }[];
}> {
  const ext = record.extension.toLowerCase();

  if (ext === '.docx') {
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
      const fallbackText = decryptedBuffer.toString('utf-8').replace(/[^\x20-\x7E\u0600-\u06FF\n\r\t]/g, ' ');
      return {
        viewerType: 'word',
        htmlContent: `<div class="space-y-2"><p>${fallbackText.slice(0, 8000)}</p></div>`,
        textContent: fallbackText.slice(0, 8000),
      };
    }
  }

  if (ext === '.xlsx') {
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
        sheets: sheets.length > 0 ? sheets : [{ name: 'Sheet1', rows: [['لا توجد بيانات']] }],
      };
    } catch {
      return {
        viewerType: 'excel',
        sheets: [{ name: 'Sheet1', rows: [['تعذر قراءة خلايا الجدول، لكن تم فك تشفير الملف بنجاح.']] }],
      };
    }
  }

  if (ext === '.pptx') {
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
        const matches = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
        ).filter(Boolean);

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

// ============================================================================
// SELF-CONTAINED INTERACTIVE PROTECTED FILE LAUNCHER (.protected.html)
// Opens directly on double-click on any PC/Mobile browser, prompts for password,
// verifies Atomic Open Limit + Argon2id + AES-256-GCM against the server,
// and displays the Secure Viewer or "🔒 الملف غير متاح" screen!
// Also embeds <!--TOOLNOVA_SECURE_CONTAINER_START ... END--> so it can be
// uploaded directly into the website's "فتح ملف محمي" page as well!
// ============================================================================
function buildInteractiveProtectedHtmlLauncher(containerObj: Record<string, unknown>): string {
  const jsonPayload = JSON.stringify(containerObj);
  const safeOriginalName = String(containerObj.originalName || 'Document')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const maxOpensDisplay =
    containerObj.maxOpens === null || containerObj.maxOpens === undefined
      ? 'بدون حد (∞)'
      : String(containerObj.maxOpens);
  const expDisplay = String(containerObj.expirationLabel || 'بدون انتهاء')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>🔐 ملف محمي ومشفر — ${safeOriginalName}</title>
  <!--TOOLNOVA_SECURE_CONTAINER_START${jsonPayload}TOOLNOVA_SECURE_CONTAINER_END-->
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, system-ui, -apple-system, sans-serif; }
    body {
      background: #FAFAFC;
      color: #111827;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 540px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 32px 28px;
      box-shadow: 0 20px 45px -15px rgba(15, 23, 42, 0.08);
      text-align: center;
    }
    .viewer-card {
      max-width: 980px;
      text-align: right;
      padding: 0;
      overflow: hidden;
    }
    .icon-box {
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #e5322d;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 18px;
      font-size: 28px;
    }
    h1 {
      font-size: 21px;
      font-weight: 800;
      color: #111827;
      margin-bottom: 6px;
    }
    .filename {
      font-size: 13px;
      font-weight: 700;
      color: #e5322d;
      background: #fff1f2;
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      margin-bottom: 18px;
      direction: ltr;
      word-break: break-all;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 12px;
      margin-bottom: 20px;
      text-align: right;
      font-size: 12px;
    }
    .meta-label { color: #64748b; display: block; margin-bottom: 3px; font-size: 11px; }
    .meta-val { font-weight: 800; color: #0f172a; }
    .field-label {
      display: block;
      text-align: right;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 8px;
      color: #1e293b;
    }
    .input-wrap {
      position: relative;
      margin-bottom: 14px;
    }
    input[type="password"], input[type="text"] {
      width: 100%;
      padding: 13px 16px;
      border-radius: 12px;
      border: 1.5px solid #cbd5e1;
      background: #f8fafc;
      font-size: 15px;
      color: #0f172a;
      outline: none;
      transition: border-color 0.2s;
      text-align: center;
      letter-spacing: 2px;
    }
    input:focus { border-color: #e5322d; background: #ffffff; }
    .btn {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 12px;
      background: #e5322d;
      color: #ffffff;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .btn:hover { background: #d12823; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-download-orig {
      background: #10b981;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 9px;
      font-size: 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn-download-orig:hover { background: #059669; }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 11px 14px;
      border-radius: 12px;
      font-size: 12.5px;
      font-weight: 700;
      margin-bottom: 14px;
      display: none;
      text-align: right;
    }
    .badge-bar {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #f1f5f9;
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .viewer-header {
      background: #0f172a;
      color: #ffffff;
      padding: 16px 22px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .viewer-body {
      padding: 24px;
      max-height: 75vh;
      overflow-y: auto;
      background: #FAFAFC;
      user-select: none;
    }
    .doc-surface {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 24px;
      line-height: 1.8;
      font-size: 14px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; background: #fff; margin-bottom: 16px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; }
    tr:first-child { background: #f1f5f9; font-weight: 800; }
    .slide-box {
      background: #fff;
      border: 2px solid #fed7aa;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 14px;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body oncontextmenu="return false;">

  <!-- 1. PASSWORD GATE SCREEN -->
  <div id="gateScreen" class="card">
    <div class="icon-box">🔐</div>
    <h1>هذا الملف محمي بكلمة مرور</h1>
    <div class="filename">${safeOriginalName}</div>

    <div class="meta-grid">
      <div>
        <span class="meta-label">عدد مرات الفتح المتبقية</span>
        <span id="metaRemaining" class="meta-val">${maxOpensDisplay}</span>
      </div>
      <div>
        <span class="meta-label">مدة الصلاحية</span>
        <span id="metaExpiry" class="meta-val">${expDisplay}</span>
      </div>
    </div>

    <label class="field-label" for="pwdInput">أدخل كلمة المرور لفتح الملف:</label>
    <div class="input-wrap">
      <input id="pwdInput" type="password" placeholder="••••••••" autocomplete="off" autofocus />
    </div>

    <div id="errorBox" class="error-box"></div>

    <button id="openBtn" class="btn" onclick="unlockProtectedFile()">
      <span>🔓 فتح الملف المحمي</span>
    </button>

    <div class="badge-bar">
      <span>AES-256-GCM Encrypted</span>
      <span>•</span>
      <span>Argon2id</span>
      <span>•</span>
      <span>Atomic Open Control</span>
    </div>
  </div>

  <!-- 2. EXPIRED / EXHAUSTED / UNAVAILABLE SCREEN -->
  <div id="expiredScreen" class="card hidden">
    <div class="icon-box" style="background:#fef2f2;color:#dc2626;">🔒</div>
    <h1 style="color:#dc2626;">🔒 الملف غير متاح</h1>
    <p style="font-size:15px;font-weight:800;color:#e5322d;margin:10px 0;">
      "لقد انتهت صلاحية الوصول إلى هذا الملف."
    </p>
    <p id="expiredReasonText" style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px;">
      انتهت صلاحية فتح هذا الملف أو تم استنفاد جميع مرات الفتح المسموحة.
    </p>
    <div class="meta-grid">
      <div>
        <span class="meta-label">حالة الملف</span>
        <span class="meta-val" style="color:#dc2626;">منتهي الصلاحية / مغلق</span>
      </div>
      <div>
        <span class="meta-label">الفتحات المتبقية</span>
        <span class="meta-val" style="color:#dc2626;">0</span>
      </div>
    </div>
  </div>

  <!-- 3. SECURE VIEWER SCREEN -->
  <div id="viewerScreen" class="card viewer-card hidden">
    <div class="viewer-header">
      <div>
        <div style="font-size:15px;font-weight:800;">🛡️ ${safeOriginalName}</div>
        <div id="viewerNotice" style="font-size:12px;color:#34d399;margin-top:2px;">
          تم التحقق من كلمة المرور وفك تشفير الملف بنجاح داخل العارض الآمن
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap;">
        <button id="downloadDecryptedBtn" class="btn-download-orig hidden" onclick="downloadDecryptedOriginal()">
          ⬇️ تنزيل الملف الأصلي (${safeOriginalName})
        </button>
        <span style="background:#1e293b;padding:6px 12px;border-radius:8px;border:1px solid #334155;">
          الفتحات المتبقية: <strong id="viewerRemaining" style="color:#34d399;">-</strong>
        </span>
      </div>
    </div>
    <div id="viewerBody" class="viewer-body"></div>
  </div>

  <script>
    const CONTAINER = ${jsonPayload};
    const LOCAL_STORAGE_KEY = 'toolnova_opens_' + CONTAINER.fileId;
    let decryptedRawBytes = null;

    function getLocalUsedOpens() {
      try {
        const val = parseInt(localStorage.getItem(LOCAL_STORAGE_KEY) || '0', 10);
        return isNaN(val) ? 0 : val;
      } catch (e) {
        return 0;
      }
    }

    function setLocalUsedOpens(count) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, String(count));
      } catch (e) {}
    }

    function getCandidateApiBases() {
      const list = [];
      if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
        list.push(window.location.origin);
      }
      if (CONTAINER.clientOrigin && list.indexOf(CONTAINER.clientOrigin) === -1) {
        list.push(CONTAINER.clientOrigin);
      }
      if (CONTAINER.serverOrigin && list.indexOf(CONTAINER.serverOrigin) === -1) {
        list.push(CONTAINER.serverOrigin);
      }
      return list;
    }

    async function fetchFromAnyServer(endpointPath, payload) {
      const bases = getCandidateApiBases();
      for (let i = 0; i < bases.length; i++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(function() { controller.abort(); }, 3500);
          const res = await fetch(bases[i] + endpointPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
          clearTimeout(timer);
          const contentType = res.headers.get('content-type') || '';
          if (contentType.indexOf('application/json') !== -1) {
            const data = await res.json();
            return { reachable: true, ok: res.ok, status: res.status, data: data };
          }
        } catch (err) {
          // Try next candidate
        }
      }
      return { reachable: false };
    }

    function showExpiredScreen(reason) {
      document.getElementById('gateScreen').classList.add('hidden');
      document.getElementById('viewerScreen').classList.add('hidden');
      const expEl = document.getElementById('expiredScreen');
      expEl.classList.remove('hidden');
      if (reason) {
        document.getElementById('expiredReasonText').textContent = reason;
      }
    }

    function hexToBytes(hex) {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return bytes;
    }

    function base64ToBytes(b64) {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      return bytes;
    }

    // WebCrypto AES-256-GCM local decryption fallback when opened via file://
    async function decryptWithWebCrypto(password) {
      const encMeta = CONTAINER.encryption || {};
      if (!encMeta.webCryptoSaltHex || !encMeta.webCryptoIvHex) {
        throw new Error('NO_WEBCRYPTO_META');
      }
      const enc = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
      );
      const salt = hexToBytes(encMeta.webCryptoSaltHex);
      const iv = hexToBytes(encMeta.webCryptoIvHex);

      const aesKey = await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // 1) Decrypt the rich viewer JSON payload using AES-256-GCM (verifies password & GCM auth tag!)
      let viewerObj = null;
      if (CONTAINER.webViewerCiphertextBase64) {
        const cipherBytes = base64ToBytes(CONTAINER.webViewerCiphertextBase64);
        const decryptedBuf = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv, tagLength: 128 },
          aesKey,
          cipherBytes
        );
        const jsonStr = new TextDecoder().decode(decryptedBuf);
        viewerObj = JSON.parse(jsonStr);
      }

      // 2) Also decrypt the original binary file bytes using AES-256-GCM
      if (CONTAINER.webCiphertextBase64) {
        try {
          const rawCipher = base64ToBytes(CONTAINER.webCiphertextBase64);
          const rawDecrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv, tagLength: 128 },
            aesKey,
            rawCipher
          );
          decryptedRawBytes = new Uint8Array(rawDecrypted);
        } catch (e) {}
      }

      return viewerObj;
    }

    function downloadDecryptedOriginal() {
      if (!decryptedRawBytes) return;
      const blob = new Blob([decryptedRawBytes], {
        type: CONTAINER.mimeType || 'application/octet-stream'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = CONTAINER.originalName || 'decrypted_file';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Inspect status on page load (checks both local quota & live server quota)
    (async function inspectOnLoad() {
      // 1. Check expiration timestamp
      if (CONTAINER.expiresAt && Date.now() > CONTAINER.expiresAt) {
        showExpiredScreen('لقد انتهت صلاحية الوصول إلى هذا الملف (انتهت المدة الزمنية المحددة).');
        return;
      }

      // 2. Check local open counter immediately
      const localUsed = getLocalUsedOpens();
      if (CONTAINER.maxOpens !== null && CONTAINER.maxOpens !== undefined) {
        const localRem = Math.max(0, CONTAINER.maxOpens - localUsed);
        document.getElementById('metaRemaining').textContent = localRem + ' من ' + CONTAINER.maxOpens;
        if (localUsed >= CONTAINER.maxOpens) {
          showExpiredScreen('انتهت صلاحية فتح هذا الملف. تم استهلاك جميع مرات الفتح المسموحة (' + CONTAINER.maxOpens + ').');
          return;
        }
      }

      // 3. Try syncing with server if reachable
      const srv = await fetchFromAnyServer('/api/protector/inspect', { fileId: CONTAINER.fileId });
      if (srv.reachable && srv.data) {
        if (!srv.ok || !srv.data.exists) {
          showExpiredScreen(srv.data.error || 'لقد انتهت صلاحية الوصول إلى هذا الملف.');
          return;
        }
        const f = srv.data.file;
        if (f.usedOpens > localUsed) {
          setLocalUsedOpens(f.usedOpens);
        }
        document.getElementById('metaRemaining').textContent =
          f.remainingOpens === null ? 'بدون حد (∞)' : f.remainingOpens + ' من ' + f.maxOpens;
        if (f.status === 'exhausted' || f.status === 'expired' || f.status === 'revoked') {
          showExpiredScreen('انتهت صلاحية فتح هذا الملف. تم استهلاك جميع مرات الفتح المسموحة.');
        }
      }
    })();

    document.getElementById('pwdInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') unlockProtectedFile();
    });

    async function unlockProtectedFile() {
      const pwd = document.getElementById('pwdInput').value;
      const errBox = document.getElementById('errorBox');
      const btn = document.getElementById('openBtn');
      errBox.style.display = 'none';

      if (!pwd) {
        errBox.textContent = 'الرجاء إدخال كلمة المرور.';
        errBox.style.display = 'block';
        return;
      }

      // Check expiration & local quota before anything
      if (CONTAINER.expiresAt && Date.now() > CONTAINER.expiresAt) {
        showExpiredScreen('لقد انتهت صلاحية الوصول إلى هذا الملف (انتهت المدة الزمنية المحددة).');
        return;
      }

      const localUsed = getLocalUsedOpens();
      if (CONTAINER.maxOpens !== null && CONTAINER.maxOpens !== undefined && localUsed >= CONTAINER.maxOpens) {
        showExpiredScreen('انتهت صلاحية فتح هذا الملف. تم استنفاد جميع مرات الفتح المسموحة.');
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span>جاري التحقق من كلمة المرور وفك التشفير (AES-256-GCM)...</span>';

      // Step A: Try live server atomic verification first
      const srv = await fetchFromAnyServer('/api/protector/open', {
        fileId: CONTAINER.fileId,
        password: pwd,
        ciphertextBase64: CONTAINER.ciphertextBase64
      });

      if (srv.reachable && srv.data) {
        const data = srv.data;
        if (!srv.ok || !data.allowed) {
          if (
            data.code === 'OPEN_LIMIT_REACHED' ||
            data.code === 'EXPIRED_TIME' ||
            data.code === 'REVOKED' ||
            data.code === 'DELETED'
          ) {
            if (CONTAINER.maxOpens) setLocalUsedOpens(CONTAINER.maxOpens);
            showExpiredScreen(data.detail || data.error || 'انتهت صلاحية فتح هذا الملف.');
            return;
          }
          errBox.textContent = data.error || 'كلمة المرور غير صحيحة!';
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.innerHTML = '<span>🔓 فتح الملف المحمي</span>';
          return;
        }

        // Also decrypt raw bytes in browser if available so user can download original file if desired
        try { await decryptWithWebCrypto(pwd); } catch (e) {}

        if (data.file && typeof data.file.usedOpens === 'number') {
          setLocalUsedOpens(data.file.usedOpens);
        } else {
          setLocalUsedOpens(localUsed + 1);
        }
        renderSecureViewer(data.file, data.viewer, data.message);
        return;
      }

      // Step B: Server unreachable (e.g. opened from local file:// on another device or blocked by browser CORS)
      // Perform genuine AES-256-GCM cryptographic decryption & authentication directly in the browser!
      try {
        const viewerPayload = await decryptWithWebCrypto(pwd);
        const nextUsed = localUsed + 1;
        setLocalUsedOpens(nextUsed);
        const rem =
          CONTAINER.maxOpens === null || CONTAINER.maxOpens === undefined
            ? null
            : Math.max(0, CONTAINER.maxOpens - nextUsed);

        const msg =
          rem === 0
            ? 'تم التحقق من كلمة المرور وفتح الملف بنجاح. (تنبيه: تم استهلاك الفتحة الوحيدة/الأخيرة — الفتحات المتبقية الآن: 0)'
            : 'تم التحقق من كلمة المرور وفك تشفير الملف بنجاح (AES-256-GCM).';

        renderSecureViewer(
          {
            originalName: CONTAINER.originalName,
            maxOpens: CONTAINER.maxOpens,
            usedOpens: nextUsed,
            remainingOpens: rem
          },
          viewerPayload || { viewerType: 'word', htmlContent: '<p>تم فك تشفير الملف بنجاح.</p>' },
          msg
        );
      } catch (cryptoErr) {
        errBox.textContent = '❌ كلمة المرور غير صحيحة! فشل فك تشفير AES-256-GCM.';
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.innerHTML = '<span>🔓 فتح الملف المحمي</span>';
      }
    }

    function renderSecureViewer(fileMeta, viewer, message) {
      document.getElementById('gateScreen').classList.add('hidden');
      document.getElementById('expiredScreen').classList.add('hidden');
      const vScreen = document.getElementById('viewerScreen');
      vScreen.classList.remove('hidden');

      document.getElementById('viewerNotice').textContent = message || '';
      document.getElementById('viewerRemaining').textContent =
        fileMeta.remainingOpens === null || fileMeta.remainingOpens === undefined
          ? '∞'
          : String(fileMeta.remainingOpens);

      if (decryptedRawBytes) {
        document.getElementById('downloadDecryptedBtn').classList.remove('hidden');
      }

      const body = document.getElementById('viewerBody');
      body.innerHTML = '';

      if (viewer.viewerType === 'word') {
        const div = document.createElement('div');
        div.className = 'doc-surface';
        div.innerHTML = viewer.htmlContent || '<p>تم فك تشفير مستند Word بنجاح.</p>';
        body.appendChild(div);
      } else if (viewer.viewerType === 'excel' && viewer.sheets) {
        viewer.sheets.forEach(function(sheet) {
          const title = document.createElement('h3');
          title.style.margin = '10px 0';
          title.textContent = '📊 جدول: ' + sheet.name;
          body.appendChild(title);
          const tbl = document.createElement('table');
          (sheet.rows || []).forEach(function(r) {
            const tr = document.createElement('tr');
            r.forEach(function(c) {
              const td = document.createElement('td');
              td.textContent = c;
              tr.appendChild(td);
            });
            tbl.appendChild(tr);
          });
          body.appendChild(tbl);
        });
      } else if (viewer.viewerType === 'powerpoint' && viewer.slides) {
        viewer.slides.forEach(function(s) {
          const box = document.createElement('div');
          box.className = 'slide-box';
          const h = document.createElement('h3');
          h.textContent = 'شريحة ' + s.slideNumber + ': ' + s.title;
          box.appendChild(h);
          const ul = document.createElement('ul');
          ul.style.marginTop = '10px';
          ul.style.paddingRight = '20px';
          (s.bullets || []).forEach(function(b) {
            const li = document.createElement('li');
            li.textContent = b;
            ul.appendChild(li);
          });
          box.appendChild(ul);
          body.appendChild(box);
        });
      } else if (viewer.viewerType === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '520px';
        iframe.style.border = '1px solid #e2e8f0';
        iframe.style.borderRadius = '12px';
        let pdfSrc = '';
        if (typeof decryptedRawBytes !== 'undefined' && decryptedRawBytes && decryptedRawBytes.length > 0) {
          const pdfBlob = new Blob([decryptedRawBytes], { type: 'application/pdf' });
          pdfSrc = URL.createObjectURL(pdfBlob) + '#toolbar=0';
        } else if (viewer.pdfBase64) {
          pdfSrc = 'data:application/pdf;base64,' + viewer.pdfBase64 + '#toolbar=0';
        }
        iframe.src = pdfSrc;
        body.appendChild(iframe);
      } else if (viewer.viewerType === 'zip' && viewer.zipEntries) {
        const div = document.createElement('div');
        div.className = 'doc-surface';
        let html = '<h3 style="margin-bottom:12px;">📦 محتويات الأرشيف المشفر (.zip):</h3><ul>';
        viewer.zipEntries.forEach(function(e) {
          html += '<li style="padding:6px 0;border-bottom:1px solid #f1f5f9;direction:ltr;text-align:left;"><strong>' + e.name + '</strong> (' + e.sizeBytes + ' bytes)</li>';
        });
        html += '</ul>';
        div.innerHTML = html;
        body.appendChild(div);
      }
    }
  </script>
</body>
</html>`;
}

// ============================================================================
// LEGACY VAULT STORE (Preserved 100% for existing Protect Word/Excel/PPT tools)
// ============================================================================
export interface VaultTokenState {
  tokenId: string;
  fileName: string;
  docType: 'word' | 'excel' | 'powerpoint';
  passwordHash: string;
  maxAllowedUsers: number;
  usedCount: number;
  lockEditingMode: 'full-lock' | 'read-only-watermark' | 'form-comments-only';
  expirationTimestamp: number | null;
  accessLog: {
    slotIndex: number;
    deviceFingerprint: string;
    accessedAt: string;
    status: 'GRANTED';
  }[];
  createdAt: number;
  updatedAt: number;
}

function computeSimpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

function readVaultStore(): Record<string, VaultTokenState> {
  try {
    if (fs.existsSync(VAULT_STORE_FILE)) {
      const raw = fs.readFileSync(VAULT_STORE_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read vault store:', e);
  }
  return {};
}

function writeVaultStore(store: Record<string, VaultTokenState>): void {
  try {
    fs.writeFileSync(VAULT_STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write vault store:', e);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security & CORS Headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Support up to 150MB JSON body for base64 file uploads (allows large files)
  app.use(express.json({ limit: '150mb' }));
  app.use(express.urlencoded({ extended: true, limit: '150mb' }));

  // JSON Error handler to return clean JSON when file exceeds limit or JSON is malformed
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err) {
      if (err.type === 'entity.too.large' || err.status === 413) {
        res.status(413).json({
          ok: false,
          error: 'حجم الملف المرفوع كبير جداً ويتجاوز سعة خادم التشفير. يرجى اختيار ملف بحجم مناسب (أقل من 75 ميجابايت).',
        });
        return;
      }
      if (err instanceof SyntaxError && 'body' in err) {
        res.status(400).json({
          ok: false,
          error: 'بيانات الطلب غير صالحة.',
        });
        return;
      }
    }
    next(err);
  });

  // ==========================================================================
  // NEW SERVICE: 🔐 FILE PROTECTOR API (/api/protector/*)
  // AES-256-GCM + Argon2id + Atomic Open Limit + Secure Viewer + Dashboard
  // ==========================================================================

  // 1. Encrypt & Register a Protected File
  app.post('/api/protector/encrypt', async (req, res) => {
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    if (!checkRateLimit(clientIp, 40)) {
      res.status(429).json({
        error: 'تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار دقيقة واحدة والمحاولة مجدداً.',
      });
      return;
    }

    try {
      const {
        fileName,
        mimeType,
        fileSize,
        fileBase64,
        password,
        confirmPassword,
        maxOpens, // number | null (null = unlimited)
        expirationMs, // duration in ms | null (null = never expires)
        expirationLabel,
        ownerId,
        clientOrigin,
      } = req.body || {};

      if (!fileName || typeof fileName !== 'string' || !fileBase64 || typeof fileBase64 !== 'string') {
        res.status(400).json({ error: 'الرجاء اختيار ملف صالح للتشفير.' });
        return;
      }

      // Sanitize filename & validate extension
      const cleanName = path.basename(fileName).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
      const ext = path.extname(cleanName).toLowerCase();
      let formatSpec = SUPPORTED_PROTECTED_FORMATS[ext];

      if (!formatSpec) {
        formatSpec = {
          extension: ext || '.bin',
          category: 'other',
          labelAr: 'ملف محمي',
          labelEn: 'Protected File',
          mimeTypes: [mimeType || 'application/octet-stream'],
          maxSizeBytes: 75 * 1024 * 1024,
        };
      }

      if (!password || typeof password !== 'string' || password.length < 4) {
        res.status(400).json({ error: 'يجب أن تتكون كلمة المرور من 4 أحرف أو أرقام على الأقل.' });
        return;
      }

      if (confirmPassword !== undefined && password !== confirmPassword) {
        res.status(400).json({ error: 'كلمة المرور وتأكيد كلمة المرور غير متطابقين.' });
        return;
      }

      const rawBuffer = Buffer.from(fileBase64, 'base64');
      if (rawBuffer.byteLength === 0) {
        res.status(400).json({ error: 'الملف المرفوع فارغ.' });
        return;
      }

      if (rawBuffer.byteLength > formatSpec.maxSizeBytes) {
        res.status(413).json({
          error: `حجم الملف يتجاوز الحد الأقصى المسموح به (${Math.round(formatSpec.maxSizeBytes / (1024 * 1024))} ميجابايت).`,
        });
        return;
      }

      // Generate cryptographically secure IDs and salts
      const fileId = crypto.randomUUID();
      const argonSalt = crypto.randomBytes(16);
      const fileIv = crypto.randomBytes(12); // 96-bit IV recommended for AES-256-GCM
      const dek = crypto.randomBytes(32); // 256-bit Data Encryption Key
      const dekIv = crypto.randomBytes(12);

      // 1) Derive Argon2id password verification hash + user key material
      const { passwordVerificationHash, userKeyMaterial } = deriveArgon2idMaterial(password, argonSalt);

      // 2) Wrap the per-file DEK using AES-256-GCM with Envelope KEK (Server Master Key + Argon2id user key)
      const envelopeKek = computeEnvelopeKek(userKeyMaterial, fileId);
      const dekCipher = crypto.createCipheriv('aes-256-gcm', envelopeKek, dekIv);
      const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
      const dekAuthTag = dekCipher.getAuthTag();

      // 3) Encrypt the actual file payload with AES-256-GCM
      const fileCipher = crypto.createCipheriv('aes-256-gcm', dek, fileIv);
      fileCipher.setAAD(Buffer.from(fileId, 'utf-8'));
      const encryptedFileBuffer = Buffer.concat([fileCipher.update(rawBuffer), fileCipher.final()]);
      const fileAuthTag = fileCipher.getAuthTag();

      // Zero out sensitive keys in memory
      dek.fill(0);
      userKeyMaterial.fill(0);

      // Save encrypted binary to isolated storage (.secure_storage/<fileId>.enc)
      const encryptedFilePath = getEncryptedFilePath(fileId);
      fs.writeFileSync(encryptedFilePath, encryptedFileBuffer, { mode: 0o600 });

      const now = Date.now();
      const parsedMaxOpens =
        maxOpens === null || maxOpens === 'unlimited' || Number(maxOpens) <= 0
          ? null
          : Math.max(1, Math.min(10000, Math.floor(Number(maxOpens))));

      const parsedExpiresAt =
        expirationMs === null || expirationMs === 'never' || Number(expirationMs) <= 0
          ? null
          : now + Math.max(60_000, Number(expirationMs));

      const secureFileName = `${cleanName}.secure`;
      const interactiveFileName = `${cleanName}.protected.html`;

      // Compute HMAC integrity signature over the metadata so `.secure` files cannot be tampered with
      const containerHmacHex = crypto
        .createHmac('sha256', SERVER_MASTER_KEY)
        .update(`${fileId}:${cleanName}:${ext}:${parsedMaxOpens ?? 'inf'}:${parsedExpiresAt ?? 'inf'}`)
        .digest('hex');

      const record: ProtectedFileRecord = {
        fileId,
        ownerId: String(ownerId || 'anonymous'),
        originalName: cleanName,
        secureFileName,
        extension: ext,
        category: formatSpec.category,
        mimeType: String(mimeType || formatSpec.mimeTypes[0]),
        fileSize: Number(fileSize || rawBuffer.byteLength),
        createdAt: now,
        expiresAt: parsedExpiresAt,
        expirationLabel: String(expirationLabel || (parsedExpiresAt ? 'محدد' : 'بدون انتهاء')),
        maxOpens: parsedMaxOpens,
        usedOpens: 0,
        remainingOpens: parsedMaxOpens,
        status: 'active',
        lastOpenedAt: null,
        passwordHash: passwordVerificationHash.toString('hex'),
        cryptoMeta: {
          algorithm: 'AES-256-GCM',
          kdf: 'Argon2id',
          argonSaltHex: argonSalt.toString('hex'),
          argonTimeCost: ARGON_TIME_COST,
          argonMemCostKiB: ARGON_MEM_KIB,
          argonParallelism: ARGON_PARALLELISM,
          fileIvHex: fileIv.toString('hex'),
          fileAuthTagHex: fileAuthTag.toString('hex'),
          wrappedDekHex: wrappedDek.toString('hex'),
          dekIvHex: dekIv.toString('hex'),
          dekAuthTagHex: dekAuthTag.toString('hex'),
          containerHmacHex,
        },
        openLogs: [],
      };

      // Build viewer representation and encrypt both the viewer representation & raw file with WebCrypto-compatible AES-256-GCM
      // so the downloaded `.protected.html` file can verify the password and decrypt 100% locally on double-click even if offline!
      const viewerRepresentation = await buildSecureViewerPayload(rawBuffer, record);
      const webCryptoSalt = crypto.randomBytes(16);
      const webCryptoIv = crypto.randomBytes(12);
      const webCryptoKey = crypto.pbkdf2Sync(password, webCryptoSalt, 100000, 32, 'sha256');

      const webFileCipher = crypto.createCipheriv('aes-256-gcm', webCryptoKey, webCryptoIv);
      const webCiphertextWithTag = Buffer.concat([
        webFileCipher.update(rawBuffer),
        webFileCipher.final(),
        webFileCipher.getAuthTag(),
      ]);

      const viewerJsonBuffer = Buffer.from(JSON.stringify(viewerRepresentation), 'utf-8');
      const webViewerCipher = crypto.createCipheriv('aes-256-gcm', webCryptoKey, webCryptoIv);
      const webViewerCiphertextWithTag = Buffer.concat([
        webViewerCipher.update(viewerJsonBuffer),
        webViewerCipher.final(),
        webViewerCipher.getAuthTag(),
      ]);
      webCryptoKey.fill(0);

      record.cryptoMeta.webCryptoSaltHex = webCryptoSalt.toString('hex');
      record.cryptoMeta.webCryptoIvHex = webCryptoIv.toString('hex');
      record.cryptoMeta.webViewerCiphertextBase64 = webViewerCiphertextWithTag.toString('base64');
      record.cryptoMeta.webFileCiphertextBase64 = webCiphertextWithTag.toString('base64');

      await withAtomicProtectorLock(async () => {
        const db = readProtectorDb();
        db[fileId] = record;
        writeProtectorDb(db);
      });

      const hostHeader = req.headers.host || 'localhost:3000';
      const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const serverOrigin =
        typeof clientOrigin === 'string' && clientOrigin.startsWith('http')
          ? clientOrigin
          : `${protoHeader}://${hostHeader}`;

      // Build the downloadable `.secure` container file
      const secureContainerObject = {
        magic: 'TOOLNOVA-SECURE-FILE-V1',
        version: '1.0',
        fileId: record.fileId,
        originalName: record.originalName,
        extension: record.extension,
        category: record.category,
        mimeType: record.mimeType,
        fileSize: record.fileSize,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        expirationLabel: record.expirationLabel,
        maxOpens: record.maxOpens,
        serverOrigin,
        clientOrigin: typeof clientOrigin === 'string' ? clientOrigin : serverOrigin,
        encryption: {
          cipher: 'AES-256-GCM',
          kdf: 'Argon2id (m=16384, t=2, p=1)',
          ivHex: record.cryptoMeta.fileIvHex,
          authTagHex: record.cryptoMeta.fileAuthTagHex,
          signature: record.cryptoMeta.containerHmacHex,
          webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
          webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
        },
        ciphertextBase64: encryptedFileBuffer.toString('base64'),
        webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
        webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
      };

      const secureFileBase64 = Buffer.from(
        JSON.stringify(secureContainerObject, null, 2),
        'utf-8'
      ).toString('base64');

      // Build self-contained interactive `.protected.html` file that opens directly when double-clicked on PC/Mobile!
      const interactiveHtmlContent = buildInteractiveProtectedHtmlLauncher(secureContainerObject);
      const interactiveHtmlBase64 = Buffer.from(interactiveHtmlContent, 'utf-8').toString('base64');

      res.json({
        ok: true,
        file: {
          fileId: record.fileId,
          originalName: record.originalName,
          secureFileName: record.secureFileName,
          interactiveFileName,
          extension: record.extension,
          category: record.category,
          fileSize: record.fileSize,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          expirationLabel: record.expirationLabel,
          maxOpens: record.maxOpens,
          usedOpens: record.usedOpens,
          remainingOpens: record.remainingOpens,
          status: record.status,
          algorithm: 'AES-256-GCM',
          kdf: 'Argon2id',
        },
        secureFileBase64,
        interactiveHtmlBase64,
        interactiveFileName,
      });
    } catch (err) {
      console.error('Encryption error:', err);
      res.status(500).json({ error: 'حدث خطأ أثناء تشفير الملف. يرجى المحاولة مرة أخرى.' });
    }
  });

  // 2. Inspect a `.secure` file or File ID before entering password (returns public metadata only)
  app.post('/api/protector/inspect', async (req, res) => {
    const { fileId } = req.body || {};
    const safeId = sanitizeFileId(fileId);
    if (!safeId) {
      res.status(400).json({ error: 'ملف الحماية (.secure) غير صالح أو تالف.' });
      return;
    }

    const db = readProtectorDb();
    const record = db[safeId];
    if (!record || record.status === 'deleted') {
      res.status(404).json({
        exists: false,
        status: 'deleted',
        error: 'هذا الملف لم يعد موجوداً أو تم حذفه من قبل المالك.',
      });
      return;
    }

    const dynamicStatus = computeDynamicStatus(record);
    if (dynamicStatus !== record.status) {
      record.status = dynamicStatus;
      db[safeId] = record;
      writeProtectorDb(db);
    }

    res.json({
      exists: true,
      file: {
        fileId: record.fileId,
        originalName: record.originalName,
        secureFileName: record.secureFileName,
        extension: record.extension,
        category: record.category,
        fileSize: record.fileSize,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        expirationLabel: record.expirationLabel,
        maxOpens: record.maxOpens,
        usedOpens: record.usedOpens,
        remainingOpens:
          record.maxOpens === null ? null : Math.max(0, record.maxOpens - record.usedOpens),
        status: dynamicStatus,
        lastOpenedAt: record.lastOpenedAt,
      },
    });
  });

  // 3. Atomic Open & Decrypt Protected File into Secure Viewer
  app.post('/api/protector/open', async (req, res) => {
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    if (!checkRateLimit(clientIp, 30)) {
      res.status(429).json({
        allowed: false,
        code: 'RATE_LIMITED',
        error: 'تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار قليلاً.',
      });
      return;
    }

    const { fileId, password, ciphertextBase64 } = req.body || {};
    const safeId = sanitizeFileId(fileId);
    if (!safeId) {
      res.status(400).json({
        allowed: false,
        code: 'INVALID_FILE',
        error: 'معرف الملف المحمي غير صالح.',
      });
      return;
    }

    const bruteKey = `${clientIp}:${safeId}`;
    const lockCheck = checkBruteForceLock(bruteKey);
    if (lockCheck.blocked) {
      res.status(429).json({
        allowed: false,
        code: 'BRUTE_FORCE_LOCKED',
        error: `تم قفل المحاولات مؤقتاً بسبب إدخال كلمة مرور خاطئة عدة مرات. يرجى المحاولة بعد ${lockCheck.retryAfterSec} ثانية.`,
      });
      return;
    }

    // Execute all checks and slot consumption inside the Atomic Mutex Lock!
    const atomicResult = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];

      if (!record || record.status === 'deleted') {
        return {
          httpStatus: 404,
          body: {
            allowed: false,
            code: 'DELETED',
            status: 'deleted',
            error: 'انتهت صلاحية فتح هذا الملف (تم حذف الملف من قبل المالك).',
          },
        };
      }

      if (record.status === 'revoked') {
        return {
          httpStatus: 403,
          body: {
            allowed: false,
            code: 'REVOKED',
            status: 'revoked',
            error: 'لقد تم إلغاء صلاحية الوصول إلى هذا الملف من قبل المالك.',
          },
        };
      }

      const now = Date.now();
      if (record.expiresAt !== null && now > record.expiresAt) {
        record.status = 'expired';
        db[safeId] = record;
        writeProtectorDb(db);
        return {
          httpStatus: 410,
          body: {
            allowed: false,
            code: 'EXPIRED_TIME',
            status: 'expired',
            error: 'لقد انتهت صلاحية الوصول إلى هذا الملف (انتهت المدة الزمنية المحددة).',
          },
        };
      }

      // Check open limit BEFORE or EVEN IF password is correct
      if (record.maxOpens !== null && record.usedOpens >= record.maxOpens) {
        record.status = 'exhausted';
        record.remainingOpens = 0;
        db[safeId] = record;
        writeProtectorDb(db);
        return {
          httpStatus: 403,
          body: {
            allowed: false,
            code: 'OPEN_LIMIT_REACHED',
            status: 'exhausted',
            error: 'انتهت صلاحية فتح هذا الملف.',
            detail: `تم استنفاد جميع مرات الفتح المسموحة (${record.usedOpens} من ${record.maxOpens}). لا يمكن فتح الملف مجدداً حتى لو كانت كلمة المرور صحيحة.`,
          },
        };
      }

      if (!password || typeof password !== 'string') {
        return {
          httpStatus: 401,
          body: {
            allowed: false,
            code: 'WRONG_PASSWORD',
            error: 'الرجاء إدخال كلمة المرور لفتح الملف.',
          },
        };
      }

      // Verify password using Argon2id + timingSafeEqual
      const argonSalt = Buffer.from(record.cryptoMeta.argonSaltHex, 'hex');
      const { passwordVerificationHash, userKeyMaterial } = deriveArgon2idMaterial(
        password,
        argonSalt
      );
      const storedHashBuf = Buffer.from(record.passwordHash, 'hex');

      const isPasswordValid =
        storedHashBuf.length === passwordVerificationHash.length &&
        crypto.timingSafeEqual(storedHashBuf, passwordVerificationHash);

      if (!isPasswordValid) {
        userKeyMaterial.fill(0);
        const failInfo = recordFailedPasswordAttempt(bruteKey);
        return {
          httpStatus: 401,
          body: {
            allowed: false,
            code: 'WRONG_PASSWORD',
            error: failInfo.locked
              ? 'كلمة المرور غير صحيحة! تم قفل المحاولات لمدة دقيقتين لحماية الملف من التخمين (Brute Force).'
              : `كلمة المرور غير صحيحة! يرجى التأكد والمحاولة مجدداً (المحاولات المتبقية: ${failInfo.remainingAttempts}).`,
          },
        };
      }

      clearFailedPasswordAttempts(bruteKey);

      // Decrypt DEK using Envelope KEK
      let decryptedFileBuffer: Buffer;
      try {
        const envelopeKek = computeEnvelopeKek(userKeyMaterial, record.fileId);
        userKeyMaterial.fill(0);

        const dekDecipher = crypto.createDecipheriv(
          'aes-256-gcm',
          envelopeKek,
          Buffer.from(record.cryptoMeta.dekIvHex, 'hex')
        );
        dekDecipher.setAuthTag(Buffer.from(record.cryptoMeta.dekAuthTagHex, 'hex'));
        const dek = Buffer.concat([
          dekDecipher.update(Buffer.from(record.cryptoMeta.wrappedDekHex, 'hex')),
          dekDecipher.final(),
        ]);

        // Load encrypted file bytes from isolated server storage or from the uploaded .secure container
        const encPath = getEncryptedFilePath(record.fileId);
        let ciphertextBuf: Buffer;
        if (fs.existsSync(encPath)) {
          ciphertextBuf = fs.readFileSync(encPath);
        } else if (typeof ciphertextBase64 === 'string' && ciphertextBase64.length > 0) {
          ciphertextBuf = Buffer.from(ciphertextBase64, 'base64');
        } else {
          dek.fill(0);
          return {
            httpStatus: 404,
            body: {
              allowed: false,
              code: 'STORAGE_MISSING',
              error: 'البيانات المشفرة لهذا الملف غير متوفرة.',
            },
          };
        }

        // Decrypt the actual file using AES-256-GCM and verify GCM authentication tag
        const fileDecipher = crypto.createDecipheriv(
          'aes-256-gcm',
          dek,
          Buffer.from(record.cryptoMeta.fileIvHex, 'hex')
        );
        fileDecipher.setAAD(Buffer.from(record.fileId, 'utf-8'));
        fileDecipher.setAuthTag(Buffer.from(record.cryptoMeta.fileAuthTagHex, 'hex'));
        decryptedFileBuffer = Buffer.concat([
          fileDecipher.update(ciphertextBuf),
          fileDecipher.final(),
        ]);
        dek.fill(0);
      } catch (cryptoErr) {
        console.error('AES-256-GCM Decryption / AuthTag verification failed:', cryptoErr);
        return {
          httpStatus: 400,
          body: {
            allowed: false,
            code: 'TAMPERED_OR_CORRUPT',
            error: 'فشل التحقق من سلامة التشفير (AES-256-GCM Auth Tag). قد يكون الملف تالفاً أو تم التلاعب به.',
          },
        };
      }

      // ATOMICALLY CONSUME 1 OPEN SLOT BEFORE RETURNING!
      record.usedOpens += 1;
      record.lastOpenedAt = now;
      if (record.maxOpens !== null) {
        record.remainingOpens = Math.max(0, record.maxOpens - record.usedOpens);
        if (record.remainingOpens === 0) {
          record.status = 'exhausted';
        }
      }

      record.openLogs.unshift({
        attemptId: crypto.randomUUID(),
        openedAt: now,
        openNumber: record.usedOpens,
        clientSummary: `Open #${record.usedOpens}`,
      });
      record.openLogs = record.openLogs.slice(0, 50);

      db[safeId] = record;
      writeProtectorDb(db);

      try {
        const viewerPayload = await buildSecureViewerPayload(decryptedFileBuffer, record);
        return {
          httpStatus: 200,
          body: {
            allowed: true,
            message:
              record.remainingOpens === 0
                ? 'تم التحقق من كلمة المرور وفتح الملف بنجاح. (تنبيه: تم استهلاك الفتحة الوحيدة/الأخيرة — الفتحات المتبقية الآن: 0)'
                : 'تم التحقق من كلمة المرور وفك تشفير الملف بنجاح داخل العارض الآمن.',
            file: {
              fileId: record.fileId,
              originalName: record.originalName,
              extension: record.extension,
              category: record.category,
              fileSize: record.fileSize,
              createdAt: record.createdAt,
              expiresAt: record.expiresAt,
              expirationLabel: record.expirationLabel,
              maxOpens: record.maxOpens,
              usedOpens: record.usedOpens,
              remainingOpens: record.remainingOpens,
              status: record.status,
              lastOpenedAt: record.lastOpenedAt,
            },
            viewer: viewerPayload,
          },
        };
      } finally {
        // Securely wipe plaintext buffer from server RAM immediately after constructing viewer payload
        decryptedFileBuffer.fill(0);
      }
    });

    res.status(atomicResult.httpStatus).json(atomicResult.body);
  });

  // 4. Dashboard: List all protected files (with live status evaluation)
  app.get('/api/protector/dashboard', (_req, res) => {
    const db = readProtectorDb();
    let updated = false;
    const now = Date.now();

    const files = Object.values(db)
      .filter((r) => r.status !== 'deleted')
      .map((r) => {
        const currentStatus = computeDynamicStatus(r, now);
        if (currentStatus !== r.status) {
          r.status = currentStatus;
          updated = true;
        }
        const remaining =
          r.maxOpens === null ? null : Math.max(0, r.maxOpens - r.usedOpens);
        return {
          fileId: r.fileId,
          ownerId: r.ownerId,
          originalName: r.originalName,
          secureFileName: r.secureFileName,
          extension: r.extension,
          category: r.category,
          fileSize: r.fileSize,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
          expirationLabel: r.expirationLabel,
          maxOpens: r.maxOpens,
          usedOpens: r.usedOpens,
          remainingOpens: remaining,
          status: r.status,
          lastOpenedAt: r.lastOpenedAt,
          openLogs: r.openLogs || [],
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    if (updated) {
      writeProtectorDb(db);
    }

    res.json({ ok: true, files });
  });

  // 5. Dashboard: Download `.secure` or interactive `.protected.html` container file for any active/protected record
  app.get('/api/protector/download-secure/:fileId', (req, res) => {
    const safeId = sanitizeFileId(req.params.fileId);
    if (!safeId) {
      res.status(400).json({ error: 'Invalid file ID' });
      return;
    }

    const db = readProtectorDb();
    const record = db[safeId];
    if (!record || record.status === 'deleted') {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }

    const encPath = getEncryptedFilePath(record.fileId);
    const encryptedBytes = fs.existsSync(encPath) ? fs.readFileSync(encPath) : Buffer.alloc(0);

    const hostHeader = req.headers.host || 'localhost:3000';
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;

    const secureContainerObject = {
      magic: 'TOOLNOVA-SECURE-FILE-V1',
      version: '1.0',
      fileId: record.fileId,
      originalName: record.originalName,
      extension: record.extension,
      category: record.category,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      expirationLabel: record.expirationLabel,
      maxOpens: record.maxOpens,
      serverOrigin,
      encryption: {
        cipher: 'AES-256-GCM',
        kdf: 'Argon2id (m=16384, t=2, p=1)',
        ivHex: record.cryptoMeta.fileIvHex,
        authTagHex: record.cryptoMeta.fileAuthTagHex,
        signature: record.cryptoMeta.containerHmacHex,
        webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
        webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
      },
      ciphertextBase64: encryptedBytes.toString('base64'),
      webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
      webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
    };

    const interactiveFileName = `${record.originalName}.protected.html`;
    const interactiveHtmlContent = buildInteractiveProtectedHtmlLauncher(secureContainerObject);

    res.json({
      ok: true,
      secureFileName: record.secureFileName,
      interactiveFileName,
      secureFileBase64: Buffer.from(
        JSON.stringify(secureContainerObject, null, 2),
        'utf-8'
      ).toString('base64'),
      interactiveHtmlBase64: Buffer.from(interactiveHtmlContent, 'utf-8').toString('base64'),
    });
  });

  // Direct binary/HTML streaming download (avoids high-memory base64 allocations on clients)
  app.get('/api/protector/download/:fileId', (req, res) => {
    const safeId = sanitizeFileId(req.params.fileId);
    if (!safeId) {
      res.status(400).send('Invalid file ID');
      return;
    }

    const db = readProtectorDb();
    const record = db[safeId];
    if (!record || record.status === 'deleted') {
      res.status(404).send('File not found');
      return;
    }

    const hostHeader = req.headers.host || 'localhost:3000';
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;

    const encPath = getEncryptedFilePath(record.fileId);
    const encryptedBytes = fs.existsSync(encPath) ? fs.readFileSync(encPath) : Buffer.alloc(0);

    const secureContainerObject = {
      magic: 'TOOLNOVA-SECURE-FILE-V1',
      version: '1.0',
      fileId: record.fileId,
      originalName: record.originalName,
      extension: record.extension,
      category: record.category,
      mimeType: record.mimeType,
      fileSize: record.fileSize,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      expirationLabel: record.expirationLabel,
      maxOpens: record.maxOpens,
      serverOrigin,
      encryption: {
        cipher: 'AES-256-GCM',
        kdf: 'Argon2id (m=16384, t=2, p=1)',
        ivHex: record.cryptoMeta.fileIvHex,
        authTagHex: record.cryptoMeta.fileAuthTagHex,
        signature: record.cryptoMeta.containerHmacHex,
        webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
        webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
      },
      ciphertextBase64: encryptedBytes.toString('base64'),
      webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
      webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
    };

    const format = req.query.format === 'secure' ? 'secure' : 'interactive';
    if (format === 'secure') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(record.secureFileName)}"`
      );
      res.send(JSON.stringify(secureContainerObject, null, 2));
    } else {
      const htmlContent = buildInteractiveProtectedHtmlLauncher(secureContainerObject);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(record.originalName)}.protected.html"`
      );
      res.send(htmlContent);
    }
  });

  // 6. Dashboard: Revoke a protected file (إلغاء صلاحية الملف فوراً)
  app.post('/api/protector/revoke', async (req, res) => {
    const safeId = sanitizeFileId(req.body?.fileId);
    if (!safeId) {
      res.status(400).json({ error: 'معرف الملف غير صالح.' });
      return;
    }

    const result = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];
      if (!record || record.status === 'deleted') {
        return null;
      }
      record.status = 'revoked';
      record.remainingOpens = 0;
      db[safeId] = record;
      writeProtectorDb(db);
      return record;
    });

    if (!result) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }

    res.json({ ok: true, status: 'revoked' });
  });

  // 7. Dashboard: Recreate / Reactivate a protected file (إعادة إنشاء ملف محمي وتصفير العداد)
  app.post('/api/protector/recreate', async (req, res) => {
    const { fileId, maxOpens, expirationMs, expirationLabel } = req.body || {};
    const safeId = sanitizeFileId(fileId);
    if (!safeId) {
      res.status(400).json({ error: 'معرف الملف غير صالح.' });
      return;
    }

    const result = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];
      if (!record || record.status === 'deleted') {
        return null;
      }

      const now = Date.now();
      const nextMaxOpens =
        maxOpens !== undefined
          ? maxOpens === null || maxOpens === 'unlimited' || Number(maxOpens) <= 0
            ? null
            : Math.max(1, Math.min(10000, Math.floor(Number(maxOpens))))
          : record.maxOpens;

      record.usedOpens = 0;
      record.maxOpens = nextMaxOpens;
      record.remainingOpens = nextMaxOpens;
      record.status = 'active';

      if (expirationMs !== undefined) {
        record.expiresAt =
          expirationMs === null || expirationMs === 'never' || Number(expirationMs) <= 0
            ? null
            : now + Math.max(60_000, Number(expirationMs));
      } else if (record.expiresAt !== null && record.expiresAt <= now) {
        // Default extend by 24 hours if previously expired
        record.expiresAt = now + 24 * 60 * 60 * 1000;
        record.expirationLabel = '24 ساعة';
      }

      if (expirationLabel) {
        record.expirationLabel = String(expirationLabel);
      }

      db[safeId] = record;
      writeProtectorDb(db);
      return record;
    });

    if (!result) {
      res.status(404).json({ error: 'الملف غير موجود.' });
      return;
    }

    res.json({ ok: true, file: result });
  });

  // 8. Dashboard: Permanently Delete a protected file and wipe its encrypted storage
  app.delete('/api/protector/:fileId', async (req, res) => {
    const safeId = sanitizeFileId(req.params.fileId);
    if (!safeId) {
      res.status(400).json({ error: 'معرف الملف غير صالح.' });
      return;
    }

    await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      if (db[safeId]) {
        delete db[safeId];
        writeProtectorDb(db);
      }
      try {
        const encPath = getEncryptedFilePath(safeId);
        if (fs.existsSync(encPath)) {
          // Overwrite with zeros before unlinking for secure file deletion
          const stat = fs.statSync(encPath);
          if (stat.size > 0 && stat.size < 60 * 1024 * 1024) {
            fs.writeFileSync(encPath, Buffer.alloc(stat.size, 0));
          }
          fs.unlinkSync(encPath);
        }
      } catch (e) {
        console.error('Error wiping encrypted file:', e);
      }
    });

    res.json({ ok: true });
  });

  // ==========================================================================
  // EXISTING VAULT ROUTES (Preserved for existing Office tools)
  // ==========================================================================
  app.post('/api/vault/register', (req, res) => {
    const {
      tokenId,
      fileName,
      docType,
      passwordHash,
      password,
      maxAllowedUsers,
      lockEditingMode,
      expirationTimestamp,
      preserveExistingCount,
      resetQuota,
    } = req.body || {};

    if (!tokenId || typeof tokenId !== 'string') {
      res.status(400).json({ error: 'Invalid tokenId' });
      return;
    }

    const store = readVaultStore();
    const existing = store[tokenId];
    const safeMax = Math.max(1, Math.min(500, Number(maxAllowedUsers) || 1));
    const computedHash =
      typeof passwordHash === 'string' && passwordHash.length >= 4
        ? passwordHash
        : computeSimpleHash(String(password || '2026').trim());

    const nextUsedCount =
      resetQuota === true
        ? 0
        : preserveExistingCount && existing
        ? Math.min(safeMax, existing.usedCount)
        : 0;

    const record: VaultTokenState = {
      tokenId,
      fileName: String(fileName || 'Protected_Document.docx').slice(0, 180),
      docType:
        docType === 'excel' || docType === 'powerpoint' ? docType : 'word',
      passwordHash: computedHash,
      maxAllowedUsers: safeMax,
      usedCount: nextUsedCount,
      lockEditingMode:
        lockEditingMode === 'read-only-watermark' ||
        lockEditingMode === 'form-comments-only'
          ? lockEditingMode
          : 'full-lock',
      expirationTimestamp:
        typeof expirationTimestamp === 'number' && expirationTimestamp > 0
          ? expirationTimestamp
          : null,
      accessLog:
        resetQuota === true
          ? []
          : preserveExistingCount && existing
          ? existing.accessLog
          : [],
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    store[tokenId] = record;
    writeVaultStore(store);

    res.json({ ok: true, state: record });
  });

  app.get('/api/vault/status/:tokenId', (req, res) => {
    const tokenId = String(req.params.tokenId || '');
    const store = readVaultStore();
    const item = store[tokenId];
    if (!item) {
      res.json({ exists: false, state: null });
      return;
    }
    res.json({
      exists: true,
      state: {
        tokenId: item.tokenId,
        fileName: item.fileName,
        docType: item.docType,
        maxAllowedUsers: item.maxAllowedUsers,
        usedCount: item.usedCount,
        lockEditingMode: item.lockEditingMode,
        expirationTimestamp: item.expirationTimestamp,
        accessLog: item.accessLog,
      },
    });
  });

  app.post('/api/vault/unlock', (req, res) => {
    const {
      tokenId,
      enteredPassword,
      visitorLabel,
      fallbackMaxUsers,
      fallbackPasswordHash,
      fallbackFileName,
      fallbackDocType,
    } = req.body || {};

    if (!tokenId || typeof tokenId !== 'string') {
      res.status(400).json({ allowed: false, reason: 'رمز حماية الملف غير صالح.' });
      return;
    }

    const store = readVaultStore();
    let item = store[tokenId];

    if (!item && fallbackPasswordHash) {
      item = {
        tokenId,
        fileName: String(fallbackFileName || 'Protected_Document.docx'),
        docType:
          fallbackDocType === 'excel' || fallbackDocType === 'powerpoint'
            ? fallbackDocType
            : 'word',
        passwordHash: String(fallbackPasswordHash),
        maxAllowedUsers: Math.max(1, Math.min(500, Number(fallbackMaxUsers) || 1)),
        usedCount: 0,
        lockEditingMode: 'full-lock',
        expirationTimestamp: null,
        accessLog: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      store[tokenId] = item;
    }

    if (!item) {
      res.json({
        allowed: false,
        reason: 'رمز حماية الملف غير موجود في السجل.',
        state: null,
      });
      return;
    }

    if (item.expirationTimestamp && Date.now() > item.expirationTimestamp) {
      res.json({
        allowed: false,
        reason: '⛔ انتهت صلاحية الدخول الزمنية المحددة لهذا الملف.',
        state: item,
      });
      return;
    }

    const enteredHash = computeSimpleHash(String(enteredPassword || '').trim());
    if (enteredHash !== item.passwordHash) {
      res.json({
        allowed: false,
        reason: '❌ كلمة السر غير صحيحة! لا يمكن فك تشفير أو فتح المستند المحمي.',
        state: item,
      });
      return;
    }

    if (item.usedCount >= item.maxAllowedUsers) {
      res.json({
        allowed: false,
        reason: `⛔ تم رفض الدخول نهائياً! تم بلوغ الحد الأقصى لعدد الأشخاص المسموح لهم (${item.usedCount}/${item.maxAllowedUsers}) الذي حدده مالك الملف مسبقاً. لا يمكن لأي شخص إضافي فتح الملف حتى لو كان يعرف كلمة السر.`,
        state: item,
      });
      return;
    }

    item.usedCount += 1;
    item.updatedAt = Date.now();
    item.accessLog.push({
      slotIndex: item.usedCount,
      deviceFingerprint: `${String(visitorLabel || 'المستلم').slice(0, 40)} #${item.usedCount}`,
      accessedAt: new Date().toLocaleTimeString(),
      status: 'GRANTED',
    });

    store[tokenId] = item;
    writeVaultStore(store);

    res.json({
      allowed: true,
      reason: `✅ كلمة السر صحيحة! تم السماح بالدخول وفتح الملف (الشخص ${item.usedCount} من أصل ${item.maxAllowedUsers}).${
        item.usedCount >= item.maxAllowedUsers
          ? ' 🔒 اكتمل العدد المسموح به الآن — أي شخص آخر يحاول فتح الملف بعدك سيتم حظره تلقائياً حتى لو أدخل كلمة السر!'
          : ''
      }`,
      state: item,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ToolNova Server running on http://localhost:${PORT}`);
  });
}

startServer();
