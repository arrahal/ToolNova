import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import fs from 'fs';
import path from 'path';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const PROJECT_ID = 'platinum-canto-h1ttq';
const RULES_PATH = path.resolve(process.cwd(), 'firestore.rules');

describe('Firestore Security Rules Suite', () => {
  let testEnv: RulesTestEnvironment | null = null;
  let emulatorAvailable = false;

  beforeAll(async () => {
    // Check if Firestore emulator is running
    const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8085';
    try {
      const resp = await fetch(`http://${host}/`);
      if (resp.status === 200 || resp.status === 404) {
        emulatorAvailable = true;
      }
    } catch {
      emulatorAvailable = false;
    }

    if (!emulatorAvailable) {
      console.warn(
        '[Rules Test] Firestore Emulator not reachable on ' +
          host +
          '. To run live emulator rules tests, execute: npm run test:rules'
      );
      return;
    }

    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const [ip, portStr] = host.split(':');
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: ip || '127.0.0.1',
        port: parseInt(portStr || '8085', 10),
        rules,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();
    }
  });

  // Helper to get authenticated context
  const getContext = (uid?: string, emailVerified = true) => {
    if (!testEnv) throw new Error('Test environment not initialized');
    if (!uid) return testEnv.unauthenticatedContext();
    return testEnv.authenticatedContext(uid, {
      email_verified: emailVerified,
      email: `${uid}@example.com`,
    });
  };

  it('Static Contract: firestore.rules blocks all client writes to /workflows while preserving owner-only get & list', () => {
    const rulesSource = fs.readFileSync(RULES_PATH, 'utf8');

    // Extract match /workflows/{workflowId} block
    const wfMatch = rulesSource.match(/match\s+\/workflows\/\{workflowId\}\s*\{([\s\S]*?)\n\s*\}/);
    expect(wfMatch).not.toBeNull();
    const wfBlock = wfMatch![1];

    // Client create, update, delete must be unconditionally false
    expect(wfBlock).toMatch(/allow\s+create,\s*update,\s*delete:\s*if\s+false\s*;/);

    // Owner read (get & list) must remain enforced
    expect(wfBlock).toMatch(
      /allow\s+get:\s*if\s+isSignedIn\(\)\s*&&\s*isValidId\(workflowId\)\s*&&\s*existing\(\)\.ownerId\s*==\s*request\.auth\.uid\s*;/
    );
    expect(wfBlock).toMatch(
      /allow\s+list:\s*if\s+isSignedIn\(\)\s*&&\s*resource\.data\.ownerId\s*==\s*request\.auth\.uid\s*;/
    );

    // Legacy partial array check steps[0] must be completely removed
    expect(rulesSource).not.toContain('steps[0]');

    // Server-only processedWebhooks collection must block all client reads and writes
    const pwMatch = rulesSource.match(
      /match\s+\/processedWebhooks\/\{webhookId\}\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(pwMatch).not.toBeNull();
    expect(pwMatch![1]).toMatch(/allow\s+read,\s*write:\s*if\s+false\s*;/);

    // Optional profile fields allow empty strings while required fields keep min >= 1
    expect(rulesSource).toMatch(/data\.companyOrRole\.size\(\)\s*>=\s*0/);
    expect(rulesSource).toMatch(/data\.country\.size\(\)\s*>=\s*0/);
    expect(rulesSource).toMatch(/data\.phone\.size\(\)\s*>=\s*0/);
    expect(rulesSource).toMatch(/data\.fullName\.size\(\)\s*>=\s*1/);
  });

  it('Baseline: Verified user can create valid profile with planId: "free" and access private info', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // 1. Create public profile
    await assertSucceeds(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice Engineer',
        companyOrRole: 'Senior Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 2. Create private info
    await assertSucceeds(
      setDoc(doc(db, 'users/user_A/private/info'), {
        uid: 'user_A',
        email: 'alice@example.com',
        phone: '+212600000000',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // 3. Read own profile
    await assertSucceeds(getDoc(doc(db, 'users/user_A')));
    await assertSucceeds(getDoc(doc(db, 'users/user_A/private/info')));
  });

  it('Optional Profile Fields: Verified user can create profile with empty companyOrRole, country, and phone, while empty fullName or oversized fields fail', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_opt', true);
    const db = ctx.firestore();

    await assertSucceeds(
      setDoc(doc(db, 'users/user_opt'), {
        uid: 'user_opt',
        fullName: 'Opt User',
        companyOrRole: '',
        country: '',
        planId: 'free',
        joinedAt: '2026-11-20',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertSucceeds(
      setDoc(doc(db, 'users/user_opt/private/info'), {
        uid: 'user_opt',
        email: 'opt@example.com',
        phone: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Required fullName must still be non-empty
    await assertFails(
      setDoc(doc(db, 'users/user_opt'), {
        uid: 'user_opt',
        fullName: '',
        companyOrRole: '',
        country: '',
        planId: 'free',
        joinedAt: '2026-11-20',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // Max length bounds on optional fields must still hold
    await assertFails(
      updateDoc(doc(db, 'users/user_opt'), {
        country: 'C'.repeat(101),
        updatedAt: serverTimestamp(),
      })
    );
    await assertFails(
      updateDoc(doc(db, 'users/user_opt/private/info'), {
        phone: '9'.repeat(41),
        updatedAt: serverTimestamp(),
      })
    );
  });

  /* -------------------------------------------------------------
   * DIRTY DOZEN ADVERSARIAL PAYLOADS (security_spec.md)
   * ------------------------------------------------------------- */

  it('Payload 1: Identity Spoofing on UserProfile returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    await assertFails(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_B', // Spoofed UID
        fullName: 'Spoofed User',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 2: Unverified Email Write returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', false); // email_verified: false
    const db = ctx.firestore();

    await assertFails(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Unverified User',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 3: Shadow Field Injection on UserProfile (isAdmin: true) returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    await assertFails(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice Valid',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isAdmin: true, // Shadow field injection
      })
    );
  });

  it('Payload 4: Cross-User PII Leak returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed user_A profile and private info as admin
    await testEnv.withSecurityRulesDisabled(async (adminContext) => {
      const adminDb = adminContext.firestore();
      await setDoc(doc(adminDb, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      await setDoc(doc(adminDb, 'users/user_A/private/info'), {
        uid: 'user_A',
        email: 'alice@secret.com',
        phone: '+212600000000',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    // user_B attempts to read user_A's sensitive private info
    const ctxB = getContext('user_B', true);
    const dbB = ctxB.firestore();
    await assertFails(getDoc(doc(dbB, 'users/user_A/private/info')));
  });

  it('Payload 5: Orphaned Subcollection Write returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Parent document /users/user_A does NOT exist
    await assertFails(
      setDoc(doc(db, 'users/user_A/private/info'), {
        uid: 'user_A',
        email: 'alice@example.com',
        phone: '+212600000000',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 6: Direct Client Workflow Create Bypass (even valid payload by verified owner) returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed parent user
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Direct client write must fail because workflows can only be created via /api/workflows
    await assertFails(
      setDoc(doc(db, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Client Bypass Attempt',
        description: '',
        steps: ['merge-pdf'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 7: Unbounded Array / Malicious Client Workflow Write (>10 steps) returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    await assertFails(
      setDoc(doc(db, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Huge Workflow',
        description: '25 steps array exhaustion attempt',
        steps: Array(25).fill('merge-pdf'),
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 8: ID Poisoning Attack on Workflow Read & Write returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    await assertFails(getDoc(doc(db, 'workflows/bad$id!@#')));

    await assertFails(
      setDoc(doc(db, 'workflows/bad$id!@#'), {
        id: 'bad$id!@#',
        ownerId: 'user_A',
        name: 'Malicious Path ID',
        description: 'Invalid chars in doc ID',
        steps: ['merge-pdf'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 9: Direct Client Workflow Update Bypass returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed existing server-created workflow
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
      await setDoc(doc(adminDb, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Standard Workflow',
        description: 'Standard description',
        steps: ['merge-pdf', 'compress-pdf'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Even valid update fields by the verified owner must fail from the client SDK
    await assertFails(
      updateDoc(doc(db, 'workflows/wf_1'), {
        name: 'Updated Directly From Client',
        updatedAt: Date.now(),
      })
    );

    // Incrementing runsCount or mutating steps directly from client must also fail
    await assertFails(
      updateDoc(doc(db, 'workflows/wf_1'), {
        runsCount: 1,
      })
    );
  });

  it('Payload 10: Direct Client Workflow Delete Bypass & Cross-User Read return PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
      await setDoc(doc(adminDb, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Standard Workflow',
        description: '',
        steps: ['merge-pdf'],
        estimatedSavedSec: 86400,
        runsCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const ctxA = getContext('user_A', true);
    const dbA = ctxA.firestore();

    // Owner cannot delete workflow directly from client SDK (must use DELETE /api/workflows/:id)
    await assertFails(deleteDoc(doc(dbA, 'workflows/wf_1')));

    // Non-owner user_B cannot read user_A's workflow
    const ctxB = getContext('user_B', true);
    const dbB = ctxB.firestore();
    await assertFails(getDoc(doc(dbB, 'workflows/wf_1')));
  });

  it('Payload 11: Unauthorized List Scraping on Workflows returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'workflows/wf_a'), {
        id: 'wf_a',
        ownerId: 'user_A',
        name: 'Alice Workflow',
        description: '',
        steps: ['merge-pdf'],
        estimatedSavedSec: 22,
        runsCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const ctxB = getContext('user_B', true);
    const dbB = ctxB.firestore();

    // Querying entire /workflows collection without filtering ownerId == user_B
    await assertFails(getDocs(collection(dbB, 'workflows')));

    // Querying another user's workflows explicitly
    await assertFails(
      getDocs(query(collection(dbB, 'workflows'), where('ownerId', '==', 'user_A')))
    );
  });

  it('Payload 12: Immutable Audit Log Tampering returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
      await setDoc(doc(adminDb, 'activityLogs/log_1'), {
        id: 'log_1',
        ownerId: 'user_A',
        toolTitle: 'PDF Protect',
        detail: 'Protected secret.pdf',
        time: '12:00:00',
        createdAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Attempting to modify audit history
    await assertFails(
      updateDoc(doc(db, 'activityLogs/log_1'), {
        detail: 'Tampered audit history',
      })
    );
  });

  /* -------------------------------------------------------------
   * WORKFLOWS: OWNER READ ALLOWED & SERVER-SEEDED UNIFIED BOUNDS
   * ------------------------------------------------------------- */

  it('Workflows: Owner can get and list their own server-created workflows (1-10 steps, 0-500 desc, 0-86400 sec), while unauthenticated and non-owners cannot', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
      await setDoc(doc(adminDb, 'workflows/wf_min_bounds'), {
        id: 'wf_min_bounds',
        ownerId: 'user_A',
        name: 'Single Step Empty Desc',
        description: '',
        steps: ['merge-pdf'],
        estimatedSavedSec: 0,
        runsCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await setDoc(doc(adminDb, 'workflows/wf_max_bounds'), {
        id: 'wf_max_bounds',
        ownerId: 'user_A',
        name: 'Ten Steps Max Saved Sec',
        description: 'D'.repeat(500),
        steps: Array(10).fill('compress-pdf'),
        estimatedSavedSec: 86400,
        runsCount: 5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await setDoc(doc(adminDb, 'workflows/wf_other_user'), {
        id: 'wf_other_user',
        ownerId: 'user_B',
        name: 'Bob Workflow',
        description: 'Owned by user_B',
        steps: ['split-pdf'],
        estimatedSavedSec: 30,
        runsCount: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    // Owner user_A can get and list their own workflows
    const ctxA = getContext('user_A', true);
    const dbA = ctxA.firestore();

    await assertSucceeds(getDoc(doc(dbA, 'workflows/wf_min_bounds')));
    await assertSucceeds(getDoc(doc(dbA, 'workflows/wf_max_bounds')));

    const listSnap = await assertSucceeds(
      getDocs(query(collection(dbA, 'workflows'), where('ownerId', '==', 'user_A')))
    );
    expect(listSnap.size).toBe(2);

    // Owner user_A cannot read user_B's workflow
    await assertFails(getDoc(doc(dbA, 'workflows/wf_other_user')));

    // Unauthenticated client cannot read or list workflows
    const unauthDb = getContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'workflows/wf_min_bounds')));
    await assertFails(
      getDocs(query(collection(unauthDb, 'workflows'), where('ownerId', '==', 'user_A')))
    );
  });

  /* -------------------------------------------------------------
   * PLAN INTEGRITY, ENTITLEMENTS, LEGACY VAULT REMOVAL
   * ------------------------------------------------------------- */

  it('Task 4 - Plan Integrity: User cannot set planId to "pro" or "business" on create', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Clients must be forced to 'free' on create
    await assertFails(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice Hacker',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'pro', // Forbidden on creation
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    await assertFails(
      setDoc(doc(db, 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice Hacker',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'business', // Forbidden on creation
        joinedAt: '2026-10-18',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Task 4 - Plan Integrity: User cannot upgrade or modify planId on update', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed existing user with planId: 'free'
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'users/user_A'), {
        uid: 'user_A',
        fullName: 'Alice Normal',
        companyOrRole: 'Engineer',
        country: 'Morocco',
        planId: 'free',
        joinedAt: '2026-10-18',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Attempting to self-upgrade to 'pro' on existing record
    await assertFails(
      updateDoc(doc(db, 'users/user_A'), {
        planId: 'pro',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Task 4 - Entitlements: Client writes to /entitlements are blocked', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Client cannot create entitlement doc
    await assertFails(
      setDoc(doc(db, 'entitlements/user_A'), {
        uid: 'user_A',
        planId: 'pro',
        status: 'active',
      })
    );

    // Client cannot update entitlement doc
    await assertFails(
      updateDoc(doc(db, 'entitlements/user_A'), {
        planId: 'business',
      })
    );

    // Client cannot delete entitlement doc
    await assertFails(deleteDoc(doc(db, 'entitlements/user_A')));
  });

  it('Task 4 - Entitlements: User can only read their own entitlement, not others', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed server-verified entitlements
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
      await setDoc(doc(adminDb, 'entitlements/user_A'), {
        uid: 'user_A',
        planId: 'pro',
        status: 'active',
        provider: 'lemonsqueezy',
        updatedAt: Date.now(),
      });
      await setDoc(doc(adminDb, 'entitlements/user_B'), {
        uid: 'user_B',
        planId: 'business',
        status: 'active',
        provider: 'lemonsqueezy',
        updatedAt: Date.now(),
      });
    });

    // 1. user_A reads own entitlement -> SUCCEEDS
    const ctxA = getContext('user_A', true);
    await assertSucceeds(getDoc(doc(ctxA.firestore(), 'entitlements/user_A')));

    // 2. user_A reads user_B's entitlement -> FAILS
    await assertFails(getDoc(doc(ctxA.firestore(), 'entitlements/user_B')));

    // 3. Unauthenticated reads user_A's entitlement -> FAILS
    const ctxUnauth = getContext();
    await assertFails(getDoc(doc(ctxUnauth.firestore(), 'entitlements/user_A')));
  });

  it('Task 4 - Legacy Vault Removal: documentAccessTokens cannot be written or read by any client', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed legacy token document
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'documentAccessTokens/tok_123'), {
        id: 'tok_123',
        ownerId: 'user_A',
        passwordHash: 'secret_hash',
        usedCount: 0,
      });
    });

    const ctxA = getContext('user_A', true);
    const dbA = ctxA.firestore();

    // Read attempt on removed legacy collection -> FAILS
    await assertFails(getDoc(doc(dbA, 'documentAccessTokens/tok_123')));

    // Write attempt on removed legacy collection -> FAILS
    await assertFails(
      setDoc(doc(dbA, 'documentAccessTokens/new_tok'), {
        id: 'new_tok',
        ownerId: 'user_A',
        passwordHash: 'injected_hash',
      })
    );
  });

  it('Task 2 - Processed Webhooks: All client reads and writes to /processedWebhooks are blocked', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await setDoc(doc(adminCtx.firestore(), 'processedWebhooks/wh_1'), {
        eventId: 'ls_wh_1',
        eventName: 'order_created',
        uid: 'user_A',
        processedAt: Date.now(),
      });
    });

    const ctxA = getContext('user_A', true);
    const dbA = ctxA.firestore();
    const unauthDb = getContext().firestore();

    await assertFails(getDoc(doc(dbA, 'processedWebhooks/wh_1')));
    await assertFails(getDocs(collection(dbA, 'processedWebhooks')));
    await assertFails(
      setDoc(doc(dbA, 'processedWebhooks/wh_2'), {
        eventId: 'ls_wh_2',
        eventName: 'order_created',
        uid: 'user_A',
        processedAt: Date.now(),
      })
    );
    await assertFails(updateDoc(doc(dbA, 'processedWebhooks/wh_1'), { uid: 'user_B' }));
    await assertFails(deleteDoc(doc(dbA, 'processedWebhooks/wh_1')));
    await assertFails(getDoc(doc(unauthDb, 'processedWebhooks/wh_1')));
  });
});
