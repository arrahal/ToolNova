import { Router, Request, Response } from 'express';
import {
  VaultTokenState,
  readVaultStore,
  writeVaultStore,
  computeSimpleHash,
} from './storage';

export const vaultRouter = Router();

// ============================================================================
// EXISTING VAULT ROUTES (Preserved for existing Office tools)
// ============================================================================
vaultRouter.post('/register', (req: Request, res: Response) => {
  const {
    tokenId,
    fileName,
    docType,
    passwordHash,
    password,
    maxAllowedUsers,
    lockEditingMode,
    expirationTimestamp,
    preserveExistingCount,
    resetQuota,
  } = req.body || {};

  if (!tokenId || typeof tokenId !== 'string') {
    res.status(400).json({ error: 'Invalid tokenId' });
    return;
  }

  const store = readVaultStore();
  const existing = store[tokenId];
  const safeMax = Math.max(1, Math.min(500, Number(maxAllowedUsers) || 1));
  const computedHash =
    typeof passwordHash === 'string' && passwordHash.length >= 4
      ? passwordHash
      : computeSimpleHash(String(password || '2026').trim());

  const nextUsedCount =
    resetQuota === true
      ? 0
      : preserveExistingCount && existing
      ? Math.min(safeMax, existing.usedCount)
      : 0;

  const record: VaultTokenState = {
    tokenId,
    fileName: String(fileName || 'Protected_Document.docx').slice(0, 180),
    docType: docType === 'excel' || docType === 'powerpoint' ? docType : 'word',
    passwordHash: computedHash,
    maxAllowedUsers: safeMax,
    usedCount: nextUsedCount,
    lockEditingMode:
      lockEditingMode === 'read-only-watermark' ||
      lockEditingMode === 'form-comments-only'
        ? lockEditingMode
        : 'full-lock',
    expirationTimestamp:
      typeof expirationTimestamp === 'number' && expirationTimestamp > 0
        ? expirationTimestamp
        : null,
    accessLog:
      resetQuota === true
        ? []
        : preserveExistingCount && existing
        ? existing.accessLog
        : [],
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  store[tokenId] = record;
  writeVaultStore(store);

  res.json({ ok: true, state: record });
});

vaultRouter.get('/status/:tokenId', (req: Request, res: Response) => {
  const tokenId = String(req.params.tokenId || '');
  const store = readVaultStore();
  const item = store[tokenId];
  if (!item) {
    res.json({ exists: false, state: null });
    return;
  }
  res.json({
    exists: true,
    state: {
      tokenId: item.tokenId,
      fileName: item.fileName,
      docType: item.docType,
      maxAllowedUsers: item.maxAllowedUsers,
      usedCount: item.usedCount,
      lockEditingMode: item.lockEditingMode,
      expirationTimestamp: item.expirationTimestamp,
      accessLog: item.accessLog,
    },
  });
});

vaultRouter.post('/unlock', (req: Request, res: Response) => {
  const {
    tokenId,
    enteredPassword,
    visitorLabel,
    fallbackMaxUsers,
    fallbackPasswordHash,
    fallbackFileName,
    fallbackDocType,
    fallbackLockMode,
    fallbackExpiration,
  } = req.body || {};

  if (!tokenId || typeof tokenId !== 'string') {
    res.status(400).json({ allowed: false, reason: 'معرف المستند غير صالح.' });
    return;
  }

  const store = readVaultStore();
  let item = store[tokenId];

  if (!item && fallbackPasswordHash) {
    item = {
      tokenId,
      fileName: String(fallbackFileName || 'Document.docx').slice(0, 180),
      docType:
        fallbackDocType === 'excel' || fallbackDocType === 'powerpoint'
          ? fallbackDocType
          : 'word',
      passwordHash: String(fallbackPasswordHash),
      maxAllowedUsers: Math.max(1, Math.min(500, Number(fallbackMaxUsers) || 1)),
      usedCount: 0,
      lockEditingMode:
        fallbackLockMode === 'read-only-watermark' ||
        fallbackLockMode === 'form-comments-only'
          ? fallbackLockMode
          : 'full-lock',
      expirationTimestamp:
        typeof fallbackExpiration === 'number' && fallbackExpiration > 0
          ? fallbackExpiration
          : null,
      accessLog: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    store[tokenId] = item;
    writeVaultStore(store);
  }

  if (!item) {
    res.status(404).json({
      allowed: false,
      reason: 'بيانات الحماية لهذا الملف غير مسجلة على الخادم بعد.',
    });
    return;
  }

  const hashProvided = computeSimpleHash(String(enteredPassword || '').trim());
  if (hashProvided !== item.passwordHash) {
    res.status(403).json({
      allowed: false,
      reason: 'كلمة السر غير صحيحة! يرجى إعادة المحاولة.',
    });
    return;
  }

  if (item.expirationTimestamp && Date.now() > item.expirationTimestamp) {
    res.status(403).json({
      allowed: false,
      reason: 'انتهت صلاحية هذا المستند الزمنية المحددة من قبل المالك.',
    });
    return;
  }

  if (item.usedCount >= item.maxAllowedUsers) {
    res.status(403).json({
      allowed: false,
      reason: `تم استنفاد الحد الأقصى للمستلمين المسموح لهم (${item.maxAllowedUsers} أشخاص). تم إغلاق الملف تلقائياً لحمايته!`,
      exhausted: true,
      maxAllowedUsers: item.maxAllowedUsers,
    });
    return;
  }

  item.usedCount += 1;
  item.updatedAt = Date.now();
  item.accessLog.push({
    slotIndex: item.usedCount,
    deviceFingerprint: `${String(visitorLabel || 'المستلم').slice(0, 40)} #${item.usedCount}`,
    accessedAt: new Date().toLocaleTimeString(),
    status: 'GRANTED',
  });

  store[tokenId] = item;
  writeVaultStore(store);

  res.json({
    allowed: true,
    reason: `✅ كلمة السر صحيحة! تم السماح بالدخول وفتح الملف (الشخص ${item.usedCount} من أصل ${item.maxAllowedUsers}).${
      item.usedCount >= item.maxAllowedUsers
        ? ' 🔒 اكتمل العدد المسموح به الآن — أي شخص آخر يحاول فتح الملف بعدك سيتم حظره تلقائياً حتى لو أدخل كلمة السر!'
        : ''
    }`,
    state: item,
  });
});
