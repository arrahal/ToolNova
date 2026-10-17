import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  ARGON_MEM_KIB,
  ARGON_PARALLELISM,
  ARGON_TIME_COST,
  CURRENT_MASTER_KEY_ID,
  PUBLIC_BASE_URL,
  SUPPORTED_PROTECTED_FORMATS,
} from './config';
import {
  ProtectedFileRecord,
  computeDynamicStatus,
  getEncryptedFilePath,
  readProtectorDb,
  sanitizeFileId,
  toPublicFileDto,
  withAtomicProtectorLock,
  writeProtectorDb,
} from './storage';
import {
  buildSecureViewerPayload,
  checkBruteForceLock,
  checkRateLimit,
  clearFailedPasswordAttempts,
  computeContainerHmacHex,
  computeEnvelopeKek,
  deriveArgon2idMaterialAsync,
  deriveHkdfSubkey,
  needsArgon2Rehash,
  recordFailedPasswordAttempt,
  transparentlyRehashRecord,
  validatePasswordPolicy,
  verifyContainerHmac,
} from './crypto';
import {
  requireAuth,
  requireVerifiedEmail,
  optionalAuth,
} from './auth';
import { buildInteractiveProtectedHtmlLauncher } from './launcherTemplate';

export const protectorRouter = Router();

export function buildSecureContainerObject(record: ProtectedFileRecord): Record<string, unknown> {
  const isOffline = Boolean(record.isOfflineMode);
  const base: Record<string, unknown> = {
    magic: 'TOOLNOVA-SECURE-FILE-V2',
    version: '2.0',
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
    serverOrigin: PUBLIC_BASE_URL,
    containerHmacHex: record.cryptoMeta.containerHmacHex,
    isOfflineMode: isOffline,
  };

  if (isOffline) {
    base.encryption = {
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256 (600,000 rounds) + HKDF subkeys',
      webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
      webFileIvHex: record.cryptoMeta.webFileIvHex,
      webViewerIvHex: record.cryptoMeta.webViewerIvHex,
    };
    base.webFileCiphertextBase64 = record.cryptoMeta.webFileCiphertextBase64;
    base.webViewerCiphertextBase64 = record.cryptoMeta.webViewerCiphertextBase64;
  }

  return base;
}

