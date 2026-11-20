import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Load environment variables immediately on startup
dotenv.config();

export const PORT = parseInt(process.env.PORT || '3000', 10);
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const PROJECT_ROOT = process.cwd();
export const VAULT_STORE_FILE = path.join(PROJECT_ROOT, '.vault_quotas.json');
export const PROTECTOR_DB_FILE = path.join(PROJECT_ROOT, '.protector_db.json');
export const STORAGE_DIR = process.env.STORAGE_DIR || path.join(PROJECT_ROOT, '.secure_storage');
export const SECURE_STORAGE_DIR = STORAGE_DIR;

// Public base URL used for client links and thin client launcher API calls
export const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  (process.env.PORT ? `http://localhost:${process.env.PORT}` : 'http://localhost:3000')
).replace(/\/$/, '');

// Audit IP salt for privacy-preserving SHA-256 IP hashing
export function resolveAuditIpSalt(
  rawSalt = process.env.AUDIT_IP_SALT,
  nodeEnv = NODE_ENV
): string {
  const trimmed = rawSalt?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (nodeEnv === 'production') {
    throw new Error('FATAL: AUDIT_IP_SALT environment variable is required in production.');
  }
  if (nodeEnv === 'development') {
    console.warn(
      '[SECURITY NOTICE] AUDIT_IP_SALT not set in env; using default development audit salt.'
    );
  }
  return 'toolnova_default_audit_salt_2026';
}

export const AUDIT_IP_SALT = resolveAuditIpSalt();

// Configurable CORS allowlist from env
export function resolveAllowedOrigins(
  rawOrigins = process.env.ALLOWED_ORIGINS,
  nodeEnv = NODE_ENV
): string[] {
  const origins = (rawOrigins || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    return origins;
  }
  if (nodeEnv === 'production') {
    throw new Error('FATAL: ALLOWED_ORIGINS environment variable is required in production.');
  }
  if (nodeEnv === 'development') {
    console.warn(
      '[SECURITY NOTICE] ALLOWED_ORIGINS not set in env; CORS allowlist is empty in development.'
    );
  }
  return [];
}

export const ALLOWED_ORIGINS = resolveAllowedOrigins();

// Configurable trust proxy setting
export const TRUST_PROXY = process.env.TRUST_PROXY;

