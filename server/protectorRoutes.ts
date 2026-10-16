import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import {
  ARGON_MEM_KIB,
  ARGON_PARALLELISM,
  ARGON_TIME_COST,
  SERVER_MASTER_KEY,
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
  computeEnvelopeKek,
  deriveArgon2idMaterial,
  recordFailedPasswordAttempt,
} from './crypto';
import {
  requireAuth,
  requireVerifiedEmail,
  optionalAuth,
} from './auth';
import { buildInteractiveProtectedHtmlLauncher } from './launcherTemplate';

export const protectorRouter = Router();

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
        clientOrigin,
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

      if (!password || typeof password !== 'string' || password.length < 4) {
        res.status(400).json({
          ok: false,
          error: 'يجب أن تتكون كلمة المرور من 4 أحرف أو أرقام على الأقل.',
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

      // Generate cryptographically secure IDs and salts
      const fileId = crypto.randomUUID();
      const argonSalt = crypto.randomBytes(16);
      const fileIv = crypto.randomBytes(12); // 96-bit IV recommended for AES-256-GCM
      const dek = crypto.randomBytes(32); // 256-bit Data Encryption Key
      const dekIv = crypto.randomBytes(12);

      // 1) Derive Argon2id password verification hash + user key material
      const { passwordVerificationHash, userKeyMaterial } = deriveArgon2idMaterial(
        password,
        argonSalt
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

      // Zero out sensitive keys in memory
      dek.fill(0);
      userKeyMaterial.fill(0);

      // Save encrypted binary to isolated storage (.secure_storage/<fileId>.enc)
      const encryptedFilePath = getEncryptedFilePath(fileId);
      fs.writeFileSync(encryptedFilePath, encryptedFileBuffer, { mode: 0o600 });

      const now = Date.now();
      const parsedMaxOpens =
        maxOpens === null || maxOpens === 'unlimited' || Number(maxOpens) <= 0
          ? null
          : Math.max(1, Math.min(10000, Math.floor(Number(maxOpens))));

      const parsedExpiresAt =
        expirationMs === null || expirationMs === 'never' || Number(expirationMs) <= 0
          ? null
          : now + Math.max(60_000, Number(expirationMs));

      const secureFileName = `${cleanName}.secure`;
      const interactiveFileName = `${cleanName}.protected.html`;

      // Compute HMAC integrity signature over metadata
      const containerHmacHex = crypto
        .createHmac('sha256', SERVER_MASTER_KEY)
        .update(
          `${fileId}:${cleanName}:${ext}:${parsedMaxOpens ?? 'inf'}:${parsedExpiresAt ?? 'inf'}`
        )
        .digest('hex');

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
        },
        openLogs: [],
      };

      // Build viewer representation and encrypt with WebCrypto-compatible AES-256-GCM
      const viewerRepresentation = await buildSecureViewerPayload(rawBuffer, record);
      const webCryptoSalt = crypto.randomBytes(16);
      const webCryptoIv = crypto.randomBytes(12);
      const webCryptoKey = crypto.pbkdf2Sync(password, webCryptoSalt, 100000, 32, 'sha256');

      const webFileCipher = crypto.createCipheriv('aes-256-gcm', webCryptoKey, webCryptoIv);
      const webCiphertextWithTag = Buffer.concat([
        webFileCipher.update(rawBuffer),
        webFileCipher.final(),
        webFileCipher.getAuthTag(),
      ]);

      const viewerJsonBuffer = Buffer.from(JSON.stringify(viewerRepresentation), 'utf-8');
      const webViewerCipher = crypto.createCipheriv('aes-256-gcm', webCryptoKey, webCryptoIv);
      const webViewerCiphertextWithTag = Buffer.concat([
        webViewerCipher.update(viewerJsonBuffer),
        webViewerCipher.final(),
        webViewerCipher.getAuthTag(),
      ]);
      webCryptoKey.fill(0);

      record.cryptoMeta.webCryptoSaltHex = webCryptoSalt.toString('hex');
      record.cryptoMeta.webCryptoIvHex = webCryptoIv.toString('hex');
      record.cryptoMeta.webViewerCiphertextBase64 = webViewerCiphertextWithTag.toString('base64');
      record.cryptoMeta.webFileCiphertextBase64 = webCiphertextWithTag.toString('base64');

      await withAtomicProtectorLock(async () => {
        const db = readProtectorDb();
        db[fileId] = record;
        writeProtectorDb(db);
      });

      const hostHeader = req.headers.host || 'localhost:3000';
      const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const serverOrigin =
        typeof clientOrigin === 'string' && clientOrigin.startsWith('http')
          ? clientOrigin
          : `${protoHeader}://${hostHeader}`;

      // Build downloadable container file
      const secureContainerObject = {
        magic: 'TOOLNOVA-SECURE-FILE-V1',
        version: '1.0',
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
        serverOrigin,
        clientOrigin: typeof clientOrigin === 'string' ? clientOrigin : serverOrigin,
        encryption: {
          cipher: 'AES-256-GCM',
          kdf: 'Argon2id (m=16384, t=2, p=1)',
          ivHex: record.cryptoMeta.fileIvHex,
          authTagHex: record.cryptoMeta.fileAuthTagHex,
          signature: record.cryptoMeta.containerHmacHex,
          webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
          webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
        },
        ciphertextBase64: encryptedFileBuffer.toString('base64'),
        webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
        webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
      };

      const secureFileBase64 = Buffer.from(
        JSON.stringify(secureContainerObject, null, 2),
        'utf-8'
      ).toString('base64');

      const interactiveHtmlContent = buildInteractiveProtectedHtmlLauncher(secureContainerObject);
      const interactiveHtmlBase64 = Buffer.from(interactiveHtmlContent, 'utf-8').toString('base64');

      // Return public DTO — never secrets or cryptoMeta
      res.json({
        ok: true,
        file: toPublicFileDto(record),
        secureFileBase64,
        interactiveHtmlBase64,
        interactiveFileName,
      });
    } catch (err) {
      console.error('Encryption error:', err);
      res.status(500).json({ ok: false, error: 'حدث خطأ أثناء تشفير الملف. يرجى المحاولة مرة أخرى.' });
    }
  }
);

