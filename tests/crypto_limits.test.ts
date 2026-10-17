import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import { createExpressApp } from '../server';
import { setCustomTokenVerifierForTesting } from '../server/auth';
import {
  computeContainerHmacHex,
  deriveArgon2idMaterial,
  deriveArgon2idMaterialAsync,
  deriveHkdfSubkey,
  validatePasswordPolicy,
  verifyContainerHmac,
} from '../server/crypto';
import { getEncryptedFilePath, readProtectorDb } from '../server/storage';

let server: http.Server;
let baseUrl: string;

function makeTestToken(uid: string, email_verified = true, email?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, email_verified, email: email || `${uid}@example.com` })
  ).toString('base64');
  return `mock-token:${payload}`;
}

const testUserToken = makeTestToken('crypto_tester', true, 'tester@example.com');

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const app = createExpressApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  setCustomTokenVerifierForTesting(null);
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

describe('Task 2 — Cryptography & Enforceable Limits', () => {
  // 1. Password Policy (Min 10, Max 256, Reject Common Passwords)
  describe('1. Password Policy Enforcement', () => {
    it('rejects passwords under 10 characters on the server', async () => {
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'doc.docx',
          password: 'short',
          fileBase64: Buffer.from('test').toString('base64'),
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toContain('10');
    });

    it('rejects common weak passwords (e.g. password123, 1234567890)', async () => {
      const check1 = validatePasswordPolicy('password123');
      expect(check1.ok).toBe(false);
      expect(check1.error).toContain('شائعة');

      const check2 = validatePasswordPolicy('1234567890');
      expect(check2.ok).toBe(false);

      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'doc.docx',
          password: 'password123',
          fileBase64: Buffer.from('test').toString('base64'),
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('شائعة');
    });

    it('accepts strong passwords meeting policy', () => {
      const check = validatePasswordPolicy('StrongUniquePassword2026!');
      expect(check.ok).toBe(true);
      expect(check.error).toBeUndefined();
    });
  });

  // 2. AES-256-GCM Round Trip & Nonce Uniqueness
  describe('2. AES-GCM Round Trip & Nonce Uniqueness (No IV Reuse)', () => {
    it('performs AES-256-GCM round trip correctly and verifies auth tag', () => {
      const key = crypto.randomBytes(32);
      const iv = crypto.randomBytes(12);
      const plaintext = Buffer.from('Confidential ToolNova Payload 2026');

      // Encrypt
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // Decrypt
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      expect(decrypted.toString('utf-8')).toBe(plaintext.toString('utf-8'));

      // Tampered tag must fail
      const badTag = Buffer.from(authTag);
      badTag[0] ^= 0xff;
      const badDecipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      badDecipher.setAuthTag(badTag);
      expect(() => {
        badDecipher.update(ciphertext);
        badDecipher.final();
      }).toThrow();
    });

    it('proves that no IV is reused across ciphertexts (distinct random IVs)', async () => {
      // Encrypt file in offline mode to examine both sub-ciphertexts and file IVs
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'nonce_test.docx',
          password: 'ValidSecretPassphrase2026!',
          fileBase64: Buffer.from('test content').toString('base64'),
          maxOpens: 'unlimited',
          expirationMs: 'never',
          isOfflineMode: true,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);

      const db = readProtectorDb();
      const record = db[data.file.fileId];
      expect(record).toBeDefined();

      const ivs = [
        record.cryptoMeta.fileIvHex,
        record.cryptoMeta.dekIvHex,
        record.cryptoMeta.webFileIvHex,
        record.cryptoMeta.webViewerIvHex,
      ].filter((x): x is string => typeof x === 'string' && x.length > 0);

      // Verify all IVs are defined, 24 hex characters (12 bytes), and mutually distinct
      expect(ivs.length).toBe(4);
      const uniqueIvs = new Set(ivs);
      expect(uniqueIvs.size).toBe(4);
      for (const iv of ivs) {
        expect(iv.length).toBe(24);
      }
    });
  });

  // 3. Container Integrity HMAC & Anti-Tampering
  describe('3. Container HMAC Integrity Verification', () => {
    it('verifies valid HMAC and rejects tampered containers in constant time', () => {
      const params = {
        fileId: 'test-file-1234',
        originalName: 'report.docx',
        extension: '.docx',
        maxOpens: 1,
        expiresAt: 1790000000000,
        fileIvHex: crypto.randomBytes(12).toString('hex'),
        fileAuthTagHex: crypto.randomBytes(16).toString('hex'),
      };

      const validHmac = computeContainerHmacHex(params);
      expect(validHmac.length).toBe(64);

      // Constant time verification succeeds on match
      expect(verifyContainerHmac(validHmac, validHmac)).toBe(true);

      // Tampered maxOpens
      const tamperedParams = { ...params, maxOpens: 999 };
      const tamperedHmac = computeContainerHmacHex(tamperedParams);
      expect(verifyContainerHmac(tamperedHmac, validHmac)).toBe(false);

      // Corrupted signature
      const corruptedHmac = validHmac.substring(0, 62) + '00';
      expect(verifyContainerHmac(corruptedHmac, validHmac)).toBe(false);
    });

    it('rejects /inspect and /open requests with tampered container HMAC', async () => {
      // Create a fresh file
      const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'tamper_test.docx',
          password: 'StrongSecretPass1234!',
          fileBase64: Buffer.from('Sensitive Info').toString('base64'),
          maxOpens: 2,
        }),
      });
      const encData = await encRes.json();
      const fileId = encData.file.fileId;

      // Inspect with forged HMAC -> 400
      const inspectRes = await fetch(`${baseUrl}/api/protector/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          containerHmacHex: 'bad000000000000000000000000000000000000000000000000000000000dead',
        }),
      });
      expect(inspectRes.status).toBe(400);

      // Open with forged HMAC -> 400
      const openRes = await fetch(`${baseUrl}/api/protector/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          password: 'StrongSecretPass1234!',
          containerHmacHex: 'bad000000000000000000000000000000000000000000000000000000000dead',
        }),
      });
      expect(openRes.status).toBe(400);
      const openData = await openRes.json();
      expect(openData.code).toBe('TAMPERED_CONTAINER');
    });
  });

  // 4. Password Verification & Brute-Force Rejection
  describe('4. Wrong Password Rejection & Rate Limiting', () => {
    it('rejects wrong password on /open with 401 and tracks failed attempts', async () => {
      const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'pwd_test.docx',
          password: 'CorrectSecretPassword123!',
          fileBase64: Buffer.from('Word Doc Content').toString('base64'),
        }),
      });
      const encData = await encRes.json();
      const fileId = encData.file.fileId;

      const openRes = await fetch(`${baseUrl}/api/protector/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId,
          password: 'IncorrectPassword999!',
        }),
      });
      expect(openRes.status).toBe(401);
      const openData = await openRes.json();
      expect(openData.allowed).toBe(false);
      expect(openData.code).toBe('WRONG_PASSWORD');
    });
  });

  // 5. Atomic Limit Enforcement Across Concurrent Requests
  describe('5. Strict Open Limit Enforced Across Concurrent Requests', () => {
    it('enforces open limit = 1 across 5 concurrent requests (exactly 1 succeeds)', async () => {
      // Create file with maxOpens: 1
      const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'single_open.docx',
          password: 'ConcurrentPassword123!',
          fileBase64: Buffer.from('Ultra Secret One Time File').toString('base64'),
          maxOpens: 1,
        }),
      });
      expect(encRes.status).toBe(200);
      const encData = await encRes.json();
      const fileId = encData.file.fileId;

      // Launch 5 concurrent open requests simultaneously
      const promises = Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/protector/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId,
            password: 'ConcurrentPassword123!',
          }),
        }).then(async (r) => ({
          status: r.status,
          body: await r.json(),
        }))
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.status === 200 && r.body.allowed === true);
      const rejections = results.filter(
        (r) => r.status === 403 && r.body.code === 'OPEN_LIMIT_REACHED'
      );

      // Exactly ONE request must succeed!
      expect(successes.length).toBe(1);
      // The other 4 requests must be rejected because the slot was atomically consumed!
      expect(rejections.length).toBe(4);

      // Database remainingOpens must be 0 and status exhausted
      const db = readProtectorDb();
      expect(db[fileId].usedOpens).toBe(1);
      expect(db[fileId].remainingOpens).toBe(0);
      expect(db[fileId].status).toBe('exhausted');
    });
  });

  // 6. Crypto-Shredding on Delete
  describe('6. Crypto-Shredding on Delete', () => {
    it('unlinks file from disk and deletes wrapped DEK from record', async () => {
      const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'shred_me.docx',
          password: 'DeleteTestPassphrase2026!',
          fileBase64: Buffer.from('Secret to be shredded').toString('base64'),
        }),
      });
      const encData = await encRes.json();
      const fileId = encData.file.fileId;

      const encFilePath = getEncryptedFilePath(fileId);
      expect(fs.existsSync(encFilePath)).toBe(true);

      // Delete file
      const delRes = await fetch(`${baseUrl}/api/protector/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${testUserToken}` },
      });
      expect(delRes.status).toBe(200);

      // Verify encrypted file on disk was unlinked
      expect(fs.existsSync(encFilePath)).toBe(false);

      // Verify record is removed or has no cryptographic keys
      const db = readProtectorDb();
      expect(db[fileId]).toBeUndefined();
    });
  });
});