// ==========================================================================
// 1. Encrypt & Register a Protected File
// Requires Authentication + Verified Email
// ownerId is bound strictly to req.user.uid (body.ownerId is ignored)
// ==========================================================================
protectorRouter.post(
  '/encrypt',
  requireAuth,
  requireVerifiedEmail,
  async (req: Request, res: Response) => {
    const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
    if (!checkRateLimit(clientIp, 40)) {
      res.status(429).json({
        ok: false,
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
        maxOpens,
        expirationMs,
        expirationLabel,
        isOfflineMode: requestedOfflineMode,
      } = req.body || {};

      // Verified UID from Firebase ID token — ignore client-supplied ownerId
      const ownerId = req.user!.uid;

      if (!fileName || typeof fileName !== 'string' || !fileBase64) {
        res.status(400).json({ ok: false, error: 'الملف غير صالح أو البيانات ناقصة.' });
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

      // Password policy check: min 10 chars, max 256, reject common weak passwords
      const passwordCheck = validatePasswordPolicy(password);
      if (!passwordCheck.ok) {
        res.status(400).json({
          ok: false,
          error: passwordCheck.error,
        });
        return;
      }

      if (confirmPassword !== undefined && password !== confirmPassword) {
        res.status(400).json({
          ok: false,
          error: 'كلمة المرور وتأكيد كلمة المرور غير متطابقين.',
        });
        return;
      }

      const rawBuffer = Buffer.from(fileBase64, 'base64');
      if (rawBuffer.byteLength === 0) {
        res.status(400).json({ ok: false, error: 'الملف المرفوع فارغ.' });
        return;
      }

      if (rawBuffer.byteLength > formatSpec.maxSizeBytes) {
        res.status(413).json({
          ok: false,
          error: `حجم الملف يتجاوز الحد الأقصى المسموح به (${Math.round(
            formatSpec.maxSizeBytes / (1024 * 1024)
          )} ميجابايت).`,
        });
        return;
      }

      const now = Date.now();
      const parsedMaxOpens =
        maxOpens === null || maxOpens === 'unlimited' || Number(maxOpens) <= 0
          ? null
          : Math.max(1, Math.min(10000, Math.floor(Number(maxOpens))));

      const parsedExpiresAt =
        expirationMs === null || expirationMs === 'never' || Number(expirationMs) <= 0
          ? null
          : now + Math.max(60_000, Number(expirationMs));

      // Offline mode is ONLY allowed for unrestricted files (no maxOpens, no expiration)
      const isOfflineMode = Boolean(
        requestedOfflineMode && parsedMaxOpens === null && parsedExpiresAt === null
      );

      // Generate cryptographically distinct IDs, salts, and IVs (Never reuse IVs)
      const fileId = crypto.randomUUID();
      const argonSalt = crypto.randomBytes(16);
      const fileIv = crypto.randomBytes(12); // 96-bit random IV for AES-256-GCM file
      const dek = crypto.randomBytes(32); // 256-bit Data Encryption Key
      const dekIv = crypto.randomBytes(12); // 96-bit random IV for wrapping DEK

      // 1) Derive Argon2id password verification hash + user key material (runs in worker thread)
      const { passwordVerificationHash, userKeyMaterial } = await deriveArgon2idMaterialAsync(
        password,
        argonSalt,
        {
          m: ARGON_MEM_KIB,
          t: ARGON_TIME_COST,
          p: ARGON_PARALLELISM,
        }
      );

      // 2) Wrap per-file DEK using AES-256-GCM with Envelope KEK (Server Master Key + Argon2id user key)
      const envelopeKek = computeEnvelopeKek(userKeyMaterial, fileId);
      const dekCipher = crypto.createCipheriv('aes-256-gcm', envelopeKek, dekIv);
      const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
      const dekAuthTag = dekCipher.getAuthTag();

      // 3) Encrypt the actual file payload with AES-256-GCM
      const fileCipher = crypto.createCipheriv('aes-256-gcm', dek, fileIv);
      fileCipher.setAAD(Buffer.from(fileId, 'utf-8'));
      const encryptedFileBuffer = Buffer.concat([fileCipher.update(rawBuffer), fileCipher.final()]);
      const fileAuthTag = fileCipher.getAuthTag();

      // Zero out sensitive keys in memory immediately
      dek.fill(0);
      userKeyMaterial.fill(0);

      // Save encrypted binary to isolated storage (.secure_storage/<fileId>.enc)
      const encryptedFilePath = getEncryptedFilePath(fileId);
      fs.writeFileSync(encryptedFilePath, encryptedFileBuffer, { mode: 0o600 });

      const secureFileName = `${cleanName}.secure`;
      const interactiveFileName = `${cleanName}.protected.html`;

      // Compute HMAC integrity signature over metadata (including fileIv and fileAuthTag)
      const containerHmacHex = computeContainerHmacHex({
        fileId,
        originalName: cleanName,
        extension: ext,
        maxOpens: parsedMaxOpens,
        expiresAt: parsedExpiresAt,
        fileIvHex: fileIv.toString('hex'),
        fileAuthTagHex: fileAuthTag.toString('hex'),
      });

      const record: ProtectedFileRecord = {
        fileId,
        ownerId,
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
          keyId: CURRENT_MASTER_KEY_ID,
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
          isOfflineMode,
        },
        isOfflineMode,
        openLogs: [],
      };

      // 4) Offline mode: opt-in for unrestricted files ONLY.
      // Derives distinct subkeys with HKDF and distinct random 12-byte IVs.
      if (isOfflineMode) {
        const viewerRepresentation = await buildSecureViewerPayload(rawBuffer, record);
        const webCryptoSalt = crypto.randomBytes(16);
        const pbkdf2Key = crypto.pbkdf2Sync(password, webCryptoSalt, 600000, 32, 'sha256');

        const webFileKey = deriveHkdfSubkey(pbkdf2Key, webCryptoSalt, 'toolnova-offline-file', 32);
        const webViewerKey = deriveHkdfSubkey(pbkdf2Key, webCryptoSalt, 'toolnova-offline-viewer', 32);
        const webFileIv = crypto.randomBytes(12);
        const webViewerIv = crypto.randomBytes(12);

        const webFileCipher = crypto.createCipheriv('aes-256-gcm', webFileKey, webFileIv);
        const webFileCiphertextWithTag = Buffer.concat([
          webFileCipher.update(rawBuffer),
          webFileCipher.final(),
          webFileCipher.getAuthTag(),
        ]);

        const viewerJsonBuffer = Buffer.from(JSON.stringify(viewerRepresentation), 'utf-8');
        const webViewerCipher = crypto.createCipheriv('aes-256-gcm', webViewerKey, webViewerIv);
        const webViewerCiphertextWithTag = Buffer.concat([
          webViewerCipher.update(viewerJsonBuffer),
          webViewerCipher.final(),
          webViewerCipher.getAuthTag(),
        ]);

        pbkdf2Key.fill(0);
        webFileKey.fill(0);
        webViewerKey.fill(0);

        record.cryptoMeta.webCryptoSaltHex = webCryptoSalt.toString('hex');
        record.cryptoMeta.webFileIvHex = webFileIv.toString('hex');
        record.cryptoMeta.webViewerIvHex = webViewerIv.toString('hex');
        record.cryptoMeta.webFileCiphertextBase64 = webFileCiphertextWithTag.toString('base64');
        record.cryptoMeta.webViewerCiphertextBase64 = webViewerCiphertextWithTag.toString('base64');
      }

      await withAtomicProtectorLock(async () => {
        const db = readProtectorDb();
        db[fileId] = record;
        writeProtectorDb(db);
      });

      const secureContainerObject = buildSecureContainerObject(record);
      const secureFileBase64 = Buffer.from(
        JSON.stringify(secureContainerObject, null, 2),
        'utf-8'
      ).toString('base64');

      const interactiveProtectedHtml = buildInteractiveProtectedHtmlLauncher(secureContainerObject);
      const interactiveHtmlBase64 = Buffer.from(interactiveProtectedHtml, 'utf-8').toString('base64');

      // Return public DTO only — NEVER passwordHash, wrappedDek, or internal ciphertexts in JSON
      res.status(200).json({
        ok: true,
        file: toPublicFileDto(record),
        secureFileName,
        interactiveFileName,
        secureFileBase64,
        interactiveHtmlBase64,
        isOfflineMode,
      });
    } catch (err: any) {
      console.error('File Protector Encryption Error:', err);
      res.status(500).json({
        ok: false,
        error: 'حدث خطأ أثناء تشفير الملف. يرجى المحاولة مرة أخرى.',
      });
    }
  }
);

// ==========================================================================
// 2. Inspect / Check Protected File Status
// Open to recipient with optionalAuth; verifies container HMAC in constant-time
// ==========================================================================
protectorRouter.post('/inspect', optionalAuth, async (req: Request, res: Response) => {
  const { fileId, containerHmacHex } = req.body || {};
  const safeId = sanitizeFileId(fileId);
  if (!safeId) {
    res.status(400).json({ ok: false, error: 'معرف الملف غير صالح أو تالف.' });
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

  // Verify container HMAC in constant time if supplied
  if (containerHmacHex && !verifyContainerHmac(containerHmacHex, record.cryptoMeta.containerHmacHex)) {
    res.status(400).json({
      exists: false,
      error: 'رمز التحقق من سلامة الحاوية غير صالح أو تم التلاعب به (Tampered container).',
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
    file: toPublicFileDto(record),
  });
});

// ==========================================================================
// 3. Atomic Open & Decrypt Protected File into Secure Viewer
// Enforces limits server-side; verifies HMAC; transparently re-hashes Argon2id
// ==========================================================================
protectorRouter.post('/open', optionalAuth, async (req: Request, res: Response) => {
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local');
  if (!checkRateLimit(clientIp, 30)) {
    res.status(429).json({
      allowed: false,
      code: 'RATE_LIMITED',
      error: 'تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار قليلاً.',
    });
    return;
  }

  const { fileId, password, containerHmacHex, ciphertextBase64 } = req.body || {};
  const safeId = sanitizeFileId(fileId);
  if (!safeId) {
    res.status(400).json({
      allowed: false,
      code: 'INVALID_FILE',
      error: 'معرف الملف غير صالح أو تالف.',
    });
    return;
  }

  // Check Brute Force lockout on IP + File ID
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

    // Verify container HMAC in constant time if provided
    if (
      containerHmacHex &&
      !verifyContainerHmac(containerHmacHex, record.cryptoMeta.containerHmacHex)
    ) {
      return {
        httpStatus: 400,
        body: {
          allowed: false,
          code: 'TAMPERED_CONTAINER',
          error: 'رمز التحقق من سلامة الملف غير صالح أو تم التلاعب به (Tampered container).',
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

    // Check open limit BEFORE password check to enforce quota strictly
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

    // Verify password using Argon2id with stored record parameters (async worker thread)
    const argonSalt = Buffer.from(record.cryptoMeta.argonSaltHex, 'hex');
    const { passwordVerificationHash, userKeyMaterial } = await deriveArgon2idMaterialAsync(
      password,
      argonSalt,
      {
        t: record.cryptoMeta.argonTimeCost,
        m: record.cryptoMeta.argonMemCostKiB,
        p: record.cryptoMeta.argonParallelism,
      }
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
    let dek: Buffer;
    try {
      const envelopeKek = computeEnvelopeKek(userKeyMaterial, record.fileId);
      userKeyMaterial.fill(0);

      const dekDecipher = crypto.createDecipheriv(
        'aes-256-gcm',
        envelopeKek,
        Buffer.from(record.cryptoMeta.dekIvHex!, 'hex')
      );
      dekDecipher.setAuthTag(Buffer.from(record.cryptoMeta.dekAuthTagHex!, 'hex'));
      dek = Buffer.concat([
        dekDecipher.update(Buffer.from(record.cryptoMeta.wrappedDekHex!, 'hex')),
        dekDecipher.final(),
      ]);

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
            error: 'البيانات المشفرة لهذا الملف غير متوفرة على الخادم.',
          },
        };
      }

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
    } catch (cryptoErr) {
      console.error('AES-256-GCM Decryption failed:', cryptoErr);
      return {
        httpStatus: 400,
        body: {
          allowed: false,
          code: 'TAMPERED_OR_CORRUPT',
          error: 'فشل التحقق من سلامة التشفير (AES-256-GCM Auth Tag). قد يكون الملف تالفاً أو تم التلاعب به.',
        },
      };
    }

    // Transparently re-hash if Argon2id parameters or master key are outdated
    if (needsArgon2Rehash(record)) {
      try {
        await transparentlyRehashRecord(password, record, dek);
      } catch (rehashErr) {
        console.warn('Failed to transparently re-hash record parameters:', rehashErr);
      }
    }
    dek.fill(0);

    // Atomically consume 1 open slot
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
          ok: true,
          message:
            record.remainingOpens === 0
              ? 'تم التحقق من كلمة المرور وفتح الملف بنجاح. (تنبيه: تم استهلاك الفتحة الوحيدة/الأخيرة — الفتحات المتبقية الآن: 0)'
              : 'تم التحقق من كلمة المرور وفك تشفير الملف بنجاح داخل العارض الآمن.',
          file: toPublicFileDto(record),
          viewer: viewerPayload,
          decryptedRawBase64: decryptedFileBuffer.toString('base64'),
        },
      };
    } finally {
      decryptedFileBuffer.fill(0);
    }
  });

  res.status(atomicResult.httpStatus).json(atomicResult.body);
});

