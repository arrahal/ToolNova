import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'http';
import crypto from 'crypto';
import { AddressInfo } from 'net';

interface StoredWorkflowDoc {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  steps: string[];
  estimatedSavedSec: number;
  runsCount: number;
  createdAt: number;
  updatedAt: number;
}

const workflowsStore = new Map<string, StoredWorkflowDoc>();
let lastWriteMethod: 'create' | 'set' | null = null;

// Mock firebaseAdmin's Firestore client with an accurate in-memory implementation
// that enforces Firestore DocumentReference.create() semantics (ALREADY_EXISTS on collision),
// while leaving server/auth.ts (requireAuth / requireVerifiedEmail / jwtVerify) 100% real.
vi.mock('../server/firebaseAdmin', async () => {
  const actual = await vi.importActual<typeof import('../server/firebaseAdmin')>(
    '../server/firebaseAdmin'
  );

  const mockAdminDb = {
    collection: (collectionName: string) => {
      if (collectionName !== 'workflows') {
        throw new Error(`Unexpected collection in test: ${collectionName}`);
      }
      return {
        where: (field: string, op: string, value: unknown) => ({
          get: async () => {
            const matched: StoredWorkflowDoc[] = [];
            for (const doc of workflowsStore.values()) {
              if (op === '==' && (doc as unknown as Record<string, unknown>)[field] === value) {
                matched.push(doc);
              }
            }
            return {
              size: matched.length,
              docs: matched.map((d) => ({ id: d.id, data: () => ({ ...d }) })),
            };
          },
        }),
        doc: (docId: string) => ({
          get: async () => {
            const existing = workflowsStore.get(docId);
            return {
              exists: Boolean(existing),
              id: docId,
              data: () => (existing ? { ...existing } : undefined),
            };
          },
          create: async (data: StoredWorkflowDoc) => {
            lastWriteMethod = 'create';
            if (workflowsStore.has(docId)) {
              const conflictErr = new Error(`Document already exists: workflows/${docId}`) as Error & {
                code: number;
              };
              conflictErr.code = 6; // gRPC ALREADY_EXISTS
              throw conflictErr;
            }
            workflowsStore.set(docId, { ...data });
          },
          set: async (data: StoredWorkflowDoc) => {
            lastWriteMethod = 'set';
            workflowsStore.set(docId, { ...data });
          },
          update: async (updates: Partial<StoredWorkflowDoc>) => {
            const existing = workflowsStore.get(docId);
            if (!existing) {
              const notFoundErr = new Error(`No document to update: workflows/${docId}`) as Error & {
                code: number;
              };
              notFoundErr.code = 5;
              throw notFoundErr;
            }
            workflowsStore.set(docId, { ...existing, ...updates });
          },
          delete: async () => {
            workflowsStore.delete(docId);
          },
        }),
      };
    },
  };

  return {
    ...actual,
    adminDb: mockAdminDb,
    getUserEntitlement: vi.fn(async (uid: string) => ({
      ...actual.PLAN_LIMITS.pro,
      uid,
      status: 'active' as const,
      updatedAt: 1700000000000,
      createdAt: 1700000000000,
    })),
  };
});

import { createExpressApp } from '../server';

function makeVerifiedTestToken(uid: string, email_verified = true): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, email_verified, email: `${uid}@example.com` })
  ).toString('base64');
  return `mock-token:${payload}`;
}

/**
 * Builds a forged JWT whose base64 payload claims to be `spoofedUid`
 * (the exact attack vector that previously bypassed base64-only decoding).
 */
