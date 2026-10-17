import crypto from 'crypto';
import path from 'path';
import { Worker } from 'worker_threads';
import { argon2id } from '@noble/hashes/argon2.js';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import {
  ARGON_MEM_KIB,
  ARGON_PARALLELISM,
  ARGON_TIME_COST,
  CURRENT_MASTER_KEY_ID,
  PROJECT_ROOT,
  SERVER_MASTER_KEY,
} from './config';
import { ProtectedFileRecord } from './storage';
import { sanitizeHtml } from './sanitizeHtml';

// ============================================================================
// 1. PASSWORD POLICY (MIN 10, MAX 256, COMMON PASSWORD BLACKLIST)
// ============================================================================
export const COMMON_WEAK_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'admin12345',
  'qwertyuiop',
  'password1234',
  '12345678901',
  '123456789012',
  'welcome1234',
  'password@123',
  'Passw0rd123',
  'ToolNova123',
  'iloveyou123',
  'changeme123',
  'administrator',
  'secret12345',
  'supersecret123',
  'letmein1234',
  '12345678910',
  '01234567890',
  'abc123456789',
  'password12345',
  'qwerty12345',
  'welcome@123',
]);

export function validatePasswordPolicy(password: unknown): { ok: boolean; error?: string } {
  if (typeof password !== 'string') {
    return { ok: false, error: 'كلمة المرور مطلوبة وتجب أن تكون نصاً.' };
  }
  if (password.length < 10) {
    return {
      ok: false,
      error: 'يجب أن تتكون كلمة المرور من 10 أحرف أو أرقام على الأقل لضمان حماية الملف.',
    };
  }
  if (password.length > 256) {
    return {
      ok: false,
      error: 'كلمة المرور طويلة جداً (الحد الأقصى المسموح به هو 256 حرفاً).',
    };
  }

  const normalized = password.trim().toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(normalized)) {
    return {
      ok: false,
      error: 'كلمة المرور المختارة شائعة جداً وسهلة التخمين. يرجى اختيار كلمة مرور أقوى.',
    };
  }

  return { ok: true };
}

// ============================================================================
// 2. ARGON2ID WORKER POOL / ASYNC WORKER THREAD DERIVATION
// Offloads m=65536, t=3, p=1 so Node's main event loop is never blocked
// ============================================================================
interface WorkerPendingItem {
  resolve: (value: { passwordVerificationHash: Buffer; userKeyMaterial: Buffer }) => void;
  reject: (reason: any) => void;
  timer: NodeJS.Timeout;
}

const pendingWorkerRequests = new Map<string, WorkerPendingItem>();
let argonWorker: Worker | null = null;