// ==========================================================================
// 4. Dashboard: List all protected files belonging to caller
// Strict Authentication Required; isolates records to req.user.uid
// ==========================================================================
protectorRouter.get('/dashboard', requireAuth, (req: Request, res: Response) => {
  const callerUid = req.user!.uid;
  const db = readProtectorDb();
  let updated = false;
  const now = Date.now();

  const callerFiles = Object.values(db)
    .filter((r) => r.status !== 'deleted' && r.ownerId === callerUid)
    .map((r) => {
      const currentStatus = computeDynamicStatus(r, now);
      if (currentStatus !== r.status) {
        r.status = currentStatus;
        updated = true;
      }
      return toPublicFileDto(r);
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  if (updated) {
    writeProtectorDb(db);
  }

  res.json({ ok: true, files: callerFiles });
});

// ==========================================================================
// 5. Dashboard: Download `.secure` or interactive container
// Strict Authentication Required + Ownership Check (404 if not owner)
// ==========================================================================
protectorRouter.get(
  '/download-secure/:fileId',
  requireAuth,
  (req: Request, res: Response) => {
    const callerUid = req.user!.uid;
    const safeId = sanitizeFileId(req.params.fileId);
    if (!safeId) {
      res.status(400).json({ ok: false, error: 'معرف الملف غير صالح.' });
      return;
    }

    const db = readProtectorDb();
    const record = db[safeId];
    if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    const secureContainerObject = buildSecureContainerObject(record);
    const interactiveFileName = `${record.originalName}.protected.html`;
    const interactiveHtmlContent = buildInteractiveProtectedHtmlLauncher(secureContainerObject);

    res.json({
      ok: true,
      file: toPublicFileDto(record),
      secureFileName: record.secureFileName,
      interactiveFileName,
      secureFileBase64: Buffer.from(
        JSON.stringify(secureContainerObject, null, 2),
        'utf-8'
      ).toString('base64'),
      interactiveHtmlBase64: Buffer.from(interactiveHtmlContent, 'utf-8').toString('base64'),
    });
  }
);

// Direct binary/HTML streaming download
protectorRouter.get('/download/:fileId', requireAuth, (req: Request, res: Response) => {
  const callerUid = req.user!.uid;
  const safeId = sanitizeFileId(req.params.fileId);
  if (!safeId) {
    res.status(400).send('Invalid file ID');
    return;
  }

  const db = readProtectorDb();
  const record = db[safeId];
  if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
    res.status(404).send('File not found');
    return;
  }

  const secureContainerObject = buildSecureContainerObject(record);
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

// ==========================================================================
// 6. Dashboard: Revoke a protected file (إلغاء صلاحية الملف فوراً)
// Requires Authentication + Verified Email + Ownership Check (404 if not owner)
// ==========================================================================
protectorRouter.post(
  '/revoke',
  requireAuth,
  requireVerifiedEmail,
  async (req: Request, res: Response) => {
    const callerUid = req.user!.uid;
    const safeId = sanitizeFileId(req.body?.fileId);
    if (!safeId) {
      res.status(400).json({ ok: false, error: 'معرف الملف غير صالح.' });
      return;
    }

    const result = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];
      if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
        return null;
      }
      record.status = 'revoked';
      record.remainingOpens = 0;
      db[safeId] = record;
      writeProtectorDb(db);
      return record;
    });

    if (!result) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    res.json({ ok: true, status: 'revoked', file: toPublicFileDto(result) });
  }
);