// Load Firebase Project ID from env or firebase-applet-config.json
export function resolveFirebaseProjectId(
  configFilePath = path.join(PROJECT_ROOT, 'firebase-applet-config.json')
): string {
  const envProjectId =
    process.env.FIREBASE_PROJECT_ID?.trim() || process.env.VITE_FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) {
    return envProjectId;
  }
  try {
    if (fs.existsSync(configFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as {
        projectId?: unknown;
      };
      if (typeof parsed.projectId === 'string' && parsed.projectId.trim()) {
        return parsed.projectId.trim();
      }
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
  throw new Error(
    'FATAL: Firebase projectId is not configured. Set FIREBASE_PROJECT_ID (or VITE_FIREBASE_PROJECT_ID) or provide projectId in firebase-applet-config.json.'
  );
}

export const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();

export function resolveFirestoreDatabaseId(
  configFilePath = path.join(PROJECT_ROOT, 'firebase-applet-config.json')
): string {
  const envDbId =
    process.env.FIRESTORE_DATABASE_ID?.trim() || process.env.VITE_FIREBASE_DATABASE_ID?.trim();
  if (envDbId) {
    return envDbId;
  }
  try {
    if (fs.existsSync(configFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(configFilePath, 'utf-8')) as {
        firestoreDatabaseId?: unknown;
      };
      if (typeof parsed.firestoreDatabaseId === 'string' && parsed.firestoreDatabaseId.trim()) {
        return parsed.firestoreDatabaseId.trim();
      }
    }
  } catch (err) {
    console.error('Failed to read firestoreDatabaseId:', err);
  }
  throw new Error(
    'FATAL: Firestore databaseId is not configured. Set FIRESTORE_DATABASE_ID (or VITE_FIREBASE_DATABASE_ID) or provide firestoreDatabaseId in firebase-applet-config.json.'
  );
}

export const FIRESTORE_DATABASE_ID = resolveFirestoreDatabaseId();

export function resolveLemonSqueezyWebhookSecret(
  rawSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET,
  nodeEnv = NODE_ENV
): string {
  const trimmed = rawSecret?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (nodeEnv === 'production') {
    throw new Error(
      'FATAL: LEMONSQUEEZY_WEBHOOK_SECRET environment variable is required in production.'
    );
  }
  if (nodeEnv === 'development') {
    console.warn(
      '[SECURITY NOTICE] LEMONSQUEEZY_WEBHOOK_SECRET not set in env; Lemon Squeezy webhook verification is disabled until configured.'
    );
  }
  return '';
}

export const LEMONSQUEEZY_WEBHOOK_SECRET = resolveLemonSqueezyWebhookSecret();

// Master Key ID for key rotation support (clean identifier)
export const CURRENT_MASTER_KEY_ID =
  process.env.SERVER_MASTER_KEY_ID && /^[a-zA-Z0-9_-]{1,32}$/.test(process.env.SERVER_MASTER_KEY_ID.trim())
    ? process.env.SERVER_MASTER_KEY_ID.trim()
    : 'k1';

// Server Master Key for envelope encryption (must be 64 hex characters / 256 bits)
function resolveServerMasterKey(): Buffer {
  const envKey = process.env.SERVER_MASTER_KEY?.trim();
  if (envKey) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    // If provided but not 64 hex characters (e.g. injected token, base64, or passphrase),
    // derive a cryptographic 256-bit key via SHA-256 so dev/staging environments don't crash
    console.warn(
      '[SECURITY NOTICE] SERVER_MASTER_KEY environment variable is not 64 hex characters; deriving 256-bit key via SHA-256.'
    );
    return crypto.createHash('sha256').update(`server_master_key:${envKey}`).digest();
  }

  if (NODE_ENV === 'production') {
    throw new Error(
      'FATAL: SERVER_MASTER_KEY environment variable is missing in production. It must be 64 hex characters (256-bit key).'
    );
  }

  // In development/test mode only: persist dev key in a git-ignored file
  const devKeyFile = path.join(PROJECT_ROOT, '.server_master_key.dev');
  if (fs.existsSync(devKeyFile)) {
    const raw = fs.readFileSync(devKeyFile, 'utf-8').trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
  }

  const generatedHex = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(devKeyFile, generatedHex, { mode: 0o600 });
  console.warn(
    '[SECURITY NOTICE] SERVER_MASTER_KEY not set in env; created temporary dev key in .server_master_key.dev'
  );
  return Buffer.from(generatedHex, 'hex');
}

export const SERVER_MASTER_KEY = resolveServerMasterKey();

// Argon2id parameters (m >= 65536 KiB (64 MiB), t >= 3, p = 1)
export const ARGON_TIME_COST = 3;
export const ARGON_MEM_KIB = 65536; // 64 MiB memory-hard
export const ARGON_PARALLELISM = 1;

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
    labelAr: 'مستند Microsoft Word',
    labelEn: 'Microsoft Word Document',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.doc': {
    extension: '.doc',
    category: 'word',
    labelAr: 'مستند Microsoft Word (قديم)',
    labelEn: 'Microsoft Word (Legacy)',
    mimeTypes: ['application/msword'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.xlsx': {
    extension: '.xlsx',
    category: 'excel',
    labelAr: 'جدول بيانات Microsoft Excel',
    labelEn: 'Microsoft Excel Spreadsheet',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.xls': {
    extension: '.xls',
    category: 'excel',
    labelAr: 'جدول بيانات Excel (قديم)',
    labelEn: 'Microsoft Excel (Legacy)',
    mimeTypes: ['application/vnd.ms-excel'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.pptx': {
    extension: '.pptx',
    category: 'powerpoint',
    labelAr: 'عرض تقديمي PowerPoint',
    labelEn: 'PowerPoint Presentation',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
    ],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.ppt': {
    extension: '.ppt',
    category: 'powerpoint',
    labelAr: 'عرض تقديمي PowerPoint (قديم)',
    labelEn: 'PowerPoint (Legacy)',
    mimeTypes: ['application/vnd.ms-powerpoint'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.pdf': {
    extension: '.pdf',
    category: 'pdf',
    labelAr: 'مستند PDF محمول',
    labelEn: 'Portable Document Format',
    mimeTypes: ['application/pdf'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
  '.zip': {
    extension: '.zip',
    category: 'zip',
    labelAr: 'أرشيف ملفات مضغوط ZIP',
    labelEn: 'ZIP Compressed Archive',
    mimeTypes: ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'],
    maxSizeBytes: 50 * 1024 * 1024,
  },
};