function makeForgedJwt(spoofedUid: string, alg: 'none' | 'HS256' = 'HS256'): string {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: spoofedUid,
      user_id: spoofedUid,
      uid: spoofedUid,
      email: `${spoofedUid}@example.com`,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  ).toString('base64url');
  const fakeSig =
    alg === 'none'
      ? ''
      : crypto.createHmac('sha256', 'attacker-secret').update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${fakeSig}`;
}

describe('Workflows & Billing Entitlement — Signature Verification & Ownership Isolation', () => {
  let server: http.Server;
  let baseUrl: string;

  const userAToken = makeVerifiedTestToken('user_A', true);
  const userBToken = makeVerifiedTestToken('user_B', true);
  const unverifiedUserToken = makeVerifiedTestToken('user_unverified', false);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const app = createExpressApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    workflowsStore.clear();
    lastWriteMethod = null;
  });

  describe('1. Forged / Unsigned JWTs Rejected with 401 (Anti-Spoofing)', () => {
    it('rejects forged HS256 and alg:none JWTs on GET /api/billing/entitlement with 401', async () => {
      for (const forgedToken of [makeForgedJwt('user_A', 'HS256'), makeForgedJwt('user_A', 'none')]) {
        const res = await fetch(`${baseUrl}/api/billing/entitlement`, {
          headers: { Authorization: `Bearer ${forgedToken}` },
        });
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.ok).toBe(false);
        expect(body.code).toBe('INVALID_TOKEN');
      }
    });

    it('rejects missing token on GET /api/billing/entitlement with 401 and returns verified user entitlement on valid token', async () => {
      const noTokenRes = await fetch(`${baseUrl}/api/billing/entitlement`);
      expect(noTokenRes.status).toBe(401);

      const validRes = await fetch(`${baseUrl}/api/billing/entitlement`, {
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(validRes.status).toBe(200);
      const validBody = await validRes.json();
      expect(validBody.ok).toBe(true);
      expect(validBody.entitlement.uid).toBe('user_A');
    });

    it('rejects forged JWTs on POST, PUT, and DELETE /api/workflows with 401', async () => {
      const forgedAsUserA = makeForgedJwt('user_A', 'HS256');
      const forgedUnsigned = makeForgedJwt('user_A', 'none');

      const postRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedAsUserA}`,
        },
        body: JSON.stringify({
          name: 'Spoofed Workflow',
          steps: ['merge-pdf', 'compress-pdf'],
        }),
      });
      expect(postRes.status).toBe(401);
      expect(workflowsStore.size).toBe(0);

      // Seed a workflow owned by user_A and ensure forged token cannot PUT or DELETE it
      workflowsStore.set('wf_existing_a', {
        id: 'wf_existing_a',
        ownerId: 'user_A',
        name: 'User A Original',
        description: 'Protected',
        steps: ['merge-pdf'],
        estimatedSavedSec: 20,
        runsCount: 0,
        createdAt: 1000,
        updatedAt: 1000,
      });

      const putRes = await fetch(`${baseUrl}/api/workflows/wf_existing_a`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedUnsigned}`,
        },
        body: JSON.stringify({ name: 'Forged Edit' }),
      });
      expect(putRes.status).toBe(401);
      expect(workflowsStore.get('wf_existing_a')?.name).toBe('User A Original');

      const delRes = await fetch(`${baseUrl}/api/workflows/wf_existing_a`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${forgedAsUserA}` },
      });
      expect(delRes.status).toBe(401);
      expect(workflowsStore.has('wf_existing_a')).toBe(true);
    });

    it('enforces requireVerifiedEmail (403) on workflow write operations (POST, PUT, DELETE)', async () => {
      const postRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unverifiedUserToken}`,
        },
        body: JSON.stringify({
          name: 'Unverified Workflow',
          steps: ['merge-pdf'],
        }),
      });
      expect(postRes.status).toBe(403);
      const postJson = await postRes.json();
      expect(postJson.code).toBe('EMAIL_NOT_VERIFIED');

      const putRes = await fetch(`${baseUrl}/api/workflows/wf_any`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${unverifiedUserToken}`,
        },
        body: JSON.stringify({ name: 'Updated' }),
      });
      expect(putRes.status).toBe(403);

      const delRes = await fetch(`${baseUrl}/api/workflows/wf_any`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${unverifiedUserToken}` },
      });
      expect(delRes.status).toBe(403);
    });
  });

  describe('2. Cross-User Workflow Isolation: User B Cannot Modify, Delete, or Overwrite User A Workflow', () => {
    it('prevents User B from modifying (PUT), deleting (DELETE), or replacing/overwriting (POST with same id) User A workflow', async () => {
      // 1. User A creates a workflow; client-supplied id must be ignored and create() must be used
      const createARes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          id: 'wf_client_supplied_id',
          name: 'User A Confidential Pipeline',
          description: 'Original description',
          steps: ['merge-pdf', 'watermark-pdf'],
        }),
      });

      expect(createARes.status).toBe(201);
      const createABody = await createARes.json();
      expect(createABody.ok).toBe(true);
      expect(lastWriteMethod).toBe('create');

      const userAWfId: string = createABody.workflow.id;
      expect(userAWfId).not.toBe('wf_client_supplied_id');
      expect(userAWfId.startsWith('wf_')).toBe(true);
      expect(createABody.workflow.ownerId).toBe('user_A');
      expect(workflowsStore.has('wf_client_supplied_id')).toBe(false);

      // 2. User B attempts to MODIFY User A's workflow via PUT /api/workflows/:id -> 403
      const modifyByBRes = await fetch(`${baseUrl}/api/workflows/${userAWfId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({
          name: 'Tampered By User B',
          steps: ['split-pdf'],
        }),
      });
      expect(modifyByBRes.status).toBe(403);
      expect(workflowsStore.get(userAWfId)?.name).toBe('User A Confidential Pipeline');
      expect(workflowsStore.get(userAWfId)?.ownerId).toBe('user_A');
      expect(workflowsStore.get(userAWfId)?.steps).toEqual(['merge-pdf', 'watermark-pdf']);

      // 3. User B attempts to DELETE User A's workflow via DELETE /api/workflows/:id -> 403
      const deleteByBRes = await fetch(`${baseUrl}/api/workflows/${userAWfId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userBToken}` },
      });
      expect(deleteByBRes.status).toBe(403);
      expect(workflowsStore.has(userAWfId)).toBe(true);

      // 4. User B attempts to REPLACE / OVERWRITE User A's workflow via POST /api/workflows passing id = userAWfId
      const overwriteByBRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userBToken}`,
        },
        body: JSON.stringify({
          id: userAWfId,
          name: 'Overwritten By User B',
          description: 'Malicious replacement attempt',
          steps: ['rotate-pdf'],
        }),
      });

      // Server ignores client id and creates a separate document owned by user_B;
      // User A's workflow document remains untouched!
      expect(overwriteByBRes.status).toBe(201);
      const overwriteBody = await overwriteByBRes.json();
      expect(overwriteBody.workflow.id).not.toBe(userAWfId);
      expect(overwriteBody.workflow.ownerId).toBe('user_B');

      const intactUserADoc = workflowsStore.get(userAWfId);
      expect(intactUserADoc).toBeDefined();
      expect(intactUserADoc?.ownerId).toBe('user_A');
      expect(intactUserADoc?.name).toBe('User A Confidential Pipeline');
      expect(intactUserADoc?.steps).toEqual(['merge-pdf', 'watermark-pdf']);

      // 5. Defense-in-depth: even if randomUUID collided with User A's existing workflow ID,
      // Firestore create() rejects with ALREADY_EXISTS (409) and never overwrites User A's document.
      const collidedUuid = `${userAWfId.slice(3, 11)}-${userAWfId.slice(11, 15)}-${userAWfId.slice(15, 19)}-${userAWfId.slice(19, 23)}-${userAWfId.slice(23)}`;
      const uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(
        collidedUuid as `${string}-${string}-${string}-${string}-${string}`
      );
      try {
        const collisionRes = await fetch(`${baseUrl}/api/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userBToken}`,
          },
          body: JSON.stringify({
            name: 'Collision Attempt',
            steps: ['rotate-pdf'],
          }),
        });
        expect(collisionRes.status).toBe(409);
        expect(workflowsStore.get(userAWfId)?.ownerId).toBe('user_A');
        expect(workflowsStore.get(userAWfId)?.name).toBe('User A Confidential Pipeline');
      } finally {
        uuidSpy.mockRestore();
      }

      // 6. Owner User A can still legitimately update and delete their own workflow
      const ownerUpdateRes = await fetch(`${baseUrl}/api/workflows/${userAWfId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({ name: 'User A Updated Pipeline' }),
      });
      expect(ownerUpdateRes.status).toBe(200);
      expect(workflowsStore.get(userAWfId)?.name).toBe('User A Updated Pipeline');

      const ownerDeleteRes = await fetch(`${baseUrl}/api/workflows/${userAWfId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${userAToken}` },
      });
      expect(ownerDeleteRes.status).toBe(200);
      expect(workflowsStore.has(userAWfId)).toBe(false);
    });
  });

  describe('3. Unified Workflow Validation Boundaries & Server Quota Enforcement', () => {
    it('accepts 1 step and 10 steps, rejects 0 and 11 steps, and validates EVERY element in steps (not just steps[0])', async () => {
      // 1 step -> 201
      const oneStepRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          name: 'Single Step Workflow',
          steps: ['merge-pdf'],
        }),
      });
      expect(oneStepRes.status).toBe(201);
      const oneStepBody = await oneStepRes.json();
      const wfId: string = oneStepBody.workflow.id;

      // 10 steps -> 201
      const tenSteps = Array(10).fill('compress-pdf');
      const tenStepRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          name: 'Ten Step Workflow',
          steps: tenSteps,
        }),
      });
      expect(tenStepRes.status).toBe(201);

      // 0 steps -> 400 on POST and PUT
      for (const badSteps of [
        [],
        Array(11).fill('merge-pdf'),
        ['merge-pdf', 'invalid step with spaces!'], // valid steps[0], invalid steps[1]
        ['merge-pdf', 'compress-pdf', ''], // valid steps[0..1], empty steps[2]
        ['merge-pdf', 12345], // valid steps[0], non-string steps[1]
        ['merge-pdf', 'x'.repeat(65)], // valid steps[0], >64 chars steps[1]
      ]) {
        const badPost = await fetch(`${baseUrl}/api/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userAToken}`,
          },
          body: JSON.stringify({ name: 'Bad Steps', steps: badSteps }),
        });
        expect(badPost.status).toBe(400);

        const badPut = await fetch(`${baseUrl}/api/workflows/${wfId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userAToken}`,
          },
          body: JSON.stringify({ steps: badSteps }),
        });
        expect(badPut.status).toBe(400);
      }
    });

    it('enforces description 0-500 chars and estimatedSavedSec 0-86400 on both POST and PUT', async () => {
      // Empty description ("") and max estimatedSavedSec (86400) -> 201
      const maxSecRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          name: 'Boundary Workflow',
          description: '',
          steps: ['merge-pdf'],
          estimatedSavedSec: 86400,
        }),
      });
      expect(maxSecRes.status).toBe(201);
      const maxSecBody = await maxSecRes.json();
      expect(maxSecBody.workflow.description).toBe('');
      expect(maxSecBody.workflow.estimatedSavedSec).toBe(86400);

      const wfId: string = maxSecBody.workflow.id;

      // Update to 500-char description and 0 estimatedSavedSec -> 200
      const desc500 = 'A'.repeat(500);
      const validPut = await fetch(`${baseUrl}/api/workflows/${wfId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          description: desc500,
          estimatedSavedSec: 0,
        }),
      });
      expect(validPut.status).toBe(200);
      expect(workflowsStore.get(wfId)?.description).toBe(desc500);
      expect(workflowsStore.get(wfId)?.estimatedSavedSec).toBe(0);

      // 501-char description -> 400 on POST and PUT
      const desc501 = 'B'.repeat(501);
      const overDescPost = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          name: 'Too Long Desc',
          description: desc501,
          steps: ['merge-pdf'],
        }),
      });
      expect(overDescPost.status).toBe(400);

      const overDescPut = await fetch(`${baseUrl}/api/workflows/${wfId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({ description: desc501 }),
      });
      expect(overDescPut.status).toBe(400);

      // estimatedSavedSec out of bounds (-1, 86401, string) -> 400 on POST and PUT
      for (const badSec of [-1, 86401, '86400']) {
        const badSecPost = await fetch(`${baseUrl}/api/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userAToken}`,
          },
          body: JSON.stringify({
            name: 'Bad Saved Sec',
            steps: ['merge-pdf'],
            estimatedSavedSec: badSec,
          }),
        });
        expect(badSecPost.status).toBe(400);

        const badSecPut = await fetch(`${baseUrl}/api/workflows/${wfId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userAToken}`,
          },
          body: JSON.stringify({ estimatedSavedSec: badSec }),
        });
        expect(badSecPut.status).toBe(400);
      }
    });

    it('enforces maxWorkflows entitlement limit on POST /api/workflows (403 when limit reached)', async () => {
      const { getUserEntitlement, PLAN_LIMITS } = await import('../server/firebaseAdmin');
      vi.mocked(getUserEntitlement).mockResolvedValueOnce({
        ...PLAN_LIMITS.free,
        uid: 'user_A',
        status: 'active',
        updatedAt: 1700000000000,
        createdAt: 1700000000000,
      });

      // Pre-populate 3 workflows owned by user_A (free plan maxWorkflows = 3)
      for (let i = 1; i <= 3; i++) {
        workflowsStore.set(`wf_seed_${i}`, {
          id: `wf_seed_${i}`,
          ownerId: 'user_A',
          name: `Seed ${i}`,
          description: '',
          steps: ['merge-pdf'],
          estimatedSavedSec: 22,
          runsCount: 0,
          createdAt: 1000,
          updatedAt: 1000,
        });
      }

      const fourthRes = await fetch(`${baseUrl}/api/workflows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userAToken}`,
        },
        body: JSON.stringify({
          name: 'Fourth Workflow Exceeding Free Quota',
          steps: ['merge-pdf'],
        }),
      });
      expect(fourthRes.status).toBe(403);
      const fourthBody = await fourthRes.json();
      expect(fourthBody.limit).toBe(3);
      expect(workflowsStore.size).toBe(3);
    });
  });
});

