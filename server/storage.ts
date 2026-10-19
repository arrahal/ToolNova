import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  PROTECTOR_DB_FILE,
  STORAGE_DIR,
  AUDIT_IP_SALT,
} from './config';
import { adminDb } from './firebaseAdmin';

// Ensure secure storage directory exists with restrictive permissions
if (!fs.existsSync(STORAGE_DIR)) {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  } catch (err) {
    console.error('Failed to initialize STORAGE_DIR:', err);
  }
}

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
    keyId?: string; // Master Key ID used to wrap the DEK (rotation tracking)
    argonSaltHex: string;
    argonTimeCost: number;
    argonMemCostKiB: number;
    argonParallelism: number;
    fileIvHex: string;
    fileAuthTagHex: string;
    wrappedDekHex?: string; // Optional for crypto-shredding on delete
    dekIvHex?: string;
    dekAuthTagHex?: string;
    containerHmacHex: string;
    // For unrestricted offline files only:
    isOfflineMode?: boolean;
    webCryptoSaltHex?: string;
    webFileIvHex?: string;
    webViewerIvHex?: string;
    webViewerCiphertextBase64?: string;
    webFileCiphertextBase64?: string;
  };
  isOfflineMode?: boolean;
  openLogs?: {
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
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
  }
  const resolved = path.resolve(STORAGE_DIR, `${safeId}.enc`);
  if (!resolved.startsWith(path.resolve(STORAGE_DIR))) {
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

// Salted IP hash computation for privacy-preserving audit logs
export function computeSaltedIpHash(ip: string): string {
  const cleanIp = ip?.trim() || '127.0.0.1';
  return crypto.createHash('sha256').update(`${cleanIp}:${AUDIT_IP_SALT}`).digest('hex');
}

export interface AuditLogEntry {
  id?: string;
  fileId: string;
  timestamp: number;
  uid: string; // user UID or 'anonymous'
  ipHash: string; // Salted SHA-256
  userAgent: string;
  action: 'open' | 'failed_open' | 'revoke' | 'delete' | 'recreate';
  result: 'success' | 'failure' | 'locked';
  reason?: string;
}

export interface OpenSlotResult {
  allowed: boolean;
  remainingOpens: number | null;
  status: ProtectedFileStatus;
  reason?: string;
  record?: ProtectedFileRecord;
}

/**
 * Storage Repository Interface (Requirement 7)
 */
export interface IProtectorRepository {
  get(fileId: string): Promise<ProtectedFileRecord | null>;
  save(record: ProtectedFileRecord): Promise<void>;
  update(fileId: string, updates: Partial<ProtectedFileRecord>): Promise<void>;
  delete(fileId: string): Promise<void>;
  listByOwner(ownerId: string): Promise<ProtectedFileRecord[]>;
  consumeOpenSlot(fileId: string, auditEntry: AuditLogEntry): Promise<OpenSlotResult>;
  recordAuditLog(entry: AuditLogEntry): Promise<void>;
  getAuditLogs(fileId: string): Promise<AuditLogEntry[]>;
  clearAll?(): Promise<void>;
}

// In-process memory store with mutex for atomic transaction fallback
class MemoryOrFileProtectorRepository implements IProtectorRepository {
  private db: Map<string, ProtectedFileRecord> = new Map();
  private auditLogs: Map<string, AuditLogEntry[]> = new Map();
  private mutex: Promise<any> = Promise.resolve();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(PROTECTOR_DB_FILE)) {
        const raw = fs.readFileSync(PROTECTOR_DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          this.db.set(k, v as ProtectedFileRecord);
        }
      }
    } catch {
      // ignore
    }
  }

  private persistToDisk() {
    try {
      const obj: Record<string, ProtectedFileRecord> = {};
      for (const [k, v] of this.db.entries()) {
        obj[k] = v;
      }
      const tmp = `${PROTECTOR_DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
      fs.renameSync(tmp, PROTECTOR_DB_FILE);
    } catch {
      // ignore
    }
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(fn, fn);
    this.mutex = next.catch(() => {});
    return next;
  }

  async get(fileId: string): Promise<ProtectedFileRecord | null> {
    const rec = this.db.get(fileId);
    if (!rec) return null;
    const dynamicStatus = computeDynamicStatus(rec);
    if (dynamicStatus !== rec.status) {
      rec.status = dynamicStatus;
      this.persistToDisk();
    }
    return { ...rec };
  }

  async save(record: ProtectedFileRecord): Promise<void> {
    return this.withLock(async () => {
      this.db.set(record.fileId, { ...record });
      this.persistToDisk();
    });
  }

  async update(fileId: string, updates: Partial<ProtectedFileRecord>): Promise<void> {
    return this.withLock(async () => {
      const existing = this.db.get(fileId);
      if (!existing) return;
      const updated = { ...existing, ...updates };
      updated.status = computeDynamicStatus(updated);
      this.db.set(fileId, updated);
      this.persistToDisk();
    });
  }

  async delete(fileId: string): Promise<void> {
    return this.withLock(async () => {
      this.db.delete(fileId);
      this.persistToDisk();
    });
  }

  async listByOwner(ownerId: string): Promise<ProtectedFileRecord[]> {
    const list: ProtectedFileRecord[] = [];
    for (const rec of this.db.values()) {
      if (rec.ownerId === ownerId && rec.status !== 'deleted') {
        const dynamicStatus = computeDynamicStatus(rec);
        if (dynamicStatus !== rec.status) {
          rec.status = dynamicStatus;
        }
        list.push({ ...rec });
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async consumeOpenSlot(fileId: string, auditEntry: AuditLogEntry): Promise<OpenSlotResult> {
    return this.withLock(async () => {
      const record = this.db.get(fileId);
      if (!record || record.status === 'deleted') {
        return {
          allowed: false,
          remainingOpens: null,
          status: 'deleted',
          reason: 'الملف غير موجود.',
        };
      }

      const now = Date.now();
      const currentStatus = computeDynamicStatus(record, now);
      record.status = currentStatus;

      if (currentStatus === 'revoked') {
        return { allowed: false, remainingOpens: null, status: 'revoked', reason: 'تم إبطال هذا الملف من قبل المالك.' };
      }
      if (currentStatus === 'expired') {
        return { allowed: false, remainingOpens: 0, status: 'expired', reason: 'انتهت صلاحية هذا الملف.' };
      }
      if (currentStatus === 'exhausted') {
        return {
          allowed: false,
          remainingOpens: 0,
          status: 'exhausted',
          reason: 'تم استنفاد الحد الأقصى لمرات فتح الملف.',
        };
      }

      // Atomically consume slot
      record.usedOpens += 1;
      const isExhausted = record.maxOpens !== null && record.usedOpens >= record.maxOpens;
      record.status = isExhausted ? 'exhausted' : 'active';
      record.lastOpenedAt = now;
      const remainingOpens = record.maxOpens === null ? null : Math.max(0, record.maxOpens - record.usedOpens);
      record.remainingOpens = remainingOpens;

      this.db.set(fileId, record);
      this.persistToDisk();

      // Record audit log
      await this.recordAuditLog(auditEntry);

      return {
        allowed: true,
        remainingOpens,
        status: record.status,
        record: { ...record },
      };
    });
  }

  async recordAuditLog(entry: AuditLogEntry): Promise<void> {
    const logs = this.auditLogs.get(entry.fileId) || [];
    logs.push({ ...entry, id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` });
    this.auditLogs.set(entry.fileId, logs);
  }

  async getAuditLogs(fileId: string): Promise<AuditLogEntry[]> {
    return (this.auditLogs.get(fileId) || []).slice();
  }

  async clearAll(): Promise<void> {
    this.db.clear();
    this.auditLogs.clear();
    this.persistToDisk();
  }
}

