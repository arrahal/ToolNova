import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  Unlock,
  ShieldCheck,
  Upload,
  FileText,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  Download,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Trash2,
  Ban,
  Clock,
  KeyRound,
  LayoutDashboard,
  FolderLock,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles,
} from 'lucide-react';
import { AppLanguage } from '../data/translations';
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from 'docx';
import { auth, signInWithGoogle } from '../lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { sanitizeHtml } from '../utils/sanitizeHtml';

export type ProtectorTab = 'encrypt' | 'open' | 'dashboard';

export interface ProtectedFileSummary {
  fileId: string;
  ownerId?: string;
  originalName: string;
  secureFileName: string;
  interactiveFileName?: string;
  extension: string;
  category: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip' | 'other';
  fileSize: number;
  createdAt: number;
  expiresAt: number | null;
  expirationLabel: string;
  maxOpens: number | null;
  usedOpens: number;
  remainingOpens: number | null;
  status: 'active' | 'expired' | 'exhausted' | 'revoked' | 'deleted';
  lastOpenedAt: number | null;
  openLogs?: {
    attemptId: string;
    openedAt: number;
    openNumber: number;
    clientSummary: string;
  }[];
}

interface ViewerPayload {
  viewerType: 'word' | 'excel' | 'powerpoint' | 'pdf' | 'zip';
  htmlContent?: string;
  textContent?: string;
  sheets?: { name: string; rows: string[][] }[];
  slides?: { slideNumber: number; title: string; bullets: string[] }[];
  pdfBase64?: string;
  zipEntries?: {
    name: string;
    sizeBytes: number;
    isDirectory: boolean;
    compressedSize: number;
  }[];
}

interface FileProtectorModalProps {
  isOpen: boolean;
  initialTab?: ProtectorTab;
  language: AppLanguage;
  ownerId?: string;
  onClose: () => void;
  onRecordHistory?: (toolTitle: string, detail: string) => void;
}