// ==========================================================================
// 2. Inspect a `.secure` file or File ID before entering password
// (Returns public metadata only via toPublicFileDto)
// ==========================================================================
protectorRouter.post('/inspect', optionalAuth, async (req: Request, res: Response) => {
  const { fileId } = req.body || {};
  const safeId = sanitizeFileId(fileId);
  if (!safeId) {
    res.status(400).json({ ok: false, error: 'ملف الحماية (.secure) غير صالح أو تالف.' });
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
// Returns toPublicFileDto + viewer payload (never secret cryptographic keys)
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

  const { fileId, password, ciphertextBase64 } = req.body || {};
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

    // Check open limit BEFORE password check
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

    // Verify password using Argon2id + timingSafeEqual
    const argonSalt = Buffer.from(record.cryptoMeta.argonSaltHex, 'hex');
    const { passwordVerificationHash, userKeyMaterial } = deriveArgon2idMaterial(
      password,
      argonSalt
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
    try {
      const envelopeKek = computeEnvelopeKek(userKeyMaterial, record.fileId);
      userKeyMaterial.fill(0);

      const dekDecipher = crypto.createDecipheriv(
        'aes-256-gcm',
        envelopeKek,
        Buffer.from(record.cryptoMeta.dekIvHex, 'hex')
      );
      dekDecipher.setAuthTag(Buffer.from(record.cryptoMeta.dekAuthTagHex, 'hex'));
      const dek = Buffer.concat([
        dekDecipher.update(Buffer.from(record.cryptoMeta.wrappedDekHex, 'hex')),
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
            error: 'البيانات المشفرة لهذا الملف غير متوفرة.',
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
      dek.fill(0);
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
          message:
            record.remainingOpens === 0
              ? 'تم التحقق من كلمة المرور وفتح الملف بنجاح. (تنبيه: تم استهلاك الفتحة الوحيدة/الأخيرة — الفتحات المتبقية الآن: 0)'
              : 'تم التحقق من كلمة المرور وفك تشفير الملف بنجاح داخل العارض الآمن.',
          file: toPublicFileDto(record),
          viewer: viewerPayload,
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
    // Return 404 if record doesn't exist OR belongs to another user
    if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    const encPath = getEncryptedFilePath(record.fileId);
    const encryptedBytes = fs.existsSync(encPath) ? fs.readFileSync(encPath) : Buffer.alloc(0);

    const hostHeader = req.headers.host || 'localhost:3000';
    const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const serverOrigin = `${protoHeader}://${hostHeader}`;

    const secureContainerObject = {
      magic: 'TOOLNOVA-SECURE-FILE-V1',
      version: '1.0',
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
      serverOrigin,
      encryption: {
        cipher: 'AES-256-GCM',
        kdf: 'Argon2id (m=16384, t=2, p=1)',
        ivHex: record.cryptoMeta.fileIvHex,
        authTagHex: record.cryptoMeta.fileAuthTagHex,
        signature: record.cryptoMeta.containerHmacHex,
        webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
        webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
      },
      ciphertextBase64: encryptedBytes.toString('base64'),
      webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
      webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
    };

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
  // Return 404 if record doesn't exist OR belongs to another user
  if (!record || record.status === 'deleted' || record.ownerId !== callerUid) {
    res.status(404).send('File not found');
    return;
  }

  const hostHeader = req.headers.host || 'localhost:3000';
  const protoHeader = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const serverOrigin = `${protoHeader}://${hostHeader}`;

  const encPath = getEncryptedFilePath(record.fileId);
  const encryptedBytes = fs.existsSync(encPath) ? fs.readFileSync(encPath) : Buffer.alloc(0);

  const secureContainerObject = {
    magic: 'TOOLNOVA-SECURE-FILE-V1',
    version: '1.0',
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
    serverOrigin,
    encryption: {
      cipher: 'AES-256-GCM',
      kdf: 'Argon2id (m=16384, t=2, p=1)',
      ivHex: record.cryptoMeta.fileIvHex,
      authTagHex: record.cryptoMeta.fileAuthTagHex,
      signature: record.cryptoMeta.containerHmacHex,
      webCryptoSaltHex: record.cryptoMeta.webCryptoSaltHex,
      webCryptoIvHex: record.cryptoMeta.webCryptoIvHex,
    },
    ciphertextBase64: encryptedBytes.toString('base64'),
    webCiphertextBase64: record.cryptoMeta.webFileCiphertextBase64,
    webViewerCiphertextBase64: record.cryptoMeta.webViewerCiphertextBase64,
  };

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

      db[safeId] = record;
      writeProtectorDb(db);
      return record;
    });

    if (!result) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    // Return toPublicFileDto — NEVER raw record with passwordHash or ciphertexts
    res.json({ ok: true, file: toPublicFileDto(result) });
  }
);

// ==========================================================================
// 8. Dashboard: Permanently Delete a protected file
// Requires Authentication + Verified Email + Ownership Check (404 if not owner)
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
      delete db[safeId];
      writeProtectorDb(db);
      return true;
    });

    if (!deleted) {
      res.status(404).json({ ok: false, error: 'الملف غير موجود.' });
      return;
    }

    try {
      const encPath = getEncryptedFilePath(safeId);
      if (fs.existsSync(encPath)) {
        const stat = fs.statSync(encPath);
        if (stat.size > 0 && stat.size < 60 * 1024 * 1024) {
          fs.writeFileSync(encPath, Buffer.alloc(stat.size, 0));
        }
        fs.unlinkSync(encPath);
      }
    } catch (fsErr) {
      console.error('Secure file unlink error:', fsErr);
    }

    res.json({ ok: true });
  }
);
