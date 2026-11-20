import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import { AddressInfo } from 'net';
import JSZip from 'jszip';
import type { EntitlementRecord, EntitlementStatus, PlanTier } from '../server/firebaseAdmin';

const { testWebhookSecret, mockWorkflowsMap, mockEntitlementsMap, mockProcessedWebhooksMap } =
  vi.hoisted(() => {
    const secret =
      process.env.LEMONSQUEEZY_WEBHOOK_SECRET || 'test_lemonsqueezy_webhook_secret_2026';
    process.env.LEMONSQUEEZY_WEBHOOK_SECRET = secret;
    process.env.LEMONSQUEEZY_PRO_VARIANT_IDS = 'var_pro_1,var_pro_2';
    process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_IDS = 'var_ent_1';
    return {
      testWebhookSecret: secret,
      mockWorkflowsMap: new Map<string, Record<string, unknown>>(),
      mockEntitlementsMap: new Map<string, Record<string, unknown>>(),
      mockProcessedWebhooksMap: new Map<string, Record<string, unknown>>(),
    };
  });

vi.mock('../server/firebaseAdmin', async () => {
  const actual = await vi.importActual<typeof import('../server/firebaseAdmin')>(
    '../server/firebaseAdmin'
  );

  const mockAdminDb = {
    collection: (name: string) => {
      if (name !== 'workflows' && name !== 'entitlements' && name !== 'processedWebhooks') {
        throw new Error(`Firestore collection '${name}' not mocked in unit test; use local repository`);
      }
      const store =
        name === 'workflows'
          ? mockWorkflowsMap
          : name === 'entitlements'
          ? mockEntitlementsMap
          : mockProcessedWebhooksMap;
      return {
        where: (field: string, op: string, value: unknown) => ({
          get: async () => {
            const matched: Record<string, unknown>[] = [];
            for (const item of store.values()) {
              if (op === '==' && item[field] === value) {
                matched.push(item);
              }
            }
            return {
              size: matched.length,
              docs: matched.map((d) => ({ id: String(d.id || ''), data: () => ({ ...d }) })),
            };
          },
        }),
        doc: (docId: string) => ({
          get: async () => {
            const existing = store.get(docId);
            return {
              exists: Boolean(existing),
              id: docId,
              data: () => (existing ? { ...existing } : undefined),
            };
          },
          create: async (data: Record<string, unknown>) => {
            if (store.has(docId)) {
              const err = new Error('ALREADY_EXISTS') as Error & { code: number };
              err.code = 6;
              throw err;
            }
            store.set(docId, { ...data });
          },
          set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
            const prev = options?.merge ? store.get(docId) || {} : {};
            store.set(docId, { ...prev, ...data });
          },
          update: async (updates: Record<string, unknown>) => {
            const prev = store.get(docId);
            if (!prev) {
              const err = new Error('NOT_FOUND') as Error & { code: number };
              err.code = 5;
              throw err;
            }
            store.set(docId, { ...prev, ...updates });
          },
          delete: async () => {
            store.delete(docId);
          },
        }),
      };
    },
  };

  return {
    ...actual,
    adminDb: mockAdminDb,
    getUserEntitlement: async (uid: string) => {
      const rec = mockEntitlementsMap.get(uid) as Partial<EntitlementRecord> | undefined;
      return actual.resolveEffectiveEntitlement(uid, rec);
    },
    setUserEntitlement: async (
      uid: string,
      record: {
        planId: PlanTier;
        status: EntitlementStatus;
        provider?: string;
        subscriptionId?: string;
        customerId?: string;
        variantId?: string;
        endsAt?: number | null;
      }
    ) => {
      const now = Date.now();
      const prev = mockEntitlementsMap.get(uid) || {};
      mockEntitlementsMap.set(uid, {
        ...prev,
        uid,
        planId: record.planId,
        status: record.status,
        provider: record.provider || 'lemonsqueezy',
        ...(record.subscriptionId !== undefined
          ? { subscriptionId: record.subscriptionId || null }
          : {}),
        ...(record.customerId !== undefined ? { customerId: record.customerId || null } : {}),
        ...(record.variantId !== undefined ? { variantId: record.variantId || null } : {}),
        endsAt:
          typeof record.endsAt === 'number' && Number.isFinite(record.endsAt)
            ? record.endsAt
            : null,
        updatedAt: now,
        createdAt: prev.createdAt ?? now,
      });
    },
    claimProcessedWebhook: async (
      eventId: string,
      meta?: { eventName?: string; uid?: string }
    ) => {
      if (mockProcessedWebhooksMap.has(eventId)) {
        return false;
      }
      mockProcessedWebhooksMap.set(eventId, {
        eventId,
        eventName: meta?.eventName || '',
        uid: meta?.uid || '',
        processedAt: Date.now(),
      });
      return true;
    },
    releaseProcessedWebhook: async (eventId: string) => {
      mockProcessedWebhooksMap.delete(eventId);
    },
  };
});

