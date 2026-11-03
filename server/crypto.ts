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
  reject: (reason?: unknown) => void;
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
  previewAvailable?: boolean;
  previewError?: string;
  htmlContent?: string;
  textContent?: string;
  sheets?: { name: string; rows: string[][] }[];
  slides?: { slideNumber: number; title: string; bullets: string[] }[];
  pdfBase64?: string;
  zipEntries?: { name: string; sizeBytes: number; isDirectory: boolean; compressedSize: number }[];
}

async function runParserInWorker(
  buffer: Buffer,
  ext: string,
  originalName: string
): Promise<SecureViewerPayload> {
  return new Promise((resolve, reject) => {
    const workerPath = path.resolve(PROJECT_ROOT, 'server/parserWorker.js');
    const worker = new Worker(workerPath, {
      workerData: { buffer, ext, originalName },
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
      },
    });

    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        worker.terminate().catch(() => {});
        reject(new Error('TIMEOUT: استغرقت عملية فك وتحليل المستند وقتاً أطول من المسموح به.'));
      }
    }, 5000);

    worker.on('message', (msg) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (msg && msg.ok) {
        resolve(msg.result);
      } else {
        reject(new Error(msg?.error || 'فشلت عملية تحليل المستند.'));
      }
    });

    worker.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      reject(err);
    });

    worker.on('exit', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`توقف معالج تحليل المستندات برمز خروج ${code}`));
      }
    });
  });
}

export async function buildSecureViewerPayload(
  decryptedBuffer: Buffer,
  record: ProtectedFileRecord
): Promise<SecureViewerPayload> {
  const ext = record.extension.toLowerCase();

  // PDF files are viewed directly in PDF.js viewer
  if (ext === '.pdf') {
    return {
      viewerType: 'pdf',
      previewAvailable: true,
      pdfBase64:
        decryptedBuffer.byteLength <= 3 * 1024 * 1024
          ? decryptedBuffer.toString('base64')
          : undefined,
    };
  }

  try {
    const parsed = await runParserInWorker(decryptedBuffer, ext, record.originalName);
    return parsed;
  } catch (err: unknown) {
    const errMessage = String((err as { message?: string })?.message || '');
    let honestError =
      'تم فك تشفير الملف بنجاح، ولكن تعذر إنشاء معاينة تفاعلية لهذا التنسيق أو لاحتوائه على عناصر غير مدعومة.';

    if (errMessage.includes('ZIP_BOMB')) {
      honestError = `تم حظر إنشاء المعاينة لأسباب أمنية: ${errMessage.replace(/^Error:\s*/, '')}`;
    } else if (errMessage.includes('TIMEOUT')) {
      honestError = 'استغرقت عملية إعداد المعاينة وقتاً أطول من المسموح به.';
    }

    const viewerType: SecureViewerPayload['viewerType'] =
      ext === '.docx' || ext === '.doc'
        ? 'word'
        : ext === '.xlsx' || ext === '.xls'
        ? 'excel'
        : ext === '.pptx' || ext === '.ppt'
        ? 'powerpoint'
        : 'zip';

    return {
      viewerType,
      previewAvailable: false,
      previewError: honestError,
    };
  }
}

