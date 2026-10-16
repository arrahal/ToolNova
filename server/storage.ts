import fs from 'fs';
import path from 'path';
import {
  PROTECTOR_DB_FILE,
  SECURE_STORAGE_DIR,
  VAULT_STORE_FILE,
} from './config';

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

// Public Data Transfer Object — Strips all secret cryptographic keys, hashes and ciphertexts
export interface PublicProtectedFileDto {
  fileId: string;
  ownerId: string;
  originalName: string;
  secureFileName: string;
  interactiveFileName?: string;
  extension: string;
  category: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip' | 'other';
  mimeType?: string;
  fileSize: number;
  createdAt: number;
  expiresAt: number | null;
  expirationLabel: string;
  maxOpens: number | null;
  usedOpens: number;
  remainingOpens: number | null;
  status: ProtectedFileStatus;
  lastOpenedAt: number | null;
  openLogs?: {
    attemptId: string;
    openedAt: number;
    openNumber: number;
    clientSummary: string;
  }[];
}

export function toPublicFileDto(record: ProtectedFileRecord): PublicProtectedFileDto {
  const remainingOpens =
    record.maxOpens === null ? null : Math.max(0, record.maxOpens - record.usedOpens);

  return {
    fileId: record.fileId,
    ownerId: record.ownerId,
    originalName: record.originalName,
    secureFileName: record.secureFileName,
    interactiveFileName: `${record.originalName}.protected.html`,
    extension: record.extension,
    category: record.category,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    expirationLabel: record.expirationLabel,
    maxOpens: record.maxOpens,
    usedOpens: record.usedOpens,
    remainingOpens,
    status: record.status,
    lastOpenedAt: record.lastOpenedAt,
    openLogs: record.openLogs ? record.openLogs.map((l) => ({ ...l })) : [],
  };
}

export function sanitizeFileId(rawId: unknown): string | null {
  if (typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  // Strict UUID / hex-hyphen check to prevent any Path Traversal
  if (!/^[a-fA-F0-9-]{16,64}$/.test(trimmed)) return null;
  return trimmed;
}

export function getEncryptedFilePath(fileId: string): string {
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

export function computeDynamicStatus(
  record: ProtectedFileRecord,
  now = Date.now()
): ProtectedFileStatus {
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

export function readProtectorDb(): Record<string, ProtectedFileRecord> {
  try {
    if (fs.existsSync(PROTECTOR_DB_FILE)) {
      const raw = fs.readFileSync(PROTECTOR_DB_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to read protector db:', e);
  }
  return {};
}

export function writeProtectorDb(db: Record<string, ProtectedFileRecord>): void {
  try {
    const tmpFile = `${PROTECTOR_DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, PROTECTOR_DB_FILE);
  } catch (e) {
    console.error('Failed to write protector db:', e);
  }
}

// In-process promise mutex chain to serialize atomic updates and prevent race conditions
let protectorMutexChain: Promise<any> = Promise.resolve();

export function withAtomicProtectorLock<T>(task: () => Promise<T>): Promise<T> {
  const next = protectorMutexChain.then(task, task);
  protectorMutexChain = next.catch(() => {});
  return next;
}

// ============================================================================
// LEGACY VAULT STORE
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

export function computeSimpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function readVaultStore(): Record<string, VaultTokenState> {
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

export function writeVaultStore(store: Record<string, VaultTokenState>): void {
  try {
    fs.writeFileSync(VAULT_STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write vault store:', e);
  }
}