import { createExpressApp } from '../server';
import { setCustomTokenVerifierForTesting } from '../server/auth';
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
    mockWorkflowsMap.clear();
    mockEntitlementsMap.clear();
    mockProcessedWebhooksMap.clear();
    setCustomTokenVerifierForTesting(null);
  });

  afterEach(() => {
    setCustomTokenVerifierForTesting(null);
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

  // 6. Task 1: JWT Signature Verification on /api/workflows & /api/billing/entitlement + Webhook HMAC
  describe('6. Verified Auth on Workflows & Billing + HMAC Webhook', () => {
    function buildUnsignedJwt(uid: string): string {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: uid,
          user_id: uid,
          uid,
          email: `${uid}@example.com`,
          email_verified: true,
        })
      ).toString('base64url');
      return `${header}.${payload}.`;
    }

    it('rejects a forged unsigned JWT with 401 on /api/workflows and /api/billing/entitlement', async () => {
      const forgedJwt = buildUnsignedJwt('spoofed_admin_uid');

      const wfPostRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedJwt}`,
        },
        body: JSON.stringify({
          name: 'Forged Workflow',
          steps: ['merge-pdf'],
        }),
      });
      expect(wfPostRes.status).toBe(401);
      const wfPostBody = await wfPostRes.json();
      expect(wfPostBody.ok).toBe(false);
      expect(wfPostBody.code).toBe('INVALID_TOKEN');

      const wfPutRes = await fetch(`${baseUrl}/api/workflows/wf_target_1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedJwt}`,
        },
        body: JSON.stringify({ name: 'Tampered' }),
      });
      expect(wfPutRes.status).toBe(401);

      const wfDelRes = await fetch(`${baseUrl}/api/workflows/wf_target_1`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${forgedJwt}`,
        },
      });
      expect(wfDelRes.status).toBe(401);

      const entRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: {
          Authorization: `Bearer ${forgedJwt}`,
        },
      });
      expect(entRes.status).toBe(401);
      const entBody = await entRes.json();
      expect(entBody.ok).toBe(false);
      expect(entBody.code).toBe('INVALID_TOKEN');
    });

    it('accepts a valid token via setCustomTokenVerifierForTesting on /api/workflows and /api/billing/entitlement', async () => {
      setCustomTokenVerifierForTesting(async (token) => {
        if (token !== 'valid-verifier-token') {
          throw new Error('Rejected by custom verifier');
        }
        return {
          uid: 'verified_custom_user',
          email: 'verified_custom@example.com',
          email_verified: true,
        };
      });

      const entRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: { Authorization: 'Bearer valid-verifier-token' },
      });
      expect(entRes.status).toBe(200);
      const entBody = await entRes.json();
      expect(entBody.ok).toBe(true);
      expect(entBody.entitlement.uid).toBe('verified_custom_user');

      const wfRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-verifier-token',
        },
        body: JSON.stringify({
          name: 'Verified Custom Workflow',
          description: 'Created after custom token verification',
          steps: ['merge-pdf', 'compress-pdf'],
        }),
      });
      expect(wfRes.status).toBe(201);
      const wfBody = await wfRes.json();
      expect(wfBody.ok).toBe(true);
      expect(wfBody.workflow.ownerId).toBe('verified_custom_user');
    });

    function signWebhookPayload(payloadObj: Record<string, unknown>): {
      raw: string;
      sig: string;
    } {
      const raw = JSON.stringify(payloadObj);
      const sig = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(raw, 'utf-8')
        .digest('hex');
      return { raw, sig };
    }

    it('POST /api/billing/webhook succeeds with valid HMAC and rejects invalid HMAC with 401', async () => {
      const { raw: payload, sig: validHmac } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_hmac_valid_1',
          event_name: 'order_created',
          custom_data: {
            uid: 'webhook_user_1',
          },
        },
        data: {
          id: 'sub_12345',
          attributes: {
            variant_id: 'var_pro_1',
            product_name: 'ToolNova Pro Studio',
            status: 'active',
          },
        },
      });

      const badHmac = '0'.repeat(64);

      const badRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': badHmac,
        },
        body: payload,
      });
      expect(badRes.status).toBe(401);
      expect(mockEntitlementsMap.has('webhook_user_1')).toBe(false);

      const goodRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': validHmac,
        },
        body: payload,
      });
      expect(goodRes.status).toBe(200);
      const goodBody = await goodRes.json();
      expect(goodBody.success).toBe(true);
      expect(goodBody.uid).toBe('webhook_user_1');
      expect(mockEntitlementsMap.get('webhook_user_1')?.planId).toBe('pro');
    });

    it('Task 2: rejects unknown variant without default pro fallback and preserves existing entitlement', async () => {
      // Case A: unknown variant_id on new user
      const { raw: rawUnknown, sig: sigUnknown } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_unknown_var_1',
          event_name: 'subscription_created',
          custom_data: { uid: 'unknown_var_user' },
        },
        data: {
          id: 'sub_unknown_1',
          attributes: {
            variant_id: '999999',
            product_name: 'Enterprise Super Plan', // Should NOT trigger heuristic match
            status: 'active',
          },
        },
      });

      const resA = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigUnknown },
        body: rawUnknown,
      });
      expect(resA.status).toBe(200);
      expect(await resA.json()).toEqual({ received: true, warning: 'Unknown variant' });
      expect(mockEntitlementsMap.has('unknown_var_user')).toBe(false);

      // Case B: missing variant_id does NOT alter an existing enterprise entitlement
      mockEntitlementsMap.set('existing_ent_user', {
        uid: 'existing_ent_user',
        planId: 'enterprise',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const { raw: rawMissing, sig: sigMissing } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_missing_var_1',
          event_name: 'subscription_expired',
          custom_data: { uid: 'existing_ent_user' },
        },
        data: {
          id: 'sub_missing_1',
          attributes: {
            product_name: 'ToolNova Pro',
            status: 'expired',
          },
        },
      });

      const resB = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigMissing },
        body: rawMissing,
      });
      expect(resB.status).toBe(200);
      expect(await resB.json()).toEqual({ received: true, warning: 'Unknown variant' });
      expect(mockEntitlementsMap.get('existing_ent_user')?.planId).toBe('enterprise');
    });

    it('Task 2: maps enterprise variant ID cleanly and deduplicates repeated events via meta.webhook_id and body hash', async () => {
      const { raw: rawEnt, sig: sigEnt } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_dedupe_1',
          event_name: 'subscription_created',
          custom_data: { uid: 'dedupe_user' },
        },
        data: {
          id: 'sub_ent_1',
          attributes: {
            variant_id: 'var_ent_1',
            status: 'active',
          },
        },
      });

      const firstRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigEnt },
        body: rawEnt,
      });
      expect(firstRes.status).toBe(200);
      expect(mockEntitlementsMap.get('dedupe_user')?.planId).toBe('enterprise');

      // Mutate entitlement directly to verify duplicate delivery does NOT re-execute handler
      mockEntitlementsMap.set('dedupe_user', {
        uid: 'dedupe_user',
        planId: 'free',
        status: 'expired',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const secondRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigEnt },
        body: rawEnt,
      });
      expect(secondRes.status).toBe(200);
      expect(await secondRes.json()).toEqual({ received: true, duplicate: true });
      expect(mockEntitlementsMap.get('dedupe_user')?.planId).toBe('free');

      // Also test SHA-256 fallback deduplication when meta.webhook_id is absent
      const { raw: rawNoId, sig: sigNoId } = signWebhookPayload({
        meta: {
          event_name: 'order_created',
          custom_data: { uid: 'dedupe_sha_user' },
        },
        data: {
          id: 'sub_sha_1',
          attributes: {
            variant_id: 'var_pro_2',
            status: 'active',
          },
        },
      });

      const shaFirst = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigNoId },
        body: rawNoId,
      });
      expect(shaFirst.status).toBe(200);
      expect(mockEntitlementsMap.get('dedupe_sha_user')?.planId).toBe('pro');

      mockEntitlementsMap.delete('dedupe_sha_user');
      const shaSecond = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigNoId },
        body: rawNoId,
      });
      expect(shaSecond.status).toBe(200);
      expect(await shaSecond.json()).toEqual({ received: true, duplicate: true });
      expect(mockEntitlementsMap.has('dedupe_sha_user')).toBe(false);
    });

    it('Task 2: rejects meta.test_mode=true when NODE_ENV=production', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { raw, sig } = signWebhookPayload({
          meta: {
            webhook_id: 'wh_test_mode_prod',
            test_mode: true,
            event_name: 'subscription_created',
            custom_data: { uid: 'test_mode_user' },
          },
          data: {
            id: 'sub_test_1',
            attributes: {
              variant_id: 'var_pro_1',
              status: 'active',
            },
          },
        });

        const res = await fetch(`${baseUrl}/api/billing/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-signature': sig },
          body: raw,
        });
        expect(res.status).toBe(403);
        expect(mockEntitlementsMap.has('test_mode_user')).toBe(false);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    it('Task 2: sets past_due on subscription_payment_failed without immediate downgrade', async () => {
      setCustomTokenVerifierForTesting(async () => ({
        uid: 'past_due_user',
        email: 'pastdue@example.com',
        email_verified: true,
      }));

      const { raw, sig } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_past_due_1',
          event_name: 'subscription_payment_failed',
          custom_data: { uid: 'past_due_user' },
        },
        data: {
          id: 'sub_pd_1',
          attributes: {
            variant_id: 'var_pro_1',
            status: 'past_due',
          },
        },
      });

      const whRes = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sig },
        body: raw,
      });
      expect(whRes.status).toBe(200);
      expect(mockEntitlementsMap.get('past_due_user')?.status).toBe('past_due');
      expect(mockEntitlementsMap.get('past_due_user')?.planId).toBe('pro');

      const entRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: { Authorization: 'Bearer valid-past-due-token' },
      });
      expect(entRes.status).toBe(200);
      const entBody = await entRes.json();
      expect(entBody.entitlement.planId).toBe('pro');
      expect(entBody.entitlement.status).toBe('past_due');
      expect(entBody.entitlement.maxFileSizeMB).toBe(50);
    });

    it('Task 2: keeps paid plan on subscription_cancelled until ends_at, then reverts to free when expired', async () => {
      setCustomTokenVerifierForTesting(async () => ({
        uid: 'cancelled_user',
        email: 'cancelled@example.com',
        email_verified: true,
      }));

      // 1. Cancelled with future ends_at -> retains paid plan
      const futureEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { raw: rawFuture, sig: sigFuture } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_cancel_future_1',
          event_name: 'subscription_cancelled',
          custom_data: { uid: 'cancelled_user' },
        },
        data: {
          id: 'sub_cancel_1',
          attributes: {
            variant_id: 'var_pro_1',
            status: 'cancelled',
            ends_at: futureEndsAt,
          },
        },
      });

      const resFuture = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigFuture },
        body: rawFuture,
      });
      expect(resFuture.status).toBe(200);

      const entFutureRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: { Authorization: 'Bearer valid-cancel-token' },
      });
      expect(entFutureRes.status).toBe(200);
      const entFutureBody = await entFutureRes.json();
      expect(entFutureBody.entitlement.planId).toBe('pro');
      expect(entFutureBody.entitlement.status).toBe('cancelled');
      expect(entFutureBody.entitlement.maxFileSizeMB).toBe(50);

      // 2. Once ends_at is in the past, reading entitlement reverts to 'free' even if DB record still says 'pro'
      mockEntitlementsMap.set('cancelled_user', {
        ...mockEntitlementsMap.get('cancelled_user'),
        planId: 'pro',
        status: 'cancelled',
        endsAt: Date.now() - 1000,
      });

      const entExpiredReadRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: { Authorization: 'Bearer valid-cancel-token' },
      });
      expect(entExpiredReadRes.status).toBe(200);
      const entExpiredReadBody = await entExpiredReadRes.json();
      expect(entExpiredReadBody.entitlement.planId).toBe('free');
      expect(entExpiredReadBody.entitlement.maxFileSizeMB).toBe(15);

      // 3. Explicit subscription_expired webhook also reverts to 'free' with status 'expired'
      const { raw: rawExpired, sig: sigExpired } = signWebhookPayload({
        meta: {
          webhook_id: 'wh_expired_1',
          event_name: 'subscription_expired',
          custom_data: { uid: 'cancelled_user' },
        },
        data: {
          id: 'sub_cancel_1',
          attributes: {
            variant_id: 'var_pro_1',
            status: 'expired',
          },
        },
      });

      const resExpired = await fetch(`${baseUrl}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-signature': sigExpired },
        body: rawExpired,
      });
      expect(resExpired.status).toBe(200);
      expect(mockEntitlementsMap.get('cancelled_user')?.planId).toBe('free');
      expect(mockEntitlementsMap.get('cancelled_user')?.status).toBe('expired');
    });
  });
});