/**
 * Firestore Implementation of IProtectorRepository (Preferred Production Implementation)
 * Uses Firestore transactions for atomic open-slot consumption.
 */
class FirestoreProtectorRepository implements IProtectorRepository {
  private fallback: MemoryOrFileProtectorRepository;

  constructor() {
    this.fallback = new MemoryOrFileProtectorRepository();
  }

  private isFirestoreHealthy(): boolean {
    return Boolean(adminDb && typeof (adminDb as any).collection === 'function');
  }

  async get(fileId: string): Promise<ProtectedFileRecord | null> {
    try {
      if (this.isFirestoreHealthy()) {
        const snap = await adminDb.collection('protectedFiles').doc(fileId).get();
        if (!snap.exists) return null;
        const rec = snap.data() as ProtectedFileRecord;
        const dynamicStatus = computeDynamicStatus(rec);
        if (dynamicStatus !== rec.status) {
          rec.status = dynamicStatus;
          adminDb.collection('protectedFiles').doc(fileId).update({ status: dynamicStatus }).catch(() => {});
        }
        return rec;
      }
    } catch {
      // Fallback
    }
    return this.fallback.get(fileId);
  }

  async save(record: ProtectedFileRecord): Promise<void> {
    try {
      if (this.isFirestoreHealthy()) {
        await adminDb.collection('protectedFiles').doc(record.fileId).set(record);
        // Also keep fallback synchronized
        await this.fallback.save(record);
        return;
      }
    } catch {
      // Fallback
    }
    await this.fallback.save(record);
  }

