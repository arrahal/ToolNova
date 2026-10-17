import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { createExpressApp } from '../server';
import { setCustomTokenVerifierForTesting } from '../server/auth';
import { toPublicFileDto, ProtectedFileRecord } from '../server/storage';

let server: http.Server;
let baseUrl: string;

function makeTestToken(uid: string, email_verified = true, email?: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, email_verified, email: email || `${uid}@example.com` })
  ).toString('base64');
  return `mock-token:${payload}`;
}

const userAToken = makeTestToken('user_A', true, 'alice@example.com');
const userBToken = makeTestToken('user_B', true, 'bob@example.com');
const unverifiedToken = makeTestToken('user_unverified', false, 'unverified@example.com');

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

describe('Task 1 — Authentication & Authorization', () => {
  let fileIdUserA: string;

  // 1. Unauthenticated Requests → 401
  describe('No Token / Missing Auth → 401', () => {
    it('POST /api/protector/encrypt returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'secret.docx',
          password: 'TestPassword123!',
          fileBase64: Buffer.from('hello world').toString('base64'),
        }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/protector/dashboard returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/dashboard`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/protector/revoke returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: 'some-file-id' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('POST /api/protector/recreate returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/recreate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: 'some-file-id' }),
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('DELETE /api/protector/:fileId returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/some-file-id`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/protector/download-secure/:fileId returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/download-secure/some-file-id`);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('UNAUTHORIZED');
    });

    it('GET /api/protector/download/:fileId returns 401 when no token is provided', async () => {
      const res = await fetch(`${baseUrl}/api/protector/download/some-file-id`);
      expect(res.status).toBe(401);
    });

    it('returns 401 when token is invalid or malformed', async () => {
      const res = await fetch(`${baseUrl}/api/protector/dashboard`, {
        headers: { Authorization: 'Bearer this-is-not-a-valid-token' },
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('INVALID_TOKEN');
    });
  });

  // 2. Email verification requirement for write operations
  describe('Email Verification Check (email_verified === false → 403)', () => {
    it('POST /api/protector/encrypt returns 403 when email is not verified', async () => {
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unverifiedToken}`,
        },
        body: JSON.stringify({
          fileName: 'test.docx',
          password: 'TestPassword123!',
          fileBase64: Buffer.from('test content').toString('base64'),
        }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.code).toBe('EMAIL_NOT_VERIFIED');
    });
  });

  // 3. Encrypt & Dashboard Isolation
  describe('Dashboard Isolation & Ownership', () => {
    it('user_A encrypts a file successfully (ownerId is set to user_A)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          fileName: 'user_a_file.docx',
          password: 'PasswordUserA123!',
          fileBase64: Buffer.from('content of user A').toString('base64'),
          ownerId: 'spoofed_owner_id', // Should be ignored by server!
          maxOpens: 3,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.file.ownerId).toBe('user_A'); // Verified UID
      expect(data.file.originalName).toBe('user_a_file.docx');
      fileIdUserA = data.file.fileId;
    });

    it('user_B encrypts a file successfully (ownerId is set to user_B)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/encrypt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({
          fileName: 'user_b_file.docx',
          password: 'PasswordUserB123!',
          fileBase64: Buffer.from('content of user B').toString('base64'),
          maxOpens: 5,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.file.ownerId).toBe('user_B');
    });

    it('dashboard returns only the caller files (user_A sees only user_A files)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/dashboard`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.files)).toBe(true);
      // Every file in user_A's dashboard must belong to user_A
      for (const f of data.files) {
        expect(f.ownerId).toBe('user_A');
      }
      expect(data.files.some((f: any) => f.fileId === fileIdUserA)).toBe(true);
    });

    it('dashboard for user_B returns only user_B files and does not contain user_A files', async () => {
      const res = await fetch(`${baseUrl}/api/protector/dashboard`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      for (const f of data.files) {
        expect(f.ownerId).toBe('user_B');
        expect(f.fileId).not.toBe(fileIdUserA);
      }
    });
  });

  // 4. Cross-User Unauthorized Access → 404 (prevents existence probing)
  describe("Other User's File → 404", () => {
    it('user_B cannot revoke user_A file (returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({ fileId: fileIdUserA }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('user_B cannot recreate user_A file (returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/recreate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({ fileId: fileIdUserA, maxOpens: 10 }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('user_B cannot download-secure user_A file (returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/download-secure/${fileIdUserA}`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });

    it('user_B cannot stream download user_A file (returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/download/${fileIdUserA}`, {
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      expect(res.status).toBe(404);
    });

    it('user_B cannot delete user_A file (returns 404)', async () => {
      const res = await fetch(`${baseUrl}/api/protector/${fileIdUserA}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
    });
  });

  // 5. toPublicFileDto Strips All Secret Cryptographic Fields
  describe('toPublicFileDto Security Check (Never Returns Secrets in JSON)', () => {
    it('toPublicFileDto strips passwordHash, cryptoMeta, wrappedDekHex, and ciphertexts', () => {
      const dummyRecord: ProtectedFileRecord = {
        fileId: 'test-uuid-1234',
        ownerId: 'user_A',
        originalName: 'Financials.xlsx',
        secureFileName: 'Financials.xlsx.secure',
        extension: '.xlsx',
        category: 'excel',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 45000,
        createdAt: 1700000000000,
        expiresAt: 1700086400000,
        expirationLabel: '24 hours',
        maxOpens: 3,
        usedOpens: 1,
        remainingOpens: 2,
        status: 'active',
        lastOpenedAt: 1700005000000,
        passwordHash: 'deadbeef1234567890abcdef',
        cryptoMeta: {
          algorithm: 'AES-256-GCM',
          kdf: 'Argon2id',
          argonSaltHex: '11223344',
          argonTimeCost: 2,
          argonMemCostKiB: 16384,
          argonParallelism: 1,
          fileIvHex: 'aabbcc',
          fileAuthTagHex: 'ddeeff',
          wrappedDekHex: '998877665544',
          dekIvHex: '123456',
          containerHmacHex: 'abcdef0123456789',
          webCryptoSaltHex: '01020304',
          webFileIvHex: '05060708',
          webViewerIvHex: '05060709',
          webViewerCiphertextBase64: 'TOP_SECRET_VIEWER_CIPHERTEXT',
          webFileCiphertextBase64: 'TOP_SECRET_FILE_CIPHERTEXT',
        },
        openLogs: [
          {
            attemptId: 'log-1',
            openedAt: 1700005000000,
            openNumber: 1,
            clientSummary: 'Open #1',
          },
        ],
      };

      const dto: any = toPublicFileDto(dummyRecord);

      // Verify public properties exist
      expect(dto.fileId).toBe('test-uuid-1234');
      expect(dto.ownerId).toBe('user_A');
      expect(dto.originalName).toBe('Financials.xlsx');
      expect(dto.remainingOpens).toBe(2);

      // Verify absolute absence of all secret fields
      expect(dto.passwordHash).toBeUndefined();
      expect(dto.cryptoMeta).toBeUndefined();
      expect(dto.wrappedDekHex).toBeUndefined();
      expect(dto.fileIvHex).toBeUndefined();
      expect(dto.fileAuthTagHex).toBeUndefined();
      expect(dto.ciphertextBase64).toBeUndefined();
      expect(dto.webCiphertextBase64).toBeUndefined();
      expect(dto.webViewerCiphertextBase64).toBeUndefined();
    });

    it('API JSON responses for inspect, dashboard, recreate do not contain secret keys', async () => {
      // 1. Dashboard JSON inspection
      const dashRes = await fetch(`${baseUrl}/api/protector/dashboard`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      const dashData = await dashRes.json();
      const userAFile = dashData.files.find((f: any) => f.fileId === fileIdUserA);
      expect(userAFile).toBeDefined();
      expect(userAFile.passwordHash).toBeUndefined();
      expect(userAFile.cryptoMeta).toBeUndefined();
      expect(userAFile.wrappedDekHex).toBeUndefined();

      // 2. Inspect JSON inspection
      const inspectRes = await fetch(`${baseUrl}/api/protector/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileIdUserA }),
      });
      const inspectData = await inspectRes.json();
      expect(inspectData.exists).toBe(true);
      expect(inspectData.file.passwordHash).toBeUndefined();
      expect(inspectData.file.cryptoMeta).toBeUndefined();
      expect(inspectData.file.wrappedDekHex).toBeUndefined();

      // 3. Recreate JSON inspection
      const recreateRes = await fetch(`${baseUrl}/api/protector/recreate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({ fileId: fileIdUserA, maxOpens: 5 }),
      });
      const recreateData = await recreateRes.json();
      expect(recreateData.ok).toBe(true);
      expect(recreateData.file.usedOpens).toBe(0);
      expect(recreateData.file.maxOpens).toBe(5);
      expect(recreateData.file.passwordHash).toBeUndefined();
      expect(recreateData.file.cryptoMeta).toBeUndefined();
      expect(recreateData.file.wrappedDekHex).toBeUndefined();
    });
  });
});
