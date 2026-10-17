import crypto from 'crypto';
import { PUBLIC_BASE_URL } from './config';

function escapeJsonForScriptTag(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildInteractiveProtectedHtmlLauncher(containerObj: Record<string, unknown>): string {
  const safeJsonPayload = escapeJsonForScriptTag(containerObj);
  const nonce = crypto.randomBytes(16).toString('base64');
  const safeOriginalName = String(containerObj.originalName || 'Document')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const isOffline = Boolean(containerObj.isOfflineMode);
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; frame-src blob: data:; connect-src ${PUBLIC_BASE_URL};" />
  <title>🔐 ملف محمي ومشفر — ${safeOriginalName}</title>
  <script type="application/json" id="toolnova-container">${safeJsonPayload}</script>
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
    .enforced-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 16px;
    }
    .offline-warning-badge {
      display: block;
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 18px;
      text-align: right;
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
      font-weight: 700;
      color: #334155;
      margin-bottom: 8px;
    }
    .input-wrapper {
      position: relative;
      margin-bottom: 18px;
    }
    input[type="password"], input[type="text"] {
      width: 100%;
      padding: 13px 44px 13px 16px;
      border-radius: 14px;
      border: 1.5px solid #cbd5e1;
      font-size: 15px;
      outline: none;
      transition: all 0.2s;
      background: #ffffff;
      color: #0f172a;
    }
    input[type="password"]:focus, input[type="text"]:focus {
      border-color: #e5322d;
      box-shadow: 0 0 0 3px rgba(229, 50, 45, 0.12);
    }
    .toggle-pwd {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 18px;
    }
    .btn-submit {
      width: 100%;
      background: #e5322d;
      color: #ffffff;
      border: none;
      padding: 13px 20px;
      border-radius: 14px;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 14px rgba(229, 50, 45, 0.3);
    }
    .btn-submit:hover {
      background: #d42b26;
      box-shadow: 0 6px 20px rgba(229, 50, 45, 0.4);
    }
    .btn-submit:disabled {
      background: #94a3b8;
      cursor: not-allowed;
      box-shadow: none;
    }
    .error-box {
      margin-top: 14px;
      padding: 12px 14px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 12px;
      color: #991b1b;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
      text-align: right;
      display: none;
    }
    .footer-note {
      margin-top: 22px;
      font-size: 11px;
      color: #94a3b8;
      line-height: 1.6;
    }
    .hidden { display: none !important; }

    /* Viewer Styles */
    .viewer-header {
      background: #0f172a;
      color: #ffffff;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #1e293b;
      flex-wrap: wrap;
      gap: 12px;
    }
    .viewer-title {
      font-size: 15px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .viewer-body {
      background: #ffffff;
      min-height: 480px;
      max-height: 75vh;
      overflow-y: auto;
      padding: 32px 36px;
      font-size: 15px;
      line-height: 1.8;
      color: #1e293b;
    }
    .sheet-tabs {
      display: flex;
      gap: 4px;
      background: #f1f5f9;
      padding: 8px 16px 0;
      border-bottom: 1px solid #cbd5e1;
      overflow-x: auto;
    }
    .sheet-tab {
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      background: #e2e8f0;
      color: #475569;
      border-radius: 8px 8px 0 0;
      cursor: pointer;
      border: none;
    }
    .sheet-tab.active {
      background: #ffffff;
      color: #e5322d;
      border-top: 2px solid #e5322d;
    }
    table.excel-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: right;
    }
    table.excel-table th, table.excel-table td {
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
    }
    table.excel-table th {
      background: #f8fafc;
      font-weight: 700;
      color: #475569;
    }
    .slide-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .slide-num {
      display: inline-block;
      font-size: 11px;
      font-weight: 800;
      color: #e5322d;
      background: #fee2e2;
      padding: 3px 10px;
      border-radius: 999px;
      margin-bottom: 10px;
    }
    .btn-download-orig {
      background: #10b981;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .btn-download-orig:hover { background: #059669; }
  </style>
</head>
<body>

  <!-- Screen 1: Password Gate -->
  <div id="gateScreen" class="card">
    <div class="icon-box">🔐</div>
    <h1>ملف مشفر ومحمي</h1>
    <div class="filename">${safeOriginalName}</div>

    ${
      isOffline
        ? `<div class="offline-warning-badge">⚠️ تنبيه أمني: هذا الملف في <strong>نمط غير متصل (بدون قيود حماية)</strong>. لا يمكن فرض عدد مرات الفتح أو انتهاء الصلاحية أو الإلغاء الفوري.</div>`
        : `<div class="enforced-badge">🛡️ قيود حماية خادم مشددة: مفروضة تقنياً</div>`
    }

    <div class="meta-grid">
      <div>
        <span class="meta-label">مرات الفتح المسموحة</span>
        <span id="metaRemaining" class="meta-val">${maxOpensDisplay}</span>
      </div>
      <div>
        <span class="meta-label">صلاحية الملف</span>
        <span class="meta-val">${expDisplay}</span>
      </div>
    </div>

    <label class="field-label" for="pwdInput">أدخل كلمة المرور لفك التشفير وعرض المستند:</label>
    <div class="input-wrapper">
      <input type="password" id="pwdInput" placeholder="أدخل كلمة المرور..." autocomplete="current-password" autofocus />
      <button type="button" class="toggle-pwd" id="togglePwdBtn" onclick="togglePasswordVisibility()">👁️</button>
    </div>

    <button type="button" id="openBtn" class="btn-submit" onclick="unlockProtectedFile()">
      🔓 فك التشفير وعرض الملف الآمن
    </button>

    <div id="errorBox" class="error-box"></div>

    <div class="footer-note">
      🔒 مشفر بواسطة خوارزمية AES-256-GCM + Argon2id.<br/>
      ${
        isOffline
          ? 'تم تشفير هذا الملف في وضع عدم الاتصال بناءً على رغبة المنشئ.'
          : 'يتم فرض حدود الفتح والصلاحية والتحقق من سلامة الحاوية عبر الخادم بصورة غير قابلة للتلاعب.'
      }
    </div>
  </div>

  <!-- Screen 2: Expired / Exhausted / Tampered / Revoked -->
  <div id="expiredScreen" class="card hidden">
    <div class="icon-box" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;">🚫</div>
    <h1 style="color:#b91c1c;">عذراً، هذا الملف غير متاح</h1>
    <div class="filename">${safeOriginalName}</div>
    <div id="expiredReasonText" style="margin:20px 0;font-size:14px;color:#475569;line-height:1.7;">
      انتهت صلاحية فتح هذا الملف أو تم استهلاك جميع مرات الفتح المسموحة.
    </div>
    <div style="background:#fef2f2;border:1px solid #fee2e2;border-radius:12px;padding:12px;font-size:12px;color:#991b1b;margin-bottom:18px;">
      🔒 لا يمكن فتح الملف مجدداً حتى مع توفر كلمة المرور لانتهاء القيود المحددة من قبل المالك.
    </div>
    <button type="button" class="btn-submit" style="background:#475569;" onclick="location.reload()">
      🔄 إعادة المحاولة
    </button>
  </div>

  <!-- Screen 3: In-Memory Secure Document Viewer -->
  <div id="viewerScreen" class="card viewer-card hidden">
    <div class="viewer-header">
      <div class="viewer-title">
        <span>👁️ العارض الآمن</span>
        <span style="font-size:12px;background:#334155;padding:3px 10px;border-radius:6px;color:#cbd5e1;">${safeOriginalName}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:12px;flex-wrap:wrap;">
        <button id="downloadDecryptedBtn" class="btn-download-orig hidden" onclick="downloadDecryptedOriginal()">
          ⬇️ تنزيل الملف الأصلي
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
    let decryptedRawBytes = null;

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

    function togglePasswordVisibility() {
      const inp = document.getElementById('pwdInput');
      const btn = document.getElementById('togglePwdBtn');
      if (inp.type === 'password') {
        inp.type = 'text';
        btn.textContent = '🙈';
      } else {
        inp.type = 'password';
        btn.textContent = '👁️';
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

    function renderViewerContent(viewer) {
      const body = document.getElementById('viewerBody');
      body.textContent = '';

      if (viewer.viewerType === 'word') {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('sandbox', '');
        iframe.style.width = '100%';
        iframe.style.minHeight = '520px';
        iframe.style.border = '1px solid #e2e8f0';
        iframe.style.borderRadius = '12px';
        iframe.style.background = '#ffffff';
        const docHtml = '<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1e293b;padding:24px;margin:0;}table{border-collapse:collapse;width:100%;margin:12px 0;}th,td{border:1px solid #cbd5e1;padding:8px;}p{margin:8px 0;}</style></head><body>' + (viewer.htmlContent || ('<p>' + escapeHtml(viewer.textContent || '') + '</p>')) + '</body></html>';
        iframe.srcdoc = docHtml;
        body.appendChild(iframe);
      } else if (viewer.viewerType === 'excel' && viewer.sheets) {
        const tabsDiv = document.createElement('div');
        tabsDiv.className = 'sheet-tabs';
        const contentDiv = document.createElement('div');
        contentDiv.style.marginTop = '16px';

        viewer.sheets.forEach(function(sh, idx) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sheet-tab ' + (idx === 0 ? 'active' : '');
          btn.textContent = sh.name;
          btn.onclick = function() {
            document.querySelectorAll('.sheet-tab').forEach(function(t) { t.classList.remove('active'); });
            btn.classList.add('active');
            renderExcelSheet(sh, contentDiv);
          };
          tabsDiv.appendChild(btn);
        });

        body.appendChild(tabsDiv);
        body.appendChild(contentDiv);
        renderExcelSheet(viewer.sheets[0], contentDiv);
      } else if (viewer.viewerType === 'powerpoint' && viewer.slides) {
        viewer.slides.forEach(function(sl) {
          const card = document.createElement('div');
          card.className = 'slide-card';
          const badge = document.createElement('span');
          badge.className = 'slide-num';
          badge.textContent = 'شريحة رقم ' + sl.slideNumber;
          const h3 = document.createElement('h3');
          h3.style.margin = '8px 0 12px';
          h3.textContent = sl.title;
          const ul = document.createElement('ul');
          ul.style.paddingRight = '20px';
          (sl.bullets || []).forEach(function(b) {
            const li = document.createElement('li');
            li.textContent = b;
            ul.appendChild(li);
          });
          card.appendChild(badge);
          card.appendChild(h3);
          card.appendChild(ul);
          body.appendChild(card);
        });
      } else if (viewer.viewerType === 'pdf') {
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '540px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '12px';
        let pdfSrc = '';
        if (viewer.pdfBase64) {
          pdfSrc = 'data:application/pdf;base64,' + viewer.pdfBase64 + '#toolbar=0';
        } else if (decryptedRawBytes) {
          const blob = new Blob([decryptedRawBytes], { type: 'application/pdf' });
          pdfSrc = URL.createObjectURL(blob) + '#toolbar=0';
        }
        iframe.src = pdfSrc;
        body.appendChild(iframe);
      } else if (viewer.viewerType === 'zip' && viewer.zipEntries) {
        const div = document.createElement('div');
        const h3 = document.createElement('h3');
        h3.style.marginBottom = '14px';
        h3.style.color = '#1e293b';
        h3.textContent = '📦 محتويات الأرشيف المضغوط (' + viewer.zipEntries.length + ' عنصر):';
        div.appendChild(h3);

        const ul = document.createElement('ul');
        ul.style.paddingRight = '20px';
        viewer.zipEntries.forEach(function(e) {
          const li = document.createElement('li');
          li.style.marginBottom = '6px';
          // Strictly textContent — no innerHTML concatenation!
          li.textContent = (e.isDirectory ? '📁 ' : '📄 ') + e.name + ' (' + Math.round(e.sizeBytes / 1024) + ' KB)';
          ul.appendChild(li);
        });
        div.appendChild(ul);
        body.appendChild(div);
      }
    }

    function renderExcelSheet(sh, container) {
      container.textContent = '';
      if (!sh || !sh.rows || sh.rows.length === 0) {
        const p = document.createElement('p');
        p.style.color = '#64748b';
        p.textContent = 'لا توجد بيانات في هذه الورقة.';
        container.appendChild(p);
        return;
      }
      const table = document.createElement('table');
      table.className = 'excel-table';
      sh.rows.forEach(function(row, rIdx) {
        const tr = document.createElement('tr');
        row.forEach(function(cell) {
          const td = document.createElement(rIdx === 0 ? 'th' : 'td');
          td.textContent = cell;
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      container.appendChild(table);
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

    // Offline PBKDF2-SHA256 (600,000 iterations) with distinct subkeys for unrestricted files only
    async function decryptOfflineWebCrypto(password) {
      const encMeta = CONTAINER.encryption || {};
      if (!encMeta.webCryptoSaltHex || !encMeta.webViewerIvHex) {
        throw new Error('NO_OFFLINE_CIPHERTEXT');
      }
      const enc = new TextEncoder();
      const salt = hexToBytes(encMeta.webCryptoSaltHex);
      const viewerIv = hexToBytes(encMeta.webViewerIvHex);

      const baseKey = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      // PBKDF2 with >= 600,000 iterations
      const derivedBits = await window.crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 600000,
          hash: 'SHA-256'
        },
        baseKey,
        256
      );

      // Import master derived key into HKDF for per-purpose subkey derivation
      const hkdfKey = await window.crypto.subtle.importKey(
        'raw',
        derivedBits,
        { name: 'HKDF' },
        false,
        ['deriveKey']
      );

      const viewerAesKey = await window.crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: salt,
          info: enc.encode('toolnova-offline-viewer')
        },
        hkdfKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      let viewerObj = null;
      if (CONTAINER.webViewerCiphertextBase64) {
        const cipherBytes = base64ToBytes(CONTAINER.webViewerCiphertextBase64);
        const decryptedBuf = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: viewerIv, tagLength: 128 },
          viewerAesKey,
          cipherBytes
        );
        const jsonStr = new TextDecoder().decode(decryptedBuf);
        viewerObj = JSON.parse(jsonStr);
      }

      if (CONTAINER.webFileCiphertextBase64 && encMeta.webFileIvHex) {
        try {
          const fileAesKey = await window.crypto.subtle.deriveKey(
            {
              name: 'HKDF',
              hash: 'SHA-256',
              salt: salt,
              info: enc.encode('toolnova-offline-file')
            },
            hkdfKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
          );
          const rawCipher = base64ToBytes(CONTAINER.webFileCiphertextBase64);
          const fileIv = hexToBytes(encMeta.webFileIvHex);
          const rawDecrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: fileIv, tagLength: 128 },
            fileAesKey,
            rawCipher
          );
          decryptedRawBytes = new Uint8Array(rawDecrypted);
        } catch (e) {}
      }

      return viewerObj;
    }

    // Inspect server status on load for server-enforced files
    (async function inspectOnLoad() {
      if (CONTAINER.isOfflineMode) {
        return;
      }
      try {
        const res = await fetch(CONTAINER.serverOrigin + '/api/protector/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: CONTAINER.fileId,
            containerHmacHex: CONTAINER.containerHmacHex,
          }),
        });
        const data = await res.json();
        if (!data.exists) {
          showExpiredScreen(data.error || 'لقد انتهت صلاحية هذا الملف أو تم حذفه.');
          return;
        }
        const f = data.file;
        document.getElementById('metaRemaining').textContent =
          f.remainingOpens === null ? 'بدون حد (∞)' : f.remainingOpens + ' من ' + f.maxOpens;
        if (f.status === 'exhausted' || f.status === 'expired' || f.status === 'revoked' || f.status === 'deleted') {
          showExpiredScreen(data.error || 'انتهت صلاحية فتح هذا الملف.');
        }
      } catch (err) {
        // Handled at open time with full message
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

      btn.disabled = true;
      btn.textContent = '⏳ جاري التحقق وفك التشفير...';

      // 1. OFFLINE MODE (OPT-IN FOR UNRESTRICTED FILES ONLY)
      if (CONTAINER.isOfflineMode) {
        try {
          const viewer = await decryptOfflineWebCrypto(pwd);
          document.getElementById('gateScreen').classList.add('hidden');
          document.getElementById('viewerScreen').classList.remove('hidden');
          document.getElementById('viewerRemaining').textContent = 'بدون حد (نمط غير متصل)';
          if (decryptedRawBytes) {
            document.getElementById('downloadDecryptedBtn').classList.remove('hidden');
          }
          renderViewerContent(viewer);
          return;
        } catch (err) {
          errBox.textContent = 'كلمة المرور غير صحيحة! تعذر فك تشفير الملف.';
          errBox.style.display = 'block';
          btn.disabled = false;
          btn.textContent = '🔓 فك التشفير وعرض الملف الآمن';
          return;
        }
      }

      // 2. ENFORCEABLE LIMITS (ONLINE SERVER VERIFIED)
      try {
        const response = await fetch(CONTAINER.serverOrigin + '/api/protector/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: CONTAINER.fileId,
            password: pwd,
            containerHmacHex: CONTAINER.containerHmacHex,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.allowed) {
          btn.disabled = false;
          btn.textContent = '🔓 فك التشفير وعرض الملف الآمن';
          if (data.status === 'exhausted' || data.status === 'expired' || data.status === 'revoked' || data.status === 'deleted') {
            showExpiredScreen(data.error || 'انتهت صلاحية فتح هذا الملف.');
            return;
          }
          errBox.textContent = data.error || 'كلمة المرور غير صحيحة أو تم رفض الوصول.';
          errBox.style.display = 'block';
          return;
        }

        // Open succeeded!
        if (data.decryptedRawBase64) {
          decryptedRawBytes = base64ToBytes(data.decryptedRawBase64);
          document.getElementById('downloadDecryptedBtn').classList.remove('hidden');
        }

        document.getElementById('gateScreen').classList.add('hidden');
        document.getElementById('viewerScreen').classList.remove('hidden');

        const rem = data.file.remainingOpens;
        document.getElementById('viewerRemaining').textContent =
          rem === null ? 'بدون حد (∞)' : rem + ' من ' + data.file.maxOpens;

        renderViewerContent(data.viewer);
      } catch (networkErr) {
        btn.disabled = false;
        btn.textContent = '🔓 فك التشفير وعرض الملف الآمن';
        errBox.textContent =
          '⚠️ تعذر الاتصال بخادم الحماية الآمن (' + CONTAINER.serverOrigin + '). هذا الملف محمي بقيود خادم مشددة ويتطلب اتصالاً بالإنترنت للتحقق من الصلاحية وفك التشفير.';
        errBox.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}