  async update(fileId: string, updates: Partial<ProtectedFileRecord>): Promise<void> {
    try {
      if (this.isFirestoreHealthy()) {
        await adminDb.collection('protectedFiles').doc(fileId).set(updates, { merge: true });
        await this.fallback.update(fileId, updates);
        return;
      }
    } catch {
      // Fallback
    }
    await this.fallback.update(fileId, updates);
  }

  async delete(fileId: string): Promise<void> {
    try {
      if (this.isFirestoreHealthy()) {
        await adminDb.collection('protectedFiles').doc(fileId).delete();
        await this.fallback.delete(fileId);
        return;
      }
    } catch {
      // Fallback
    }
    await this.fallback.delete(fileId);
  }

  async listByOwner(ownerId: string): Promise<ProtectedFileRecord[]> {
    try {
      if (this.isFirestoreHealthy()) {
        const querySnap = await adminDb
          .collection('protectedFiles')
          .where('ownerId', '==', ownerId)
          .get();
        const results: ProtectedFileRecord[] = [];
        querySnap.forEach((docSnap) => {
          const rec = docSnap.data() as ProtectedFileRecord;
          if (rec.status !== 'deleted') {
            rec.status = computeDynamicStatus(rec);
            results.push(rec);
          }
        });
        if (results.length > 0) {
          return results.sort((a, b) => b.createdAt - a.createdAt);
        }
      }
    } catch {
      // Fallback
    }
    return this.fallback.listByOwner(ownerId);
  }

