export function buildInteractiveProtectedHtmlLauncher(containerObj: Record<string, unknown>): string {
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