// ==========================================================================
// 7. Dashboard: Recreate / Reactivate a protected file
// Requires Authentication + Verified Email + Ownership Check (404 if not owner)
// Resets usedOpens to 0, returns public DTO only (NEVER passwordHash or ciphertexts)
// ==========================================================================
protectorRouter.post(
  '/recreate',
  requireAuth,
  requireVerifiedEmail,
  async (req: Request, res: Response) => {
    const callerUid = req.user!.uid;
    const { fileId, maxOpens, expirationMs, expirationLabel } = req.body || {};
    const safeId = sanitizeFileId(fileId);
    if (!safeId) {
      res.status(400).json({ ok: false, error: 'معرف الملف غير صالح.' });
      return;
    }

    const result = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];
      if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
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
        record.expiresAt = now + 24 * 60 * 60 * 1000;
        record.expirationLabel = '24 ساعة';
      }

      if (expirationLabel) {
        record.expirationLabel = String(expirationLabel);
      }

      // Recompute container HMAC with updated metadata
      record.cryptoMeta.containerHmacHex = computeContainerHmacHex({
        fileId: record.fileId,
        originalName: record.originalName,
        extension: record.extension,
        maxOpens: record.maxOpens,
        expiresAt: record.expiresAt,
        fileIvHex: record.cryptoMeta.fileIvHex,
        fileAuthTagHex: record.cryptoMeta.fileAuthTagHex,
      });

      db[safeId] = record;
      writeProtectorDb(db);
      return record;
    });

    if (!result) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    res.json({ ok: true, file: toPublicFileDto(result) });
  }
);