  async consumeOpenSlot(fileId: string, auditEntry: AuditLogEntry): Promise<OpenSlotResult> {
    try {
      if (this.isFirestoreHealthy()) {
        const docRef = adminDb.collection('protectedFiles').doc(fileId);
        const result = await adminDb.runTransaction(async (transaction) => {
          const snap = await transaction.get(docRef);
          if (!snap.exists) {
            return {
              allowed: false,
              remainingOpens: null,
              status: 'deleted' as ProtectedFileStatus,
              reason: 'الملف غير موجود.',
            };
          }

          const record = snap.data() as ProtectedFileRecord;
          const now = Date.now();
          const currentStatus = computeDynamicStatus(record, now);

          if (currentStatus === 'revoked' || currentStatus === 'deleted') {
            return {
              allowed: false,
              remainingOpens: null,
              status: currentStatus,
              reason: 'تم إبطال هذا الملف من قبل المالك.',
            };
          }
          if (currentStatus === 'expired') {
            transaction.update(docRef, { status: 'expired' });
            return {
              allowed: false,
              remainingOpens: 0,
              status: 'expired' as ProtectedFileStatus,
              reason: 'انتهت صلاحية هذا الملف.',
            };
          }
          if (currentStatus === 'exhausted') {
            transaction.update(docRef, { status: 'exhausted' });
            return {
              allowed: false,
              remainingOpens: 0,
              status: 'exhausted' as ProtectedFileStatus,
              reason: 'تم استنفاد الحد الأقصى لمرات فتح الملف.',
            };
          }

          // Atomic consumption
          const newUsed = record.usedOpens + 1;
          const isExhausted = record.maxOpens !== null && newUsed >= record.maxOpens;
          const newStatus: ProtectedFileStatus = isExhausted ? 'exhausted' : 'active';
          const remainingOpens = record.maxOpens === null ? null : Math.max(0, record.maxOpens - newUsed);

          transaction.update(docRef, {
            usedOpens: newUsed,
            remainingOpens,
            status: newStatus,
            lastOpenedAt: now,
          });

          // Save audit log
          const auditDoc = adminDb.collection('protectedFileAuditLogs').doc();
          transaction.set(auditDoc, {
            ...auditEntry,
            id: auditDoc.id,
          });

          return {
            allowed: true,
            remainingOpens,
            status: newStatus,
            record: {
              ...record,
              usedOpens: newUsed,
              status: newStatus,
              lastOpenedAt: now,
            },
          };
        });

        // Mirror result to fallback
        this.fallback.consumeOpenSlot(fileId, auditEntry).catch(() => {});
        return result;
      }
    } catch {
      // Fallback
    }

    return this.fallback.consumeOpenSlot(fileId, auditEntry);
  }

  async recordAuditLog(entry: AuditLogEntry): Promise<void> {
    try {
      if (this.isFirestoreHealthy()) {
        await adminDb.collection('protectedFileAuditLogs').add(entry);
      }
    } catch {
      // Fallback
    }
    await this.fallback.recordAuditLog(entry);
  }

  async getAuditLogs(fileId: string): Promise<AuditLogEntry[]> {
    try {
      if (this.isFirestoreHealthy()) {
        const snap = await adminDb
          .collection('protectedFileAuditLogs')
          .where('fileId', '==', fileId)
          .get();
        const logs: AuditLogEntry[] = [];
        snap.forEach((d) => logs.push(d.data() as AuditLogEntry));
        if (logs.length > 0) {
          return logs.sort((a, b) => b.timestamp - a.timestamp);
        }
      }
    } catch {
      // Fallback
    }
    return this.fallback.getAuditLogs(fileId);
  }

  async clearAll(): Promise<void> {
    await this.fallback.clearAll?.();
  }
}

// Global active repository singleton
let activeRepository: IProtectorRepository = new FirestoreProtectorRepository();

export function getProtectorRepository(): IProtectorRepository {
  return activeRepository;
}

export function setProtectorRepositoryForTesting(repo: IProtectorRepository | null): void {
  activeRepository = repo || new FirestoreProtectorRepository();
}

let globalProtectorMutex: Promise<any> = Promise.resolve();

export function withAtomicProtectorLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = globalProtectorMutex.then(fn, fn);
  globalProtectorMutex = next.catch(() => {});
  return next;
}

// Backward compatible aliases to preserve existing callers
export function readProtectorDb(): Record<string, ProtectedFileRecord> {
  try {
    if (fs.existsSync(PROTECTOR_DB_FILE)) {
      return JSON.parse(fs.readFileSync(PROTECTOR_DB_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

export function writeProtectorDb(db: Record<string, ProtectedFileRecord>): void {
  try {
    const tmpFile = `${PROTECTOR_DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, PROTECTOR_DB_FILE);
  } catch {}
}


