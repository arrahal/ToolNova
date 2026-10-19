import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { AddressInfo } from 'net';
import JSZip from 'jszip';
import { createExpressApp } from '../server';
import { clearAllFileLocks } from '../server/bruteForceProtection';
import {
  getProtectorRepository,
  ProtectedFileRecord,
  setProtectorRepositoryForTesting,
} from '../server/storage';
import { buildSecureViewerPayload } from '../server/crypto';
function makeTestToken(uid: string, email_verified = true, email?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, email_verified, email: email || `${uid}@example.com` })
  ).toString('base64');
  return `mock-token:${payload}`;
}

describe('TASK 5 — Server Hardening, Storage, DoS Protection', () => {
  let app: express.Express;
  let server: any;
  let baseUrl: string;
  let testUserToken = makeTestToken('hardening_user_1', true, 'hardening@example.com');

  beforeAll(async () => {


    app = createExpressApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    clearAllFileLocks();
  });

  // 1. Rate limit works with spoofed X-Forwarded-For
  describe('1. Rate Limit & Trust Proxy Hardening', () => {
    it('rate limiting uses req.ip and is not bypassed by spoofing X-Forwarded-For header', async () => {
      // Send multiple requests to /api/protector/inspect with spoofed X-Forwarded-For headers
      // The inspect limiter allows 60 requests per 15 min from the same IP (127.0.0.1).
      // If X-Forwarded-For were trusted when trust proxy is off, rotating it would give 60 per spoofed IP.
      // Since trust proxy is false, all requests map to 127.0.0.1 and hit the limit.
      let rateLimited = false;

      for (let i = 0; i < 65; i++) {
        const fakeIp = `198.51.100.${i + 1}`;
        const res = await fetch(`${baseUrl}/api/protector/inspect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': fakeIp,
            'X-Real-IP': fakeIp,
          },
          body: JSON.stringify({ fileId: '12345678-1234-1234-1234-1234567890ab' }),
        });

        if (res.status === 429) {
          rateLimited = true;
          const json = await res.json();
          expect(json.code).toBe('RATE_LIMIT_EXCEEDED');
          break;
        }
      }

      expect(rateLimited).toBe(true);
    });
  });

  // 2. Per-file brute force lock works across different IPs
  describe('2. Brute-Force Lock by FileId (IP-Independent)', () => {
    it('locks file after repeated failed password attempts, and rotating IPs cannot bypass lock', async () => {
      // 1. Create a protected file
      const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'brute_force_test.docx',
          password: 'CorrectPassword2026!',
          fileBase64: Buffer.from('test content').toString('base64'),
          maxOpens: 50,
        }),
      });

      expect(encRes.status).toBe(200);
      const encData = await encRes.json();
      const fileId = encData.file.fileId;

      // 2. Submit 10 wrong password attempts with alternating spoofed IP headers
      for (let attempt = 1; attempt <= 10; attempt++) {
        const fakeIp = `203.0.113.${attempt}`;
        const res = await fetch(`${baseUrl}/api/protector/open`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': fakeIp,
          },
          body: JSON.stringify({
            fileId,
            password: 'WrongPassword123!',
          }),
        });

        if (attempt >= 10) {
          // At 10 attempts, the file is locked
          expect(res.status).toBe(429);
        }
      }

      // 3. Attempt from a completely new "IP" with the CORRECT password
      // The file must still be locked because brute force protection is keyed per fileId!
      const blockedRes = await fetch(`${baseUrl}/api/protector/open`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': '8.8.8.8',
        },
        body: JSON.stringify({
          fileId,
          password: 'CorrectPassword2026!',
        }),
      });

      expect(blockedRes.status).toBe(429);
      const blockedJson = await blockedRes.json();
      expect(blockedJson.allowed).toBe(false);
      expect(blockedJson.code).toBe('FILE_LOCKED');
      expect(blockedJson.retryAfterSeconds).toBeGreaterThan(0);
    }, 30000);
  });

  // 3. Oversized upload rejected
  describe('3. Upload Size Hard Limits', () => {
    it('rejects oversized JSON upload (> 1MB express.json limit) with 413', async () => {
      // 2MB payload exceeds express.json 1MB limit
      const oversizedBuf = Buffer.alloc(2 * 1024 * 1024, 0x41);

      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${testUserToken}`,
        },
        body: JSON.stringify({
          fileName: 'oversized.docx',
          password: 'ValidPassword123!',
          fileBase64: oversizedBuf.toString('base64'),
        }),
      });

      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('rejects multipart upload exceeding 50MB hard limit with 413', async () => {
      // Construct a boundary and multipart body header indicating oversized stream
      const boundary = '----WebKitFormBoundaryToolNovaTest';
      // 51MB payload
      const chunk51MB = Buffer.alloc(51 * 1024 * 1024, 0x50); // 'P'
      chunk51MB[0] = 0x50;
      chunk51MB[1] = 0x4b; // 'PK' header

      const prefix = `--${boundary}\r\nContent-Disposition: form-data; name="fileName"\r\n\r\nlarge.docx\r\n--${boundary}\r\nContent-Disposition: form-data; name="password"\r\n\r\nValidPassword123!\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`;
      const suffix = `\r\n--${boundary}--\r\n`;

      const multipartBuffer = Buffer.concat([
        Buffer.from(prefix, 'utf-8'),
        chunk51MB,
        Buffer.from(suffix, 'utf-8'),
      ]);

      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          Authorization: `Bearer ${testUserToken}`,
        },
        body: multipartBuffer,
      });

      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('50 ميجابايت');
    });
  });

  // 4. Zip bomb rejected
  describe('4. Parser Safety & Zip-Bomb Protection', () => {
    it('detects and rejects zip bomb with over 2,000 entries', async () => {
      const zip = new JSZip();
      // Generate 2005 entries
      for (let i = 0; i < 2005; i++) {
        zip.file(`entry_${i}.txt`, 'small content');
      }
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

      const dummyRecord: ProtectedFileRecord = {
        fileId: 'zip-bomb-test-id-1',
        ownerId: 'hardening_user_1',
        originalName: 'bomb.zip',
        secureFileName: 'bomb.zip.secure',
        extension: '.zip',
        category: 'zip',
        mimeType: 'application/zip',
        fileSize: zipBuffer.length,
        createdAt: Date.now(),
        expiresAt: null,
        expirationLabel: 'never',
        maxOpens: null,
        usedOpens: 0,
        remainingOpens: null,
        status: 'active',
        lastOpenedAt: null,
        passwordHash: '',
        cryptoMeta: {} as any,
      };

      const result = await buildSecureViewerPayload(zipBuffer, dummyRecord);
      expect(result.previewAvailable).toBe(false);
      expect(result.previewError).toBeDefined();
      expect(result.previewError).toContain('ZIP_BOMB');
      expect(result.previewError).toContain('2,000');
    });
  });

  // 5. Concurrent open requests with maxOpens=1 → exactly one succeeds
  describe('5. Atomic Slot Consumption Under Concurrency', () => {
    it(
      'concurrent open requests with maxOpens=1 → exactly one succeeds and remainder fail with 403',
      async () => {
        // Create file with maxOpens: 1
        const encRes = await fetch(`${baseUrl}/api/protector/encrypt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({
            fileName: 'concurrent_lock.docx',
            password: 'AtomicPassword123!',
            fileBase64: Buffer.from('test content').toString('base64'),
            maxOpens: 1,
          }),
        });

        expect(encRes.status).toBe(200);
        const encData = await encRes.json();
        const fileId = encData.file.fileId;

        // Launch 5 concurrent open requests
        const promises = Array.from({ length: 5 }).map(() =>
          fetch(`${baseUrl}/api/protector/open`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId,
              password: 'AtomicPassword123!',
            }),
          }).then(async (r) => ({
            status: r.status,
            body: await r.json(),
          }))
        );

        const responses = await Promise.all(promises);

        const successes = responses.filter((r) => r.status === 200 && r.body.allowed === true);
        const rejections = responses.filter(
          (r) => r.status === 403 && r.body.code === 'OPEN_LIMIT_REACHED'
        );

        expect(successes.length).toBe(1);
        expect(rejections.length).toBe(4);

        const repo = getProtectorRepository();
        const finalRecord = await repo.get(fileId);
        expect(finalRecord?.usedOpens).toBe(1);
        expect(finalRecord?.status).toBe('exhausted');
      },
      30000
    );
  });
});
