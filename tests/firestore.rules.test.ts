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

const PROJECT_ID = 'gen-lang-client-0209937761';
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
          '. To run rules unit tests, execute: npm run test:rules'
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

  it('Payload 6: Client Timestamp Forgery on Workflow returns PERMISSION_DENIED', async () => {
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

    await assertFails(
      setDoc(doc(db, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Forged Workflow',
        description: 'Past timestamp forgery',
        steps: ['pdf-merge', 'pdf-protect'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: Timestamp.fromDate(new Date('2020-01-01')), // Forged past timestamp
        updatedAt: Timestamp.fromDate(new Date('2020-01-01')),
      })
    );
  });

  it('Payload 7: Unbounded Array Exhaustion on Workflow (>10 steps) returns PERMISSION_DENIED', async () => {
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
        steps: Array(25).fill('pdf-merge'), // 25 elements > max 10
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 8: ID Poisoning Attack returns PERMISSION_DENIED', async () => {
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
      setDoc(doc(db, 'workflows/bad$id!@#'), {
        id: 'bad$id!@#',
        ownerId: 'user_A',
        name: 'Malicious Path ID',
        description: 'Invalid chars in doc ID',
        steps: ['pdf-merge', 'pdf-protect'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 9: Update-Gap / Type Poisoning on Workflow returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    // Seed existing valid workflow
    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
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
      await setDoc(doc(adminDb, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Standard Workflow',
        description: 'Standard description',
        steps: ['pdf-merge', 'pdf-protect'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Attempting to update name to 5,000 chars
    await assertFails(
      updateDoc(doc(db, 'workflows/wf_1'), {
        name: 'X'.repeat(5000),
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 10: Immutable Field Mutation on Workflow returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    await testEnv.withSecurityRulesDisabled(async (adminCtx) => {
      const adminDb = adminCtx.firestore();
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
      await setDoc(doc(adminDb, 'workflows/wf_1'), {
        id: 'wf_1',
        ownerId: 'user_A',
        name: 'Standard Workflow',
        description: 'Standard description',
        steps: ['pdf-merge', 'pdf-protect'],
        estimatedSavedSec: 45,
        runsCount: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    });

    const ctx = getContext('user_A', true);
    const db = ctx.firestore();

    // Attempting to mutate ownerId to user_B
    await assertFails(
      updateDoc(doc(db, 'workflows/wf_1'), {
        ownerId: 'user_B',
        updatedAt: serverTimestamp(),
      })
    );
  });

  it('Payload 11: Unauthorized List Scraping on Workflows returns PERMISSION_DENIED', async () => {
    if (!emulatorAvailable || !testEnv) return;

    const ctxB = getContext('user_B', true);
    const dbB = ctxB.firestore();

    // Querying entire /workflows collection without filtering ownerId == user_B
    await assertFails(getDocs(collection(dbB, 'workflows')));
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
   * TASK 4 SPECIFIC ADDITIONS: Plan Integrity, Entitlements, Vault Removal
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
});