// ==========================================================================
// 8. Dashboard: Permanently Delete a protected file (Crypto-Shredding)
// Unlinks encrypted file on disk and removes wrapped DEK from record
// ==========================================================================
protectorRouter.delete(
  '/:fileId',
  requireAuth,
  requireVerifiedEmail,
  async (req: Request, res: Response) => {
    const callerUid = req.user!.uid;
    const safeId = sanitizeFileId(req.params.fileId);
    if (!safeId) {
      res.status(400).json({ ok: false, error: 'معرف الملف غير صالح.' });
      return;
    }

    const deleted = await withAtomicProtectorLock(async () => {
      const db = readProtectorDb();
      const record = db[safeId];
      if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
        return false;
      }

      // 1. Unlink encrypted binary from filesystem (crypto-shredding)
      try {
        const encPath = getEncryptedFilePath(safeId);
        if (fs.existsSync(encPath)) {
          fs.unlinkSync(encPath);
        }
      } catch (fsErr) {
        console.error('Secure file unlink error:', fsErr);
      }

      // 2. Erase cryptographic keys from database record
      delete (record.cryptoMeta as any).wrappedDekHex;
      delete (record.cryptoMeta as any).dekIvHex;
      delete (record.cryptoMeta as any).dekAuthTagHex;
      delete (record.cryptoMeta as any).fileIvHex;
      delete (record.cryptoMeta as any).fileAuthTagHex;
      delete (record.cryptoMeta as any).webFileCiphertextBase64;
      delete (record.cryptoMeta as any).webViewerCiphertextBase64;

      record.status = 'deleted';
      record.remainingOpens = 0;

      // Clean removal from database
      delete db[safeId];
      writeProtectorDb(db);
      return true;
    });

    if (!deleted) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    res.json({ ok: true, message: 'تم حذف الملف وتدمير مفاتيح التشفير بنجاح (Crypto-shredded).' });
  }
);