const SUPPORTED_EXTENSIONS = ['.docx', '.xlsx', '.pptx', '.pdf', '.zip'];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileTypeLabel(fileName: string, isAr: boolean): {
  ext: string;
  label: string;
  badge: string;
  colorClass: string;
} {
  const lower = fileName.toLowerCase().replace(/\.secure$/i, '');
  if (lower.endsWith('.docx')) {
    return {
      ext: '.docx',
      label: isAr ? 'مستند Microsoft Word (.docx)' : 'Microsoft Word Document (.docx)',
      badge: 'WORD',
      colorClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    };
  }
  if (lower.endsWith('.xlsx')) {
    return {
      ext: '.xlsx',
      label: isAr ? 'جدول بيانات Microsoft Excel (.xlsx)' : 'Microsoft Excel Spreadsheet (.xlsx)',
      badge: 'EXCEL',
      colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    };
  }
  if (lower.endsWith('.pptx')) {
    return {
      ext: '.pptx',
      label: isAr ? 'عرض تقديمي PowerPoint (.pptx)' : 'PowerPoint Presentation (.pptx)',
      badge: 'PPTX',
      colorClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
    };
  }
  if (lower.endsWith('.pdf')) {
    return {
      ext: '.pdf',
      label: isAr ? 'مستند PDF محمول (.pdf)' : 'PDF Document (.pdf)',
      badge: 'PDF',
      colorClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    };
  }
  if (lower.endsWith('.zip')) {
    return {
      ext: '.zip',
      label: isAr ? 'أرشيف مضغوط ZIP (.zip)' : 'ZIP Compressed Archive (.zip)',
      badge: 'ZIP',
      colorClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800',
    };
  }
  return {
    ext: '.unknown',
    label: isAr ? 'ملف غير مدعوم' : 'Unsupported File',
    badge: 'FILE',
    colorClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      resolve(commaIndex !== -1 ? result.substring(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 16384;
  let binary = '';
  for (let i = 0; i < len; i += chunkSize) {
    const end = Math.min(i + chunkSize, len);
    for (let j = i; j < end; j++) {
      binary += String.fromCharCode(bytes[j]);
    }
  }
  return btoa(binary);
}

function downloadBase64File(base64: string, fileName: string, mime = 'application/octet-stream') {
  try {
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const sliceSize = 1024 * 512;
    const byteArrays: BlobPart[] = [];
    for (let offset = 0; offset < len; offset += sliceSize) {
      const slice = binaryStr.slice(offset, offset + sliceSize);
      const byteNumbers = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(byteNumbers);
    }
    const blob = new Blob(byteArrays, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    console.error('Download base64 error:', err);
  }
}

function escapeJsonForScriptTag(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function buildClientProtectedHtmlLauncher(container: Record<string, unknown>): string {
  const safeOriginalName = String(container.originalName || 'ملف محمي')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const maxOpensDisplay =
    container.maxOpens === null || container.maxOpens === undefined
      ? 'بدون حد (مفتوح)'
      : `${container.maxOpens} مرات`;

  const expDisplay = container.expirationLabel ? String(container.expirationLabel) : 'بدون انتهاء';
  const safeJsonPayload = escapeJsonForScriptTag(container);
  const nonceBytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(nonceBytes);
  }
  const nonce = Array.from(nonceBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; frame-src blob: data:;" />
  <title>🔐 \${safeOriginalName} - ملف محمي</title>
  <script type="application/json" id="toolnova-container">\${safeJsonPayload}</script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { background: #0b0f19; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; color: #0f172a; }
    .card { background: #ffffff; width: 100%; max-width: 520px; border-radius: 24px; padding: 36px 30px; box-shadow: 0 25px 60px rgba(0,0,0,0.45); text-align: center; }
    .viewer-card { max-width: 980px; padding: 0; overflow: hidden; text-align: right; }
    .icon-box { width: 68px; height: 68px; border-radius: 20px; background: #fef2f2; color: #e5322d; display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 16px; border: 2px solid #fee2e2; }
    h1 { font-size: 21px; font-weight: 800; color: #111827; margin-bottom: 6px; }
    .filename { font-size: 13px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 6px 14px; border-radius: 9999px; display: inline-block; margin-bottom: 20px; direction: ltr; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px; margin-bottom: 22px; text-align: right; font-size: 12px; }
    .meta-label { color: #64748b; font-weight: 600; display: block; margin-bottom: 2px; }
    .meta-val { color: #0f172a; font-weight: 800; font-size: 13px; }
    .field-label { display: block; text-align: right; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 8px; }
    .input-wrap { position: relative; margin-bottom: 16px; }
    input[type="password"] { width: 100%; padding: 14px 16px; border-radius: 14px; border: 2px solid #cbd5e1; font-size: 16px; direction: ltr; text-align: center; letter-spacing: 2px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    input[type="password"]:focus { border-color: #e5322d; box-shadow: 0 0 0 4px rgba(229,50,45,0.15); }
    .btn { width: 100%; padding: 14px; border-radius: 14px; border: none; background: #e5322d; color: #ffffff; font-size: 15px; font-weight: 800; cursor: pointer; transition: background 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
    .btn:hover { background: #d12823; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-download-orig { background: #10b981; color: #fff; border: none; padding: 8px 14px; border-radius: 9px; font-size: 12px; font-weight: 800; cursor: pointer; }
    .btn-download-orig:hover { background: #059669; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; padding: 11px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 700; margin-bottom: 14px; display: none; text-align: right; }
    .badge-bar { margin-top: 18px; padding-top: 14px; border-top: 1px solid #f1f5f9; font-size: 11px; color: #64748b; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .viewer-header { background: #0f172a; color: #ffffff; padding: 16px 22px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .viewer-body { padding: 24px; max-height: 75vh; overflow-y: auto; background: #FAFAFC; }
    .hidden { display: none !important; }
  </style>
</head>
<body oncontextmenu="return false;">
  <div id="gateScreen" class="card">
    <div class="icon-box">🔐</div>
    <h1>هذا الملف محمي بكلمة مرور</h1>
    <div class="filename">\${safeOriginalName}</div>
    <div class="meta-grid">
      <div>
        <span class="meta-label">عدد مرات الفتح المتبقية</span>
        <span id="metaRemaining" class="meta-val">\${maxOpensDisplay}</span>
      </div>
      <div>
        <span class="meta-label">مدة الصلاحية</span>
        <span id="metaExpiry" class="meta-val">\${expDisplay}</span>
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
      <span>PBKDF2-SHA256</span>
      <span>•</span>
      <span>Atomic Open Control</span>
    </div>
  </div>

  <div id="expiredScreen" class="card hidden">
    <div class="icon-box" style="background:#fef2f2;color:#dc2626;">🔒</div>
    <h1 style="color:#dc2626;">🔒 الملف غير متاح</h1>
    <p style="font-size:15px;font-weight:800;color:#e5322d;margin:10px 0;">
      "لقد انتهت صلاحية الوصول إلى هذا الملف."
    </p>
    <p id="expiredReasonText" style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:18px;">
      انتهت صلاحية فتح هذا الملف أو تم استنفاد جميع مرات الفتح المسموحة.
    </p>
  </div>

  <div id="viewerScreen" class="card viewer-card hidden">
    <div class="viewer-header">
      <div>
        <div style="font-size:15px;font-weight:800;">🛡️ \${safeOriginalName}</div>
        <div id="viewerNotice" style="font-size:12px;color:#34d399;margin-top:2px;">
          تم التحقق من كلمة المرور وفك تشفير الملف بنجاح داخل العارض الآمن
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap;">
        <button id="downloadDecryptedBtn" class="btn-download-orig" onclick="downloadDecryptedOriginal()">
          ⬇️ تنزيل الملف الأصلي (\${safeOriginalName})
        </button>
        <span style="background:#1e293b;padding:6px 12px;border-radius:8px;border:1px solid #334155;">
          الفتحات المتبقية: <strong id="viewerRemaining" style="color:#34d399;">-</strong>
        </span>
      </div>
    </div>
    <div id="viewerBody" class="viewer-body"></div>
  </div>

  <script nonce="${nonce}">
    let CONTAINER = {};
    try {
      const containerEl = document.getElementById('toolnova-container');
      CONTAINER = JSON.parse(containerEl ? containerEl.textContent || '{}' : '{}');
    } catch (e) {
      console.error('Failed to parse container payload', e);
    }
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

      if (CONTAINER.webCiphertextBase64) {
        const rawCipher = base64ToBytes(CONTAINER.webCiphertextBase64);
        const rawDecrypted = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: iv, tagLength: 128 },
          aesKey,
          rawCipher
        );
        decryptedRawBytes = new Uint8Array(rawDecrypted);
      }
      return true;
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

    (function inspectOnLoad() {
      if (CONTAINER.expiresAt && Date.now() > CONTAINER.expiresAt) {
        showExpiredScreen('لقد انتهت صلاحية الوصول إلى هذا الملف (انتهت المدة الزمنية المحددة).');
        return;
      }
      const localUsed = getLocalUsedOpens();
      if (CONTAINER.maxOpens !== null && CONTAINER.maxOpens !== undefined) {
        const localRem = Math.max(0, CONTAINER.maxOpens - localUsed);
        document.getElementById('metaRemaining').textContent = localRem + ' من ' + CONTAINER.maxOpens;
        if (localUsed >= CONTAINER.maxOpens) {
          showExpiredScreen('انتهت صلاحية فتح هذا الملف. تم استهلاك جميع مرات الفتح المسموحة (' + CONTAINER.maxOpens + ').');
          return;
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
      btn.textContent = 'جاري التحقق من كلمة المرور وفك التشفير (AES-256-GCM)...';

      try {
        await decryptWithWebCrypto(pwd);
        const nextUsed = localUsed + 1;
        setLocalUsedOpens(nextUsed);
        const rem = CONTAINER.maxOpens === null || CONTAINER.maxOpens === undefined
          ? null
          : Math.max(0, CONTAINER.maxOpens - nextUsed);

        const msg = rem === 0
          ? 'تم التحقق من كلمة المرور وفتح الملف بنجاح. (تنبيه: تم استهلاك الفتحة الوحيدة/الأخيرة — الفتحات المتبقية الآن: 0)'
          : 'تم التحقق من كلمة المرور وفك تشفير الملف بنجاح (AES-256-GCM).';

        renderViewer(rem, msg);
      } catch (cryptoErr) {
        errBox.textContent = '❌ كلمة المرور غير صحيحة! فشل فك تشفير AES-256-GCM.';
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '🔓 فتح الملف المحمي';
      }
    }

    function renderViewer(remaining, message) {
      document.getElementById('gateScreen').classList.add('hidden');
      document.getElementById('expiredScreen').classList.add('hidden');
      const vScreen = document.getElementById('viewerScreen');
      vScreen.classList.remove('hidden');

      document.getElementById('viewerNotice').textContent = message || '';
      document.getElementById('viewerRemaining').textContent =
        remaining === null ? '∞' : String(remaining);

      const body = document.getElementById('viewerBody');
      body.textContent = '';

      if (CONTAINER.category === 'pdf' && decryptedRawBytes) {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '520px';
        iframe.style.border = '1px solid #e2e8f0';
        iframe.style.borderRadius = '12px';
        const pdfBlob = new Blob([decryptedRawBytes], { type: 'application/pdf' });
        iframe.src = URL.createObjectURL(pdfBlob) + '#toolbar=0';
        body.appendChild(iframe);
      } else {
        const div = document.createElement('div');
        div.style.padding = '30px';
        div.style.textAlign = 'center';
        const h3 = document.createElement('h3');
        h3.style.fontSize = '18px';
        h3.style.marginBottom = '12px';
        h3.textContent = '✅ تم فك تشفير المستند بنجاح';
        const p = document.createElement('p');
        p.style.color = '#64748b';
        p.style.marginBottom = '20px';
        p.textContent = 'يمكنك تنزيل الملف الأصلي المفكوك تشفيره بالكامل عبر الزر الأخضر أعلاه.';
        div.appendChild(h3);
        div.appendChild(p);
        body.appendChild(div);
      }
    }
  </script>
</body>
</html>`;
}

// Built-in list of common weak passwords
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
  'passw0rd123',
  'toolnova123',
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

export function evaluatePasswordStrength(pwd: string): {
  score: number; // 0 to 4
  labelAr: string;
  labelEn: string;
  color: string;
  bg: string;
  isCommon: boolean;
  isTooShort: boolean;
} {
  if (!pwd) {
    return {
      score: 0,
      labelAr: 'يرجى إدخال كلمة المرور (10 أحرف كحد أدنى)',
      labelEn: 'Enter a password (min 10 chars)',
      color: 'text-slate-400',
      bg: 'bg-slate-200 dark:bg-slate-700',
      isCommon: false,
      isTooShort: true,
    };
  }

  const isTooShort = pwd.length < 10;
  const isCommon = COMMON_WEAK_PASSWORDS.has(pwd.trim().toLowerCase());

  if (isCommon) {
    return {
      score: 0,
      labelAr: 'شائعة جداً وسهلة التخمين ⚠️',
      labelEn: 'Common & Easy to Guess ⚠️',
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-500',
      isCommon: true,
      isTooShort,
    };
  }

  if (isTooShort) {
    return {
      score: 1,
      labelAr: `قصيرة جداً (${pwd.length}/10 أحرف كحد أدنى)`,
      labelEn: `Too Short (${pwd.length}/10 chars min)`,
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-500',
      isCommon: false,
      isTooShort: true,
    };
  }

  let criteriaMet = 0;
  if (/[a-z]/.test(pwd)) criteriaMet++;
  if (/[A-Z]/.test(pwd)) criteriaMet++;
  if (/[0-9]/.test(pwd)) criteriaMet++;
  if (/[^a-zA-Z0-9]/.test(pwd)) criteriaMet++;
  if (pwd.length >= 14) criteriaMet++;

  if (criteriaMet <= 2) {
    return {
      score: 2,
      labelAr: 'ضعيفة',
      labelEn: 'Weak',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500',
      isCommon: false,
      isTooShort: false,
    };
  } else if (criteriaMet <= 3) {
    return {
      score: 3,
      labelAr: 'متوسطة',
      labelEn: 'Medium',
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-500',
      isCommon: false,
      isTooShort: false,
    };
  } else if (criteriaMet === 4) {
    return {
      score: 4,
      labelAr: 'قوية',
      labelEn: 'Strong',
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500',
      isCommon: false,
      isTooShort: false,
    };
  } else {
    return {
      score: 4,
      labelAr: 'قوية جداً 🛡️',
      labelEn: 'Very Strong 🛡️',
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-600',
      isCommon: false,
      isTooShort: false,
    };
  }
}

export const FileProtectorModal: React.FC<FileProtectorModalProps> = ({
  isOpen,
  initialTab = 'encrypt',
  language,
  ownerId = 'anonymous',
  onClose,
  onRecordHistory,
}) => {
  const isAr = language === 'ar';
  const [activeTab, setActiveTab] = useState<ProtectorTab>(initialTab);

  // ---------------- ENCRYPT WIZARD STATES ----------------
  const [encryptStep, setEncryptStep] = useState<1 | 2 | 3>(1);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Step 2: Protection settings
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [openLimitPreset, setOpenLimitPreset] = useState<
    '1' | '2' | '5' | '10' | 'custom' | 'unlimited'
  >('1');
  const [customOpenLimit, setCustomOpenLimit] = useState<number>(3);

  const [expiryPreset, setExpiryPreset] = useState<
    '1h' | '24h' | '7d' | '30d' | 'never' | 'custom'
  >('24h');
  const [customExpiryHours, setCustomExpiryHours] = useState<number>(48);
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);

  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptError, setEncryptError] = useState<string | null>(null);
  const [encryptedResult, setEncryptedResult] = useState<{
    file: ProtectedFileSummary;
    secureFileBase64: string;
    interactiveHtmlBase64?: string;
    interactiveFileName?: string;
  } | null>(null);

  // ---------------- OPEN PROTECTED FILE STATES ----------------
  const [secureContainerData, setSecureContainerData] = useState<{
    fileId: string;
    originalName: string;
    secureFileName: string;
    extension: string;
    fileSize: number;
    maxOpens: number | null;
    expirationLabel: string;
    ciphertextBase64?: string;
  } | null>(null);
  const [inspectedRecord, setInspectedRecord] = useState<ProtectedFileSummary | null>(null);
  const [openPasswordInput, setOpenPasswordInput] = useState('');
  const [showOpenPassword, setShowOpenPassword] = useState(false);
  const [isOpeningFile, setIsOpeningFile] = useState(false);
  const [openErrorMsg, setOpenErrorMsg] = useState<string | null>(null);
  const [unavailableScreen, setUnavailableScreen] = useState<{
    reasonTitle: string;
    reasonSubtitle: string;
    code: string;
  } | null>(null);
  const [openedViewerData, setOpenedViewerData] = useState<{
    file: ProtectedFileSummary;
    viewer: ViewerPayload;
    message: string;
  } | null>(null);
  const [activeExcelSheetIdx, setActiveExcelSheetIdx] = useState(0);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  // ---------------- DASHBOARD STATES ----------------
  const [dashboardFiles, setDashboardFiles] = useState<ProtectedFileSummary[]>([]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false);
  const [selectedLogsFile, setSelectedLogsFile] = useState<ProtectedFileSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const secureFileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(() => auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const getAuthHeader = async (): Promise<Record<string, string>> => {
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          return { Authorization: `Bearer ${token}` };
        }
      } catch (e) {
        console.warn('Failed to retrieve Firebase ID token:', e);
      }
    }
    return {};
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (initialTab === 'dashboard') {
        fetchDashboardFiles();
      }
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (isOpen && activeTab === 'dashboard') {
      fetchDashboardFiles();
    }
  }, [isOpen, activeTab, currentUser]);

  if (!isOpen) return null;

  const fetchDashboardFiles = async () => {
    if (!auth.currentUser) {
      setDashboardFiles([]);
      setIsLoadingDashboard(false);
      return;
    }
    setIsLoadingDashboard(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/protector/dashboard', {
        headers: { ...authHeader },
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.files)) {
        setDashboardFiles(data.files);
      }
    } catch (e) {
      console.error('Failed to load dashboard files:', e);
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  // Validate and set file in Step 1
  const handleSelectRawFile = (file: File) => {
    setUploadError(null);
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      setUploadError(
        isAr
          ? `صيغة الملف (${ext}) غير مدعومة. الصيغ المدعومة: Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF (.pdf), ZIP (.zip).`
          : `Unsupported format (${ext}). Supported: .docx, .xlsx, .pptx, .pdf, .zip.`
      );
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError(
        isAr
          ? 'حجم الملف يتجاوز الحد الأقصى المسموح به (50 ميجابايت).'
          : 'File exceeds the 50 MB maximum size limit.'
      );
      return;
    }
    setSelectedFile(file);
  };

  // Generate a real sample .docx file if user wants a 1-click demo
  const handleCreateSampleDocx = async () => {
    setUploadError(null);
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: 'وثيقة سرية محمية — نظام تشفير الملفات وحمايتها (AES-256-GCM)',
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'تم تشفير هذا المستند باستخدام خوارزمية AES-256-GCM مع اشتقاق المفاتيح عبر Argon2id، والتحكم الذري (Atomic) في عدد مرات الفتح المسموحة عبر الخادم.',
                  bold: true,
                }),
              ],
            }),
            new Paragraph({
              text: 'عند تحديد عدد مرات الفتح = 1، فإن أول عملية فتح صحيحة تستهلك الفتحة الوحيدة فوراً، ويرفض الخادم أي محاولة فتح ثانية حتى لو كانت كلمة المرور صحيحة.',
            }),
          ],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    const file = new File([blob], 'Confidential_Contract_2026.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    setSelectedFile(file);
  };

  const resolveMaxOpensValue = (): number | null => {
    if (openLimitPreset === 'unlimited') return null;
    if (openLimitPreset === 'custom') return Math.max(1, Math.floor(customOpenLimit || 1));
    return parseInt(openLimitPreset, 10);
  };

  const resolveExpirationInfo = (): { ms: number | null; label: string } => {
    switch (expiryPreset) {
      case '1h':
        return { ms: 60 * 60 * 1000, label: isAr ? 'ساعة واحدة' : '1 Hour' };
      case '24h':
        return { ms: 24 * 60 * 60 * 1000, label: isAr ? '24 ساعة' : '24 Hours' };
      case '7d':
        return { ms: 7 * 24 * 60 * 60 * 1000, label: isAr ? '7 أيام' : '7 Days' };
      case '30d':
        return { ms: 30 * 24 * 60 * 60 * 1000, label: isAr ? '30 يوماً' : '30 Days' };
      case 'custom': {
        const hrs = Math.max(1, Math.floor(customExpiryHours || 1));
        return {
          ms: hrs * 60 * 60 * 1000,
          label: isAr ? `${hrs} ساعة (مخصص)` : `${hrs} Hours (Custom)`,
        };
      }
      case 'never':
      default:
        return { ms: null, label: isAr ? 'بدون انتهاء' : 'No Expiration' };
    }
  };

  const handleEncryptFile = async () => {
    if (!selectedFile) return;
    setEncryptError(null);

    const strength = evaluatePasswordStrength(password);
    if (strength.isTooShort || strength.isCommon) {
      setEncryptError(
        strength.isCommon
          ? isAr
            ? 'كلمة المرور شائعة جداً وسهلة التخمين. يرجى اختيار كلمة مرور أقوى ومميزة.'
            : 'Common weak password. Please choose a stronger password.'
          : isAr
          ? 'يجب أن تتكون كلمة المرور من 10 أحرف أو أرقام على الأقل لضمان حماية التشفير.'
          : 'Password must be at least 10 characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      setEncryptError(
        isAr
          ? 'كلمة المرور وتأكيد كلمة المرور غير متطابقين.'
          : 'Password and Confirm Password do not match.'
      );
      return;
    }

    if (!auth.currentUser) {
      setEncryptError(
        isAr
          ? 'يرجى تسجيل الدخول أولاً لتشفير وحماية المستندات وحفظها في حسابك.'
          : 'Please sign in to encrypt and protect files.'
      );
      return;
    }

    setIsEncrypting(true);
    try {
      const fileBase64 = await fileToBase64(selectedFile);
      const maxOpens = resolveMaxOpensValue();
      const exp = resolveExpirationInfo();

      const effectiveOffline = Boolean(
        isOfflineMode && openLimitPreset === 'unlimited' && expiryPreset === 'never'
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      const authHeader = await getAuthHeader();

      const res = await fetch('/api/protector/encrypt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader,
        },
        signal: controller.signal,
        body: JSON.stringify({
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          fileSize: selectedFile.size,
          fileBase64,
          password,
          confirmPassword,
          maxOpens,
          expirationMs: exp.ms,
          expirationLabel: exp.label,
          isOfflineMode: effectiveOffline,
        }),
      });
      clearTimeout(timer);

      let data: any = null;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        // Non-JSON response
      }

      if (res.ok && data && data.ok) {
        setEncryptedResult({
          file: data.file,
          secureFileBase64: data.secureFileBase64,
          interactiveHtmlBase64: data.interactiveHtmlBase64,
          interactiveFileName:
            data.interactiveFileName || `${data.file.originalName}.protected.html`,
        });
        fetchDashboardFiles();

        if (onRecordHistory) {
          onRecordHistory(
            isAr ? 'تشفير وحماية ملف (AES-256-GCM)' : 'File Encrypted (AES-256-GCM)',
            `${data.file.originalName} -> ${data.file.secureFileName} (${
              data.file.maxOpens === null ? 'Unlimited' : `${data.file.maxOpens} opens`
            })`
          );
        }
        setEncryptStep(3);
      } else {
        setEncryptError(
          data?.error ||
            (res.status === 413
              ? isAr
                ? 'حجم الملف كبير جداً ويتجاوز سعة خادم التشفير (الحد الأقصى 75 ميجابايت).'
                : 'File size exceeds server upload limit (max 75MB).'
              : isAr
              ? 'فشل تشفير الملف على الخادم. يرجى التحقق والمحاولة مجدداً.'
              : 'Failed to encrypt file on the server. Please try again.')
        );
      }
    } catch (err: any) {
      console.error('Encrypt request error:', err);
      setEncryptError(
        isAr
          ? 'تعذر الاتصال بالخادم لتشفير الملف. يرجى التأكد من اتصالك بالإنترنت.'
          : 'Could not connect to the server. Please check your internet connection.'
      );
    } finally {
      setIsEncrypting(false);
    }
  };

  // ---------------- OPEN .SECURE OR .PROTECTED.HTML FILE LOGIC ----------------
  const handleSelectSecureFile = async (file: File) => {
    setOpenErrorMsg(null);
    setUnavailableScreen(null);
    setOpenedViewerData(null);
    setOpenPasswordInput('');

    try {
      const text = await file.text();
      let parsed: Record<string, unknown> | null = null;

      // Support both new <script type="application/json" id="toolnova-container"> and legacy comments / raw JSON
      const scriptMatch = text.match(
        /<script[^>]*id=["']toolnova-container["'][^>]*>([\s\S]*?)<\/script>/i
      );
      const embeddedMatch = text.match(
        /<!--TOOLNOVA_SECURE_CONTAINER_START([\s\S]*?)TOOLNOVA_SECURE_CONTAINER_END-->/
      );

      if (scriptMatch && scriptMatch[1]) {
        parsed = JSON.parse(scriptMatch[1]);
      } else if (embeddedMatch && embeddedMatch[1]) {
        parsed = JSON.parse(embeddedMatch[1]);
      } else {
        parsed = JSON.parse(text);
      }

      if (
        !parsed ||
        (parsed.magic !== 'TOOLNOVA-SECURE-FILE-V2' && parsed.magic !== 'TOOLNOVA-SECURE-FILE-V1') ||
        !parsed.fileId
      ) {
        setOpenErrorMsg(
          isAr
            ? 'هذا الملف ليس ملفاً مشفراً صالحاً بصيغة (.protected.html أو .secure) الخاصة بالنظام.'
            : 'Invalid protected file format.'
        );
        return;
      }

      const hmacHex = (parsed.containerHmacHex as string) || (parsed.encryption as any)?.signature;

      setSecureContainerData({
        fileId: String(parsed.fileId),
        originalName:
          String(parsed.originalName || '') ||
          file.name.replace(/\.(protected\.html|secure)$/i, ''),
        secureFileName: file.name,
        extension: String(parsed.extension || '.docx'),
        fileSize: Number(parsed.fileSize || file.size),
        maxOpens: (parsed.maxOpens as number | null) ?? null,
        expirationLabel: String(parsed.expirationLabel || (isAr ? 'غير محدد' : 'N/A')),
        ciphertextBase64: parsed.ciphertextBase64 as string | undefined,
        containerHmacHex: hmacHex,
      } as any);

      // Inspect current server status
      await inspectFileById(String(parsed.fileId), hmacHex);
    } catch {
      setOpenErrorMsg(
        isAr
          ? 'تعذر قراءة الملف المحمي. يرجى التأكد من اختيار الملف المشفر (.protected.html أو .secure) الذي قمت بتحميله.'
          : 'Could not parse protected file. Please select a valid .protected.html or .secure file.'
      );
    }
  };

  const inspectFileById = async (fileId: string, containerHmacHex?: string) => {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/protector/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ fileId, containerHmacHex }),
      });
      const data = await res.json();
      if (!res.ok || !data.exists) {
        setUnavailableScreen({
          reasonTitle: isAr ? '🔒 الملف غير متاح' : '🔒 File Unavailable',
          reasonSubtitle:
            data.error ||
            (isAr
              ? 'لقد انتهت صلاحية الوصول إلى هذا الملف.'
              : 'Access to this file has expired.'),
          code: 'DELETED',
        });
        return;
      }

      const f: ProtectedFileSummary = data.file;
      setInspectedRecord(f);

      if (f.status === 'expired' || f.status === 'exhausted' || f.status === 'revoked') {
        setUnavailableScreen({
          reasonTitle: isAr ? '🔒 الملف غير متاح' : '🔒 File Unavailable',
          reasonSubtitle:
            f.status === 'exhausted'
              ? isAr
                ? 'انتهت صلاحية فتح هذا الملف. لقد انتهت صلاحية الوصول إلى هذا الملف لاستهلاك جميع مرات الفتح المسموحة.'
                : 'This file has reached its maximum open limit and is no longer available.'
              : isAr
              ? 'لقد انتهت صلاحية الوصول إلى هذا الملف.'
              : 'Access to this file has expired or been revoked.',
          code: f.status.toUpperCase(),
        });
      }
    } catch (e) {
      console.error('Inspect error:', e);
    }
  };

  const handleLoadIntoOpener = async (summary: ProtectedFileSummary) => {
    setOpenErrorMsg(null);
    setUnavailableScreen(null);
    setOpenedViewerData(null);
    setOpenPasswordInput('');
    setSecureContainerData({
      fileId: summary.fileId,
      originalName: summary.originalName,
      secureFileName: summary.secureFileName,
      extension: summary.extension,
      fileSize: summary.fileSize,
      maxOpens: summary.maxOpens,
      expirationLabel: summary.expirationLabel,
    });
    setActiveTab('open');
    await inspectFileById(summary.fileId);
  };

  const handleUnlockAndOpenFile = async () => {
    if (!secureContainerData) return;
    setOpenErrorMsg(null);

    if (!openPasswordInput.trim()) {
      setOpenErrorMsg(isAr ? 'الرجاء إدخال كلمة المرور.' : 'Please enter the password.');
      return;
    }

    setIsOpeningFile(true);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch('/api/protector/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          fileId: secureContainerData.fileId,
          password: openPasswordInput,
          containerHmacHex: (secureContainerData as any).containerHmacHex,
          ciphertextBase64: secureContainerData.ciphertextBase64,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.allowed) {
        if (
          data.code === 'OPEN_LIMIT_REACHED' ||
          data.code === 'EXPIRED_TIME' ||
          data.code === 'REVOKED' ||
          data.code === 'DELETED'
        ) {
          setUnavailableScreen({
            reasonTitle: isAr ? '🔒 الملف غير متاح' : '🔒 File Unavailable',
            reasonSubtitle:
              data.code === 'OPEN_LIMIT_REACHED'
                ? isAr
                  ? 'انتهت صلاحية فتح هذا الملف. لقد انتهت صلاحية الوصول إلى هذا الملف.'
                  : 'Open limit reached. Access to this file has expired.'
                : data.error ||
                  (isAr
                    ? 'لقد انتهت صلاحية الوصول إلى هذا الملف.'
                    : 'Access to this file has expired.'),
            code: data.code,
          });
          fetchDashboardFiles();
          return;
        }

        setOpenErrorMsg(
          data.error || (isAr ? 'كلمة المرور غير صحيحة.' : 'Incorrect password.')
        );
        return;
      }

      // Success! File opened and slot atomically consumed
      setActiveExcelSheetIdx(0);
      setActiveSlideIdx(0);
      setOpenedViewerData({
        file: data.file,
        viewer: data.viewer,
        message: data.message,
      });
      setInspectedRecord(data.file);
      fetchDashboardFiles();

      if (onRecordHistory) {
        onRecordHistory(
          isAr ? 'فتح ملف مشفر (.secure)' : 'Opened Protected File (.secure)',
          `${data.file.originalName} (Open #${data.file.usedOpens}/${
            data.file.maxOpens ?? '∞'
          })`
        );
      }
    } catch (e) {
      console.error('Unlock error:', e);
      setOpenErrorMsg(
        isAr
          ? 'حدث خطأ أثناء الاتصال بالخادم لفك تشفير الملف.'
          : 'Server error while unlocking file.'
      );
    } finally {
      setIsOpeningFile(false);
    }
  };

  // ---------------- DASHBOARD ACTIONS ----------------
  const handleRevokeFile = async (fileId: string) => {
    try {
      const authHeader = await getAuthHeader();
      await fetch('/api/protector/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ fileId }),
      });
      fetchDashboardFiles();
    } catch (e) {
      console.error('Revoke error:', e);
    }
  };

  const handleRecreateFile = async (item: ProtectedFileSummary) => {
    try {
      const authHeader = await getAuthHeader();
      await fetch('/api/protector/recreate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({
          fileId: item.fileId,
          maxOpens: item.maxOpens,
        }),
      });
      fetchDashboardFiles();
    } catch (e) {
      console.error('Recreate error:', e);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const authHeader = await getAuthHeader();
      await fetch(`/api/protector/${fileId}`, {
        method: 'DELETE',
        headers: { ...authHeader },
      });
      if (selectedLogsFile?.fileId === fileId) {
        setSelectedLogsFile(null);
      }
      fetchDashboardFiles();
    } catch (e) {
      console.error('Delete error:', e);
    }
  };

  const handleDownloadSecureFromDashboard = async (
    fileId: string,
    format: 'interactive' | 'secure' = 'interactive'
  ) => {
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/protector/download-secure/${fileId}`, {
        headers: { ...authHeader },
      });
      const data = await res.json();
      if (data.ok) {
        if (format === 'interactive' && data.interactiveHtmlBase64) {
          downloadBase64File(
            data.interactiveHtmlBase64,
            data.interactiveFileName || `${data.secureFileName}.html`,
            'text/html;charset=utf-8'
          );
        } else if (data.secureFileBase64) {
          downloadBase64File(data.secureFileBase64, data.secureFileName);
        }
      }
    } catch (e) {
      console.error('Download secure error:', e);
    }
  };

  const resetEncryptWizard = () => {
    setSelectedFile(null);
    setPassword('');
    setConfirmPassword('');
    setEncryptError(null);
    setEncryptedResult(null);
    setEncryptStep(1);
  };

  const renderStatusText = (status: ProtectedFileSummary['status']) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {isAr ? 'نشط' : 'Active'}
          </span>
        );
      case 'exhausted':
        return (
          <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            {isAr ? 'منتهي (استُنفدت الفتحات)' : 'Exhausted'}
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {isAr ? 'منتهي الصلاحية' : 'Expired'}
          </span>
        );
      case 'revoked':
        return (
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-bold text-xs">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            {isAr ? 'ملغى' : 'Revoked'}
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto"
    >
      <div className="relative w-full max-w-5xl bg-[#FAFAFC] dark:bg-[#0B0F19] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Modal Header */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-rose-950/60 border border-red-200 dark:border-rose-800 flex items-center justify-center text-[#e5322d]">
              <FolderLock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#111827] dark:text-white flex items-center gap-2">
                <span>
                  {isAr
                    ? '🔐 تشفير الملفات وحمايتها (File Protector)'
                    : '🔐 File Protector — Encryption & Access Control'}
                </span>
              </h2>
              <p className="text-xs text-[#64748b] dark:text-slate-400">
                {isAr
                  ? 'تشفير حقيقي AES-256-GCM · تجزئة Argon2id · تحكم ذري صارم بعدد مرات الفتح عبر الخادم'
                  : 'AES-256-GCM Encryption · Argon2id Key Derivation · Server-Enforced Atomic Open Limits'}
              </p>
            </div>
          </div>

          {/* Navigation Tabs inside File Protector */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('encrypt')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'encrypt'
                  ? 'bg-white dark:bg-slate-900 text-[#e5322d] shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{isAr ? 'تشفير ملف جديد' : 'Encrypt File'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('open');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'open'
                  ? 'bg-white dark:bg-slate-900 text-[#e5322d] shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>{isAr ? 'فتح ملف محمي (.secure)' : 'Open Protected File'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('dashboard');
                fetchDashboardFiles();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-[#e5322d] shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>{isAr ? 'لوحة التحكم' : 'Dashboard'}</span>
              {dashboardFiles.length > 0 && (
                <span className="font-mono text-[11px] text-slate-400">
                  ({dashboardFiles.length})
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7">
          {/* ================================================================
              TAB 1: ENCRYPT & PROTECT FILE (3-STEP WIZARD)
             ================================================================ */}
          {activeTab === 'encrypt' && (
            <div className="max-w-3xl mx-auto">
              {/* Stepper Progress */}
              <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                {[
                  {
                    step: 1,
                    title: isAr ? '1. اختيار الملف' : '1. Select File',
                    sub: isAr ? 'Word, Excel, PPT, PDF, ZIP' : 'Word, Excel, PPT, PDF, ZIP',
                  },
                  {
                    step: 2,
                    title: isAr ? '2. إعداد الحماية' : '2. Protection Settings',
                    sub: isAr ? 'كلمة المرور · عدد الفتحات · الصلاحية' : 'Password · Open Limit · Expiry',
                  },
                  {
                    step: 3,
                    title: isAr ? '3. تحميل الملف المشفر' : '3. Download .secure',
                    sub: isAr ? 'تشفير AES-256-GCM جاهز' : 'AES-256-GCM Ready',
                  },
                ].map((item, idx) => {
                  const isCurrent = encryptStep === item.step;
                  const isDone = encryptStep > item.step;
                  return (
                    <React.Fragment key={item.step}>
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-extrabold transition-colors ${
                            isCurrent
                              ? 'bg-[#e5322d] text-white'
                              : isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="w-4 h-4" /> : item.step}
                        </div>
                        <div>
                          <div
                            className={`text-xs sm:text-sm font-bold ${
                              isCurrent
                                ? 'text-[#111827] dark:text-white'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-400 hidden sm:block">
                            {item.sub}
                          </div>
                        </div>
                      </div>
                      {idx < 2 && (
                        <div className="hidden sm:block h-px flex-1 mx-4 bg-slate-200 dark:bg-slate-800" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* STEP 1: DRAG & DROP FILE SELECTION */}
              {encryptStep === 1 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs transition-all">
                  {!currentUser && (
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200">
                      <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="font-bold">
                          {isAr
                            ? 'يرجى تسجيل الدخول أولاً لتشفير وحماية ملفاتك وربطها بحسابك والتحكم بمرات فتحها بأمان.'
                            : 'Please sign in to encrypt and protect files linked to your account.'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => signInWithGoogle()}
                        className="px-3.5 py-1.5 bg-[#e5322d] hover:bg-[#d12823] text-white rounded-lg font-extrabold text-xs cursor-pointer inline-flex items-center gap-1.5 shrink-0 shadow-2xs"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>{isAr ? 'تسجيل الدخول باستخدام Google' : 'Sign In with Google'}</span>
                      </button>
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".docx,.xlsx,.pptx,.pdf,.zip"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleSelectRawFile(f);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />

                  {!selectedFile ? (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDraggingUpload(true);
                      }}
                      onDragLeave={() => setIsDraggingUpload(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDraggingUpload(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleSelectRawFile(f);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all ${
                        isDraggingUpload
                          ? 'border-[#e5322d] bg-red-50/40 dark:bg-rose-950/20 scale-[1.01]'
                          : 'border-slate-300 dark:border-slate-700 hover:border-[#e5322d] hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-rose-950/60 text-[#e5322d] flex items-center justify-center mx-auto mb-4 shadow-2xs">
                        <Upload className="w-7 h-7" />
                      </div>
                      <h3 className="text-base sm:text-lg font-extrabold text-[#111827] dark:text-white mb-2">
                        {isAr
                          ? 'اسحب الملف هنا أو اختر ملفاً من جهازك'
                          : 'Drag & drop your file here or choose a file from your device'}
                      </h3>
                      <p className="text-xs text-[#64748b] dark:text-slate-400 mb-5">
                        {isAr
                          ? 'الملفات المدعومة: Word (.docx) · Excel (.xlsx) · PowerPoint (.pptx) · PDF (.pdf) · ZIP (.zip) — حتى 50 ميجابايت'
                          : 'Supported formats: Word (.docx) · Excel (.xlsx) · PowerPoint (.pptx) · PDF (.pdf) · ZIP (.zip) — up to 50 MB'}
                      </p>

                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                          }}
                          className="px-5 py-2.5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          <span>{isAr ? 'اختر ملفاً من جهازك' : 'Choose File'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateSampleDocx();
                          }}
                          className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#e5322d]" />
                          <span>
                            {isAr
                              ? 'تجربة سريعة بملف Word جاهز (.docx)'
                              : 'Try with Sample Word (.docx)'}
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Selected File Details Card */
                    <div className="space-y-5">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {isAr
                              ? 'تم اختيار الملف بنجاح وهو جاهز لإعداد الحماية'
                              : 'File selected and ready for protection setup'}
                          </span>
                        </div>
                        <span className="text-xs font-mono text-slate-400">
                          AES-256-GCM Ready
                        </span>
                      </div>

                      {(() => {
                        const info = getFileTypeLabel(selectedFile.name, isAr);
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                            <div>
                              <div className="text-[11px] text-slate-400 mb-1">
                                {isAr ? 'اسم الملف' : 'File Name'}
                              </div>
                              <div className="text-sm font-extrabold text-[#111827] dark:text-white break-all">
                                {selectedFile.name}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-slate-400 mb-1">
                                {isAr ? 'نوع الملف' : 'File Type'}
                              </div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {info.label}
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] text-slate-400 mb-1">
                                {isAr ? 'حجم الملف' : 'File Size'}
                              </div>
                              <div className="text-sm font-mono font-bold text-[#111827] dark:text-white">
                                {formatBytes(selectedFile.size)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تغيير الملف' : 'Change File'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setEncryptStep(2)}
                          className="px-6 py-2.5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer inline-flex items-center gap-2"
                        >
                          <span>{isAr ? 'متابعة لإعداد الحماية' : 'Continue'}</span>
                          {isAr ? (
                            <ChevronLeft className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: PROTECTION SETTINGS (PASSWORD + OPEN LIMIT + EXPIRATION) */}
              {encryptStep === 2 && selectedFile && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xs space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div>
                      <h3 className="text-base font-extrabold text-[#111827] dark:text-white">
                        {isAr ? 'الخطوة الثانية: إعداد الحماية والتشفير' : 'Step 2: Protection & Encryption Settings'}
                      </h3>
                      <p className="text-xs text-[#64748b] dark:text-slate-400">
                        {selectedFile.name} · {formatBytes(selectedFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEncryptStep(1)}
                      className="text-xs font-bold text-slate-500 hover:text-[#e5322d] cursor-pointer"
                    >
                      {isAr ? 'تغيير الملف' : 'Change File'}
                    </button>
                  </div>

                  {/* Password & Confirm Password */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-[#111827] dark:text-slate-200 mb-2">
                        {isAr ? 'كلمة المرور' : 'Password'}
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-[#111827] dark:text-white focus:outline-none focus:border-[#e5322d]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((p) => !p)}
                          className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>

                      {/* Arabic Password Strength Meter */}
                      {password.length > 0 && (() => {
                        const strength = evaluatePasswordStrength(password);
                        return (
                          <div className="mt-2 space-y-1.5 text-right">
                            <div className="flex items-center justify-between text-[11px] font-bold">
                              <span className={strength.color}>
                                {isAr ? strength.labelAr : strength.labelEn}
                              </span>
                              <span className="text-slate-500 font-mono text-[10px]">
                                {password.length} / 10+
                              </span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                              {[1, 2, 3, 4].map((step) => (
                                <div
                                  key={step}
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    strength.score >= step ? strength.bg : 'bg-transparent'
                                  }`}
                                />
                              ))}
                            </div>
                            {strength.isTooShort && (
                              <p className="text-[10px] text-rose-500 font-bold">
                                {isAr
                                  ? '⚠️ الحد الأدنى لكلمة المرور هو 10 أحرف لضمان حماية التشفير.'
                                  : '⚠️ Minimum password length is 10 characters.'}
                              </p>
                            )}
                            {strength.isCommon && (
                              <p className="text-[10px] text-rose-500 font-bold">
                                {isAr
                                  ? '⚠️ كلمة المرور شائعة جداً، يرجى اختيار كلمة مرور غير متوقعة.'
                                  : '⚠️ Common password detected. Please choose a more secure password.'}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-[#111827] dark:text-slate-200 mb-2">
                        {isAr ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                      </label>
                      <div className="relative">
                        <KeyRound className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3.5 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pr-10 pl-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-[#111827] dark:text-white focus:outline-none focus:border-[#e5322d]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Open Limit Options */}
                  <div>
                    <label className="block text-xs font-extrabold text-[#111827] dark:text-slate-200 mb-2">
                      {isAr ? 'عدد مرات الفتح المسموحة' : 'Allowed Number of Opens'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: '1', label: isAr ? 'مرة واحدة (1)' : '1 Time Only' },
                        { id: '2', label: isAr ? 'مرتان (2)' : '2 Times' },
                        { id: '5', label: isAr ? '5 مرات' : '5 Times' },
                        { id: '10', label: isAr ? '10 مرات' : '10 Times' },
                        { id: 'custom', label: isAr ? 'عدد مخصص' : 'Custom Limit' },
                        { id: 'unlimited', label: isAr ? 'بدون حد' : 'Unlimited' },
                      ].map((opt) => {
                        const active = openLimitPreset === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setOpenLimitPreset(
                                opt.id as '1' | '2' | '5' | '10' | 'custom' | 'unlimited'
                              )
                            }
                            className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              active
                                ? 'bg-red-50/90 dark:bg-rose-950/60 border-[#e5322d] text-[#e5322d] dark:text-rose-300 shadow-2xs'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {openLimitPreset === 'custom' && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {isAr ? 'حدد عدد المرات:' : 'Enter max opens:'}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={customOpenLimit}
                          onChange={(e) =>
                            setCustomOpenLimit(Math.max(1, parseInt(e.target.value || '1', 10)))
                          }
                          className="w-28 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {/* File Expiration Duration Options */}
                  <div>
                    <label className="block text-xs font-extrabold text-[#111827] dark:text-slate-200 mb-2">
                      {isAr ? 'مدة صلاحية الملف' : 'File Expiration Duration'}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {[
                        { id: '1h', label: isAr ? 'ساعة واحدة' : '1 Hour' },
                        { id: '24h', label: isAr ? '24 ساعة' : '24 Hours' },
                        { id: '7d', label: isAr ? '7 أيام' : '7 Days' },
                        { id: '30d', label: isAr ? '30 يوماً' : '30 Days' },
                        { id: 'never', label: isAr ? 'بدون انتهاء' : 'Never Expires' },
                        { id: 'custom', label: isAr ? 'مدة مخصصة' : 'Custom Duration' },
                      ].map((opt) => {
                        const active = expiryPreset === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setExpiryPreset(
                                opt.id as '1h' | '24h' | '7d' | '30d' | 'never' | 'custom'
                              )
                            }
                            className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                              active
                                ? 'bg-red-50/90 dark:bg-rose-950/60 border-[#e5322d] text-[#e5322d] dark:text-rose-300 shadow-2xs'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {expiryPreset === 'custom' && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          {isAr ? 'عدد الساعات:' : 'Duration in hours:'}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={8760}
                          value={customExpiryHours}
                          onChange={(e) =>
                            setCustomExpiryHours(
                              Math.max(1, parseInt(e.target.value || '1', 10))
                            )
                          }
                          className="w-28 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
                        />
                      </div>
                    )}
                  </div>

                  {/* Offline Mode Opt-in (Only for Unrestricted Files) */}
                  {openLimitPreset === 'unlimited' && expiryPreset === 'never' ? (
                    <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/20 text-right space-y-2">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isOfflineMode}
                          onChange={(e) => setIsOfflineMode(e.target.checked)}
                          className="mt-1 rounded text-[#e5322d] focus:ring-[#e5322d] w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <span className="text-xs font-extrabold text-amber-900 dark:text-amber-200 block">
                            {isAr
                              ? 'نمط غير متصل بالإنترنت (لا يمكن فرض حدود الفتح أو الصلاحية)'
                              : 'Offline mode (limits NOT enforced)'}
                          </span>
                          <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 mt-1.5 leading-relaxed font-medium">
                            {isAr
                              ? '⚠️ تحذير أمني: في النمط غير المتصل، سيتم تضمين الملف المشفر داخل ملف HTML لتتمكن من فتحه بدون إنترنت. لن يتمكن الخادم من فرض عدد مرات الفتح أو انتهاء الصلاحية أو إلغاء الصلاحية فورياً.'
                              : '⚠️ Security warning: In offline mode, encrypted data is embedded in the HTML. The server cannot enforce open counts, expiration, or immediate revocation.'}
                          </p>
                        </div>
                      </label>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-right flex items-center gap-2.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        {isAr
                          ? '🛡️ قيود حماية خادم مشددة: حدود الفتح وانتهاء الصلاحية مفروضة تقنياً ولا يمكن التلاعب بها عبر المتصفح.'
                          : '🛡️ Enforceable server limits: Open limits and expiration are strictly verified by the server.'}
                      </span>
                    </div>
                  )}

                  {/* Security Architecture Note */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5 leading-relaxed">
                    <Info className="w-4 h-4 text-[#e5322d] shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-[#111827] dark:text-white">
                        {isAr
                          ? 'كيف تضمن تقنية التشفير الحماية المطلقة؟ '
                          : 'Cryptographic Security Guarantees: '}
                      </strong>
                      {isAr
                        ? 'يتم تشفير الملف بخوارزمية AES-256-GCM مع مفتاح تشفير عشوائي مستقل ومحمي بمفتاح KEK مشتق عبر Argon2id (64 ميجابايت). للملفات ذات القيود المحددة، لا يتم تضمين نصوص التشفير محلياً بل تُفك حصراً عبر الخادم عند استيفاء الصلاحيات والتحقق من توقيع HMAC.'
                        : 'Files are encrypted using AES-256-GCM and enveloped with Argon2id (64 MiB). For restricted files, decryptable data is never embedded offline, preventing any bypass.'}
                    </div>
                  </div>

                  {encryptError && (
                    <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{encryptError}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setEncryptStep(1)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 cursor-pointer"
                    >
                      {isAr ? 'رجوع' : 'Back'}
                    </button>

                    <button
                      type="button"
                      disabled={isEncrypting}
                      onClick={handleEncryptFile}
                      className="px-7 py-3 rounded-xl bg-[#e5322d] hover:bg-[#d12823] disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      <span>
                        {isEncrypting
                          ? isAr
                            ? 'جاري التشفير عبر AES-256-GCM...'
                            : 'Encrypting with AES-256-GCM...'
                          : isAr
                          ? '🔐 تشفير الملف'
                          : '🔐 Encrypt File'}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: ENCRYPTION SUCCESS & DOWNLOAD .SECURE FILE */}
              {encryptStep === 3 && encryptedResult && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs text-center space-y-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-extrabold text-[#111827] dark:text-white mb-1">
                      {isAr ? '✅ تم تشفير الملف بنجاح' : '✅ File Encrypted Successfully'}
                    </h3>
                    <p className="text-xs text-[#64748b] dark:text-slate-400">
                      {isAr
                        ? 'تم إنشاء حاوية التشفير (.secure) وحفظ قواعد الفتح الذرية في قاعدة البيانات.'
                        : 'Your .secure encrypted file is ready and registered in the atomic access database.'}
                    </p>
                  </div>

                  <div className="max-w-lg mx-auto bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 text-start space-y-3 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
                      <span className="text-slate-500">{isAr ? 'اسم الملف:' : 'File Name:'}</span>
                      <span className="font-extrabold text-[#111827] dark:text-white">
                        {encryptedResult.file.originalName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
                      <span className="text-slate-500">
                        {isAr ? 'الملف المشفر:' : 'Encrypted File:'}
                      </span>
                      <span className="font-mono font-bold text-[#e5322d]">
                        {encryptedResult.file.secureFileName}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
                      <span className="text-slate-500">
                        {isAr ? 'عدد مرات الفتح:' : 'Allowed Opens:'}
                      </span>
                      <span className="font-extrabold text-[#111827] dark:text-white">
                        {encryptedResult.file.maxOpens === null
                          ? isAr
                            ? 'بدون حد'
                            : 'Unlimited'
                          : encryptedResult.file.maxOpens}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-200/70 dark:border-slate-700 pb-2.5">
                      <span className="text-slate-500">{isAr ? 'الصلاحية:' : 'Expiration:'}</span>
                      <span className="font-extrabold text-[#111827] dark:text-white">
                        {encryptedResult.file.expirationLabel}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        {isAr ? 'خوارزمية التشفير:' : 'Encryption:'}
                      </span>
                      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">
                        AES-256-GCM + Argon2id
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
                    {/* Primary Download: Interactive Self-Opening Protected File (works on double-click on PC/Mobile!) */}
                    <button
                      type="button"
                      onClick={() => {
                        if (encryptedResult.interactiveHtmlBase64) {
                          downloadBase64File(
                            encryptedResult.interactiveHtmlBase64,
                            encryptedResult.interactiveFileName ||
                              `${encryptedResult.file.originalName}.protected.html`,
                            'text/html;charset=utf-8'
                          );
                        } else {
                          downloadBase64File(
                            encryptedResult.secureFileBase64,
                            encryptedResult.file.secureFileName
                          );
                        }
                      }}
                      className="px-7 py-3.5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs sm:text-sm font-extrabold shadow-sm transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>
                        {isAr
                          ? '⬇️ تحميل الملف المحمي التفاعلي (يفتح مباشرة ويطلب الكود عند النقر عليه)'
                          : '⬇️ Download Interactive Protected File (Prompts for Password on Double-Click)'}
                      </span>
                    </button>

                    {/* Secondary Download: Raw .secure container */}
                    <button
                      type="button"
                      onClick={() =>
                        downloadBase64File(
                          encryptedResult.secureFileBase64,
                          encryptedResult.file.secureFileName
                        )
                      }
                      className="px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Download className="w-3.5 h-3.5 text-[#e5322d]" />
                      <span>
                        {isAr
                          ? `تحميل حاوية (${encryptedResult.file.secureFileName})`
                          : `Download Raw (${encryptedResult.file.secureFileName})`}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLoadIntoOpener(encryptedResult.file)}
                      className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-extrabold transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Unlock className="w-4 h-4" />
                      <span>
                        {isAr
                          ? 'تجربة فتح الملف المحمي الآن'
                          : 'Test Opening Protected File Now'}
                      </span>
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={resetEncryptWizard}
                      className="text-xs font-bold text-slate-500 hover:text-[#e5322d] underline underline-offset-4 cursor-pointer"
                    >
                      {isAr ? 'تشفير ملف آخر' : 'Encrypt another file'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 2: OPEN PROTECTED FILE (.SECURE) & SECURE VIEWER
             ================================================================ */}
          {activeTab === 'open' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <input
                ref={secureFileInputRef}
                type="file"
                accept=".secure,.html,text/html,application/json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleSelectSecureFile(f);
                  e.target.value = '';
                }}
                className="hidden"
              />

              {/* 1. If no .secure file selected yet */}
              {!secureContainerData && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-6">
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleSelectSecureFile(f);
                    }}
                    onClick={() => secureFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[#e5322d] rounded-2xl p-8 text-center cursor-pointer transition-all hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-[#e5322d] flex items-center justify-center mx-auto mb-3">
                      <Unlock className="w-7 h-7" />
                    </div>
                    <h3 className="text-base sm:text-lg font-extrabold text-[#111827] dark:text-white mb-1.5">
                      {isAr
                        ? 'اختر ملفاً محمياً بامتداد (.secure) لفتحه'
                        : 'Select a protected (.secure) file to open'}
                    </h3>
                    <p className="text-xs text-[#64748b] dark:text-slate-400 mb-5">
                      {isAr
                        ? 'اسحب ملف (.secure) هنا أو اضغط لاختياره من جهازك للتحقق من كلمة المرور والصلاحية وعرضه في العارض الآمن'
                        : 'Drop your .secure file here or click to browse'}
                    </p>
                    <button
                      type="button"
                      className="px-5 py-2.5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs font-extrabold cursor-pointer inline-flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      <span>{isAr ? 'اختيار ملف .secure' : 'Select .secure File'}</span>
                    </button>
                  </div>

                  {openErrorMsg && (
                    <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{openErrorMsg}</span>
                    </div>
                  )}

                  {/* Quick access to recently encrypted files on server */}
                  {dashboardFiles.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-extrabold text-slate-600 dark:text-slate-300 mb-3">
                        {isAr
                          ? 'أو اختر أحد الملفات المشفرة المسجلة لاختبار بوابة الفتح مباشرة:'
                          : 'Or select a registered protected file to test opening:'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {dashboardFiles.slice(0, 6).map((f) => (
                          <button
                            key={f.fileId}
                            type="button"
                            onClick={() => handleLoadIntoOpener(f)}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-[#e5322d] text-start transition-all flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="truncate">
                              <div className="text-xs font-extrabold text-[#111827] dark:text-white truncate">
                                {f.secureFileName}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {isAr ? 'المتبقي:' : 'Remaining:'}{' '}
                                {f.remainingOpens === null ? '∞' : f.remainingOpens} ·{' '}
                                {f.expirationLabel}
                              </div>
                            </div>
                            {renderStatusText(f.status)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. EXPIRED / EXHAUSTED / UNAVAILABLE SCREEN (Requirement #10) */}
              {secureContainerData && unavailableScreen && (
                <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/70 rounded-2xl p-8 sm:p-10 text-center shadow-2xs space-y-5">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[#e5322d] flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-9 h-9" />
                  </div>

                  <div className="space-y-2 max-w-md mx-auto">
                    <h3 className="text-xl font-extrabold text-[#111827] dark:text-white">
                      {isAr ? '🔒 الملف غير متاح' : '🔒 File Unavailable'}
                    </h3>
                    <p className="text-sm font-bold text-[#e5322d] dark:text-rose-400">
                      {isAr
                        ? '"لقد انتهت صلاحية الوصول إلى هذا الملف."'
                        : '"Access to this file has expired."'}
                    </p>
                    <p className="text-xs text-[#64748b] dark:text-slate-400 leading-relaxed">
                      {unavailableScreen.reasonSubtitle}
                    </p>
                  </div>

                  {inspectedRecord && (
                    <div className="max-w-sm mx-auto p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-around">
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {isAr ? 'مرات الفتح المستخدمة' : 'Used Opens'}
                        </span>
                        <span className="font-mono font-extrabold text-sm">
                          {inspectedRecord.usedOpens} / {inspectedRecord.maxOpens ?? '∞'}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {isAr ? 'الفتحات المتبقية' : 'Remaining Opens'}
                        </span>
                        <span className="font-mono font-extrabold text-sm text-rose-600">
                          0
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSecureContainerData(null);
                        setUnavailableScreen(null);
                        setInspectedRecord(null);
                      }}
                      className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                    >
                      {isAr ? 'اختيار ملف محمي آخر' : 'Select Another File'}
                    </button>
                  </div>
                </div>
              )}

              {/* 3. PASSWORD PROMPT GATE (Requirement #5) */}
              {secureContainerData && !unavailableScreen && !openedViewerData && (
                <div className="max-w-md mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xs space-y-5">
                  <div className="text-center space-y-2">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-rose-950/60 border border-red-200 dark:border-rose-800 text-[#e5322d] flex items-center justify-center mx-auto">
                      <Lock className="w-7 h-7" />
                    </div>
                    <h3 className="text-lg font-extrabold text-[#111827] dark:text-white">
                      {isAr ? '🔐 هذا الملف محمي' : '🔐 This File is Protected'}
                    </h3>
                    <p className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 break-all">
                      {secureContainerData.secureFileName}
                    </p>
                  </div>

                  {inspectedRecord && (
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          {isAr ? 'الفتحات المتبقية:' : 'Remaining Opens:'}
                        </span>
                        <span className="font-mono font-extrabold text-[#111827] dark:text-white">
                          {inspectedRecord.remainingOpens === null
                            ? isAr
                              ? 'بدون حد (∞)'
                              : 'Unlimited (∞)'
                            : `${inspectedRecord.remainingOpens} من ${inspectedRecord.maxOpens}`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block">
                          {isAr ? 'مدة الصلاحية:' : 'Expiration:'}
                        </span>
                        <span className="font-bold text-[#111827] dark:text-white">
                          {inspectedRecord.expirationLabel}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-extrabold text-[#111827] dark:text-slate-200 mb-2">
                      {isAr ? 'أدخل كلمة المرور:' : 'Enter Password:'}
                    </label>
                    <div className="relative">
                      <input
                        type={showOpenPassword ? 'text' : 'password'}
                        value={openPasswordInput}
                        onChange={(e) => setOpenPasswordInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUnlockAndOpenFile();
                        }}
                        placeholder="••••••••"
                        autoFocus
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-[#111827] dark:text-white focus:outline-none focus:border-[#e5322d]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenPassword((p) => !p)}
                        className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showOpenPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {openErrorMsg && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{openErrorMsg}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={isOpeningFile}
                    onClick={handleUnlockAndOpenFile}
                    className="w-full py-3 rounded-xl bg-[#e5322d] hover:bg-[#d12823] disabled:opacity-60 text-white text-sm font-extrabold shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>
                      {isOpeningFile
                        ? isAr
                          ? 'جاري التحقق وفك التشفير...'
                          : 'Verifying & Decrypting...'
                        : isAr
                        ? 'فتح الملف'
                        : 'Open File'}
                    </span>
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSecureContainerData(null);
                        setInspectedRecord(null);
                        setOpenErrorMsg(null);
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {isAr ? 'اختيار ملف آخر' : 'Choose another file'}
                    </button>
                  </div>
                </div>
              )}

              {/* 4. SECURE VIEWER AFTER SUCCESSFUL ATOMIC OPEN */}
              {openedViewerData && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  {/* Viewer Top Security Bar */}
                  <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-xs sm:text-sm font-extrabold flex items-center gap-2">
                          <span>{openedViewerData.file.originalName}</span>
                          <span className="text-[11px] font-mono text-emerald-400">
                            [AES-256-GCM Secure Viewer]
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300">
                          {openedViewerData.message}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-mono bg-slate-800 px-3 py-1 rounded-lg border border-slate-700">
                        {isAr ? 'الفتحات المتبقية الآن:' : 'Remaining Opens:'}{' '}
                        <strong
                          className={
                            openedViewerData.file.remainingOpens === 0
                              ? 'text-rose-400'
                              : 'text-emerald-400'
                          }
                        >
                          {openedViewerData.file.remainingOpens === null
                            ? '∞'
                            : openedViewerData.file.remainingOpens}
                        </strong>
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          // Close viewer and re-test opening the same file to demonstrate 1-time open blocking!
                          const currentId = openedViewerData.file.fileId;
                          setOpenedViewerData(null);
                          setOpenPasswordInput('');
                          inspectFileById(currentId);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#e5322d] hover:bg-[#d12823] text-white font-bold cursor-pointer"
                      >
                        {isAr
                          ? 'إغلاق العارض واختبار محاولة فتح ثانية'
                          : 'Close & Test Second Open Attempt'}
                      </button>
                    </div>
                  </div>

                  {/* Viewer Content Canvas (Protected from easy copy/context-menu) */}
                  <div
                    onContextMenu={(e) => e.preventDefault()}
                    className="p-6 min-h-[340px] max-h-[60vh] overflow-y-auto select-none bg-[#FAFAFC] dark:bg-slate-950"
                  >
                    {/* WORD (.DOCX) VIEWER */}
                    {openedViewerData.viewer.viewerType === 'word' && (
                      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-2xs">
                        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 font-bold mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                          <FileText className="w-4 h-4" />
                          <span>
                            {isAr
                              ? 'عارض مستندات Word الآمن (.docx) — وضع القراءة المحمية'
                              : 'Secure Word Document Viewer (.docx) — Protected Read-Only'}
                          </span>
                        </div>
                        <iframe
                          sandbox=""
                          srcDoc={`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1e293b;padding:24px;margin:0;background:#ffffff;}table{border-collapse:collapse;width:100%;margin:14px 0;}th,td{border:1px solid #cbd5e1;padding:8px;}p{margin:8px 0;}</style></head><body>${sanitizeHtml(openedViewerData.viewer.htmlContent || '')}</body></html>`}
                          title="Word Document Viewer"
                          className="w-full min-h-[480px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                        />
                      </div>
                    )}

                    {/* EXCEL (.XLSX) VIEWER */}
                    {openedViewerData.viewer.viewerType === 'excel' &&
                      openedViewerData.viewer.sheets && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                              <FileSpreadsheet className="w-4 h-4" />
                              <span>
                                {isAr
                                  ? 'عارض جداول Excel الآمن (.xlsx)'
                                  : 'Secure Excel Spreadsheet Viewer (.xlsx)'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {openedViewerData.viewer.sheets.map((sh, idx) => (
                                <button
                                  key={sh.name}
                                  type="button"
                                  onClick={() => setActiveExcelSheetIdx(idx)}
                                  className={`px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                                    activeExcelSheetIdx === idx
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  {sh.name}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
                            <table className="w-full text-xs border-collapse">
                              <tbody>
                                {(
                                  openedViewerData.viewer.sheets[activeExcelSheetIdx]?.rows ||
                                  []
                                ).map((row, rIdx) => (
                                  <tr
                                    key={rIdx}
                                    className={
                                      rIdx === 0
                                        ? 'bg-slate-100 dark:bg-slate-800 font-extrabold'
                                        : 'border-t border-slate-100 dark:border-slate-800'
                                    }
                                  >
                                    {row.map((cell, cIdx) => (
                                      <td
                                        key={cIdx}
                                        className="px-3 py-2 border-x border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200"
                                      >
                                        {cell}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    {/* POWERPOINT (.PPTX) VIEWER */}
                    {openedViewerData.viewer.viewerType === 'powerpoint' &&
                      openedViewerData.viewer.slides && (
                        <div className="max-w-3xl mx-auto space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 font-bold">
                              <Presentation className="w-4 h-4" />
                              <span>
                                {isAr
                                  ? `عارض شرائح PowerPoint الآمن — شريحة ${activeSlideIdx + 1} من ${
                                      openedViewerData.viewer.slides.length
                                    }`
                                  : `Secure PowerPoint Viewer — Slide ${activeSlideIdx + 1} of ${
                                      openedViewerData.viewer.slides.length
                                    }`}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={activeSlideIdx === 0}
                                onClick={() => setActiveSlideIdx((i) => Math.max(0, i - 1))}
                                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold disabled:opacity-40 cursor-pointer"
                              >
                                {isAr ? 'السابق' : 'Prev'}
                              </button>
                              <button
                                type="button"
                                disabled={
                                  activeSlideIdx >=
                                  openedViewerData.viewer.slides.length - 1
                                }
                                onClick={() =>
                                  setActiveSlideIdx((i) =>
                                    Math.min(
                                      (openedViewerData.viewer.slides?.length || 1) - 1,
                                      i + 1
                                    )
                                  )
                                }
                                className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold disabled:opacity-40 cursor-pointer"
                              >
                                {isAr ? 'التالي' : 'Next'}
                              </button>
                            </div>
                          </div>

                          {(() => {
                            const slide =
                              openedViewerData.viewer.slides[activeSlideIdx] ||
                              openedViewerData.viewer.slides[0];
                            return (
                              <div className="aspect-video bg-white dark:bg-slate-900 border-2 border-orange-200 dark:border-orange-900/60 rounded-2xl p-8 flex flex-col justify-center shadow-sm">
                                <div className="text-xs font-mono text-orange-500 mb-2">
                                  SLIDE #{slide.slideNumber}
                                </div>
                                <h4 className="text-xl sm:text-2xl font-extrabold text-[#111827] dark:text-white mb-4">
                                  {slide.title}
                                </h4>
                                <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 list-disc list-inside">
                                  {slide.bullets.map((b, idx) => (
                                    <li key={idx}>{b}</li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                    {/* PDF (.PDF) VIEWER */}
                    {openedViewerData.viewer.viewerType === 'pdf' &&
                      openedViewerData.viewer.pdfBase64 && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold text-rose-600 dark:text-rose-400">
                            {isAr
                              ? 'عارض PDF الآمن داخل الجلسة المشفرة'
                              : 'Secure In-Session PDF Viewer'}
                          </div>
                          <iframe
                            title="Secure PDF Viewer"
                            src={`data:application/pdf;base64,${openedViewerData.viewer.pdfBase64}#toolbar=0&navpanes=0`}
                            className="w-full h-[460px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                          />
                        </div>
                      )}

                    {/* ZIP (.ZIP) ARCHIVE INSPECTOR */}
                    {openedViewerData.viewer.viewerType === 'zip' &&
                      openedViewerData.viewer.zipEntries && (
                        <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400">
                            <FileArchive className="w-4 h-4" />
                            <span>
                              {isAr
                                ? `محتويات الأرشيف المحمي (${openedViewerData.viewer.zipEntries.length} عنصر)`
                                : `Protected ZIP Archive Contents (${openedViewerData.viewer.zipEntries.length} entries)`}
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                            {openedViewerData.viewer.zipEntries.map((entry, idx) => (
                              <div
                                key={idx}
                                className="py-2 flex items-center justify-between"
                              >
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {entry.name}
                                </span>
                                <span className="font-mono text-slate-400">
                                  {entry.isDirectory
                                    ? isAr
                                      ? 'مجلد'
                                      : 'Folder'
                                    : formatBytes(entry.sizeBytes)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              TAB 3: PROTECTED FILES DASHBOARD (Requirement #9)
             ================================================================ */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-extrabold text-[#111827] dark:text-white">
                    {isAr
                      ? 'لوحة التحكم بالملفات المحمية (Protected Files Dashboard)'
                      : 'Protected Files Dashboard'}
                  </h3>
                  <p className="text-xs text-[#64748b] dark:text-slate-400">
                    {isAr
                      ? 'راقب عدد مرات الفتح، الفتحات المتبقية، تاريخ آخر فتح، أو قم بإلغاء صلاحية أي ملف فوراً.'
                      : 'Monitor open counts, remaining opens, last opened time, or revoke/recreate files.'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fetchDashboardFiles}
                    className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isLoadingDashboard ? 'animate-spin' : ''}`}
                    />
                    <span>{isAr ? 'تحديث' : 'Refresh'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      resetEncryptWizard();
                      setActiveTab('encrypt');
                    }}
                    className="px-4 py-2 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isAr ? 'تشفير ملف جديد' : 'New Encrypted File'}</span>
                  </button>
                </div>
              </div>

              {!currentUser ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-[#e5322d] flex items-center justify-center mx-auto text-2xl font-black">
                    🔐
                  </div>
                  <div className="text-base font-extrabold text-[#111827] dark:text-white">
                    {isAr
                      ? 'يرجى تسجيل الدخول للوصول إلى لوحة تحكم ملفاتك'
                      : 'Please sign in to access your protected files dashboard'}
                  </div>
                  <p className="text-xs text-[#64748b] dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                    {isAr
                      ? 'لوحة التحكم تعرض حصرياً ملفاتك المشفرة المحمية وإحصائيات الفتح وسجلات الوصول الخاصة بك. سجل الدخول لمتابعتها والتحكم بها.'
                      : 'The dashboard displays only your protected files and open logs. Sign in to monitor and manage permissions.'}
                  </p>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => signInWithGoogle()}
                      className="px-5 py-2.5 rounded-xl bg-[#e5322d] hover:bg-[#d12823] text-white text-xs font-extrabold cursor-pointer inline-flex items-center gap-2 shadow-sm"
                    >
                      <KeyRound className="w-4 h-4" />
                      <span>{isAr ? 'تسجيل الدخول باستخدام Google' : 'Sign In with Google'}</span>
                    </button>
                  </div>
                </div>
              ) : dashboardFiles.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
                  <FolderLock className="w-10 h-10 text-slate-400 mx-auto" />
                  <div className="text-sm font-extrabold text-[#111827] dark:text-white">
                    {isAr
                      ? 'لا توجد ملفات مشفرة في لوحة التحكم حالياً'
                      : 'No protected files yet'}
                  </div>
                  <p className="text-xs text-[#64748b] dark:text-slate-400">
                    {isAr
                      ? 'ابدأ برفع ملف وتشفيره بخوارزمية AES-256-GCM ليظهر هنا مع إحصائيات الفتح المباشرة.'
                      : 'Encrypt your first file with AES-256-GCM to track its open quota here.'}
                  </p>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-start">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-extrabold">
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'الملف' : 'File'}
                          </th>
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'مرات الفتح المسموحة' : 'Allowed Opens'}
                          </th>
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'المستخدم / المتبقي' : 'Used / Remaining'}
                          </th>
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'الصلاحية' : 'Expiration'}
                          </th>
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'الحالة' : 'Status'}
                          </th>
                          <th className="py-3.5 px-4 text-start">
                            {isAr ? 'تاريخ آخر فتح' : 'Last Opened'}
                          </th>
                          <th className="py-3.5 px-4 text-end">
                            {isAr ? 'الإجراءات' : 'Actions'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dashboardFiles.map((item) => (
                          <tr
                            key={item.fileId}
                            className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-extrabold text-[#111827] dark:text-white">
                                {item.originalName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {formatBytes(item.fileSize)} · ID: {item.fileId.slice(0, 8)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-300">
                              {item.maxOpens === null
                                ? isAr
                                  ? 'بدون حد (∞)'
                                  : 'Unlimited'
                                : item.maxOpens}
                            </td>

                            <td className="py-3.5 px-4 font-mono">
                              <span className="text-slate-500">
                                {isAr ? 'المستخدم:' : 'Used:'} <strong>{item.usedOpens}</strong>
                              </span>
                              <span className="mx-1.5 text-slate-300">·</span>
                              <span
                                className={
                                  item.remainingOpens === 0
                                    ? 'text-rose-600 font-extrabold'
                                    : 'text-emerald-600 dark:text-emerald-400 font-extrabold'
                                }
                              >
                                {isAr ? 'المتبقي:' : 'Rem:'}{' '}
                                {item.remainingOpens === null ? '∞' : item.remainingOpens}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 font-bold text-slate-700 dark:text-slate-300">
                              {item.expirationLabel}
                            </td>

                            <td className="py-3.5 px-4">{renderStatusText(item.status)}</td>

                            <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                              {item.lastOpenedAt ? (
                                <span className="inline-flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  {new Date(item.lastOpenedAt).toLocaleString(
                                    isAr ? 'ar-MA' : 'en-US',
                                    {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    }
                                  )}
                                </span>
                              ) : isAr ? (
                                'لم يُفتح بعد'
                              ) : (
                                'Never opened'
                              )}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleLoadIntoOpener(item)}
                                  title={isAr ? 'فتح / اختبار الملف' : 'Open / Test File'}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Unlock className="w-3.5 h-3.5 text-[#e5322d]" />
                                  <span>{isAr ? 'فتح' : 'Open'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDownloadSecureFromDashboard(item.fileId, 'interactive')
                                  }
                                  title={
                                    isAr
                                      ? 'تحميل الملف المحمي التفاعلي (يفتح مباشرة ويطلب كلمة السر)'
                                      : 'Download Interactive Protected File'
                                  }
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-[#e5322d] hover:border-[#e5322d] font-bold cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Download className="w-3.5 h-3.5 text-[#e5322d]" />
                                  <span>{isAr ? 'تحميل' : 'Download'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleRecreateFile(item)}
                                  title={
                                    isAr
                                      ? 'إعادة إنشاء / تفعيل الملف المحمي وتصفير العداد'
                                      : 'Recreate / Reset Open Quota'
                                  }
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>

                                {item.status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRevokeFile(item.fileId)}
                                    title={isAr ? 'إلغاء صلاحية الملف فوراً' : 'Revoke Access'}
                                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteFile(item.fileId)}
                                  title={isAr ? 'حذف الملف نهائياً' : 'Delete File'}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