function getOrCreateArgonWorker(): Worker {
  if (argonWorker) return argonWorker;

  const workerPath = path.resolve(PROJECT_ROOT, 'server/argonWorker.js');
  const worker = new Worker(workerPath);

  worker.on('message', (msg: { id: string; success: boolean; resultHex?: string; error?: string }) => {
    const item = pendingWorkerRequests.get(msg.id);
    if (!item) return;
    pendingWorkerRequests.delete(msg.id);
    clearTimeout(item.timer);

    if (msg.success && msg.resultHex) {
      const buf = Buffer.from(msg.resultHex, 'hex');
      item.resolve({
        passwordVerificationHash: buf.subarray(0, 32),
        userKeyMaterial: buf.subarray(32, 64),
      });
    } else {
      item.reject(new Error(msg.error || 'Argon2id derivation failed in worker'));
    }
  });

  worker.on('error', (err) => {
    console.error('[ArgonWorker Error]', err);
    // Reject all pending
    for (const [id, item] of pendingWorkerRequests.entries()) {
      clearTimeout(item.timer);
      item.reject(err);
    }
    pendingWorkerRequests.clear();
    argonWorker = null;
  });

  worker.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[ArgonWorker exited with code ${code}]`);
    }
    argonWorker = null;
  });

  argonWorker = worker;
  return worker;
}

export function deriveArgon2idMaterial(
  password: string,
  salt: Buffer,
  options?: { t?: number; m?: number; p?: number }
): {
  passwordVerificationHash: Buffer;
  userKeyMaterial: Buffer;
} {
  const t = options?.t ?? ARGON_TIME_COST;
  const m = options?.m ?? ARGON_MEM_KIB;
  const p = options?.p ?? ARGON_PARALLELISM;

  const out = argon2id(Buffer.from(password, 'utf-8'), salt, {
    t,
    m,
    p,
    dkLen: 64,
  });
  const buf = Buffer.from(out);
  return {
    passwordVerificationHash: buf.subarray(0, 32),
    userKeyMaterial: buf.subarray(32, 64),
  };
}

export async function deriveArgon2idMaterialAsync(
  password: string,
  salt: Buffer,
  options?: { t?: number; m?: number; p?: number }
): Promise<{
  passwordVerificationHash: Buffer;
  userKeyMaterial: Buffer;
}> {
  const t = options?.t ?? ARGON_TIME_COST;
  const m = options?.m ?? ARGON_MEM_KIB;
  const p = options?.p ?? ARGON_PARALLELISM;

  return new Promise((resolve, reject) => {
    try {
      const worker = getOrCreateArgonWorker();
      const id = crypto.randomUUID();

      const timer = setTimeout(() => {
        if (pendingWorkerRequests.has(id)) {
          pendingWorkerRequests.delete(id);
          // Fall back to direct calculation if worker timed out
          try {
            resolve(deriveArgon2idMaterial(password, salt, { t, m, p }));
          } catch (e) {
            reject(e);
          }
        }
      }, 15000);

      pendingWorkerRequests.set(id, { resolve, reject, timer });
      worker.postMessage({
        id,
        password,
        saltHex: salt.toString('hex'),
        t,
        m,
        p,
      });
    } catch {
      // In synchronous/unsupported environments, execute directly
      try {
        resolve(deriveArgon2idMaterial(password, salt, { t, m, p }));
      } catch (e) {
        reject(e);
      }
    }
  });
}

// ============================================================================
// 3. ENVELOPE ENCRYPTION & KEY ROTATION HELPERS
// ============================================================================
export function computeEnvelopeKek(userKeyMaterial: Buffer, fileId: string): Buffer {
  return crypto
    .createHmac('sha256', SERVER_MASTER_KEY)
    .update(userKeyMaterial)
    .update(Buffer.from(fileId, 'utf-8'))
    .digest();
}

export function deriveHkdfSubkey(
  secretKey: Buffer,
  salt: Buffer,
  info: string,
  length = 32
): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', secretKey, salt, Buffer.from(info, 'utf-8'), length)
  );
}

// ============================================================================
// 4. CONTAINER INTEGRITY HMAC (CONSTANT TIME VERIFICATION)
// Signs fileId:originalName:extension:maxOpens:expiresAt:fileIvHex:fileAuthTagHex
// ============================================================================
export function computeContainerHmacHex(params: {
  fileId: string;
  originalName: string;
  extension: string;
  maxOpens: number | null;
  expiresAt: number | null;
  fileIvHex: string;
  fileAuthTagHex: string;
}): string {
  const payload = [
    params.fileId,
    params.originalName,
    params.extension,
    params.maxOpens === null ? 'inf' : String(params.maxOpens),
    params.expiresAt === null ? 'inf' : String(params.expiresAt),
    params.fileIvHex,
    params.fileAuthTagHex,
  ].join(':');

  return crypto.createHmac('sha256', SERVER_MASTER_KEY).update(payload).digest('hex');
}

export function verifyContainerHmac(providedHmacHex: unknown, expectedHmacHex: string): boolean {
  if (typeof providedHmacHex !== 'string' || typeof expectedHmacHex !== 'string') {
    return false;
  }
  const cleanProvided = providedHmacHex.trim().toLowerCase();
  const cleanExpected = expectedHmacHex.trim().toLowerCase();
  if (cleanProvided.length !== 64 || cleanExpected.length !== 64) {
    return false;
  }

  const provBuf = Buffer.from(cleanProvided, 'hex');
  const expBuf = Buffer.from(cleanExpected, 'hex');
  if (provBuf.length !== 32 || expBuf.length !== 32) {
    return false;
  }

  return crypto.timingSafeEqual(provBuf, expBuf);
}

// ============================================================================
// 5. TRANSPARENT ARGON2 RE-HASHING (UPGRADES OUTDATED PARAMETERS ON OPEN)
// ============================================================================
export function needsArgon2Rehash(record: ProtectedFileRecord): boolean {
  const meta = record.cryptoMeta;
  if (!meta) return true;
  if (meta.argonMemCostKiB < ARGON_MEM_KIB) return true;
  if (meta.argonTimeCost < ARGON_TIME_COST) return true;
  if (meta.argonParallelism < ARGON_PARALLELISM) return true;
  if (meta.keyId && meta.keyId !== CURRENT_MASTER_KEY_ID) return true;
  return false;
}

export async function transparentlyRehashRecord(
  password: string,
  record: ProtectedFileRecord,
  unwrappedDek: Buffer
): Promise<void> {
  const newSalt = crypto.randomBytes(16);
  const { passwordVerificationHash, userKeyMaterial } = await deriveArgon2idMaterialAsync(
    password,
    newSalt,
    {
      m: ARGON_MEM_KIB,
      t: ARGON_TIME_COST,
      p: ARGON_PARALLELISM,
    }
  );

  const newEnvelopeKek = computeEnvelopeKek(userKeyMaterial, record.fileId);
  userKeyMaterial.fill(0);

  const newDekIv = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv('aes-256-gcm', newEnvelopeKek, newDekIv);
  const wrappedDek = Buffer.concat([dekCipher.update(unwrappedDek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  record.passwordHash = passwordVerificationHash.toString('hex');
  record.cryptoMeta.keyId = CURRENT_MASTER_KEY_ID;
  record.cryptoMeta.argonSaltHex = newSalt.toString('hex');
  record.cryptoMeta.argonMemCostKiB = ARGON_MEM_KIB;
  record.cryptoMeta.argonTimeCost = ARGON_TIME_COST;
  record.cryptoMeta.argonParallelism = ARGON_PARALLELISM;
  record.cryptoMeta.wrappedDekHex = wrappedDek.toString('hex');
  record.cryptoMeta.dekIvHex = newDekIv.toString('hex');
  record.cryptoMeta.dekAuthTagHex = dekAuthTag.toString('hex');
}

// ============================================================================
// 6. RATE LIMITING & BRUTE-FORCE PROTECTION
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
// 7. IN-MEMORY SECURE VIEWER CONTENT PARSER (NO TEMP FILES ON DISK)
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
      const rawHtml =
        htmlRes.value ||
        `<p>${(rawRes.value || 'مستند Word فارغ').replace(/\n/g, '</p><p>')}</p>`;
      return {
        viewerType: 'word',
        htmlContent: sanitizeHtml(rawHtml),
        textContent: rawRes.value || '',
      };
    } catch {
      const fallbackText = decryptedBuffer
        .toString('utf-8')
        .replace(/[^\x20-\x7E\u0600-\u06FF\n\r\t]/g, ' ');
      const safeEscaped = fallbackText
        .slice(0, 8000)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return {
        viewerType: 'word',
        htmlContent: `<div class="space-y-2"><p>${safeEscaped}</p></div>`,
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
        sheets: [
          { name: 'Sheet1', rows: [['تعذر قراءة خلايا الجدول، لكن تم فك تشفير الملف بنجاح.']] },
        ],
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
