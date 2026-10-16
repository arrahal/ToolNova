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
export const SECURE_STORAGE_DIR = path.join(PROJECT_ROOT, '.secure_storage');
export const MASTER_KEY_FILE = path.join(SECURE_STORAGE_DIR, '.master_key');

// Load Firebase Project ID from env or firebase-applet-config.json
function resolveFirebaseProjectId(): string {
  if (process.env.FIREBASE_PROJECT_ID) {
    return process.env.FIREBASE_PROJECT_ID;
  }
  if (process.env.VITE_FIREBASE_PROJECT_ID) {
    return process.env.VITE_FIREBASE_PROJECT_ID;
  }
  const configPath = path.join(PROJECT_ROOT, 'firebase-applet-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed.projectId) return parsed.projectId;
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
  return 'gen-lang-client-0209937761';
}

export const FIREBASE_PROJECT_ID = resolveFirebaseProjectId();

// Ensure secure storage directory exists with restricted master key
function getOrCreateServerMasterKey(): Buffer {
  if (!fs.existsSync(SECURE_STORAGE_DIR)) {
    fs.mkdirSync(SECURE_STORAGE_DIR, { recursive: true });
  }
  if (fs.existsSync(MASTER_KEY_FILE)) {
    const raw = fs.readFileSync(MASTER_KEY_FILE);
    if (raw.length === 32) return raw;
  }
  const newKey = crypto.randomBytes(32);
  fs.writeFileSync(MASTER_KEY_FILE, newKey);
  return newKey;
}

export const SERVER_MASTER_KEY = getOrCreateServerMasterKey();

export const ARGON_TIME_COST = 2;
export const ARGON_MEM_KIB = 16384; // 16 MiB memory-hard
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
