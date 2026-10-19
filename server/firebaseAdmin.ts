import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from './config';

// Initialize Firebase Admin once
if (!getApps().length) {
  try {
    initializeApp({
      projectId: FIREBASE_PROJECT_ID,
    });
  } catch (err) {
    console.error('Failed to initialize firebase-admin:', err);
  }
}

// Target named database if available in Firestore
export const adminDb = (() => {
  try {
    const app = getApps().length > 0 ? getApp() : initializeApp({ projectId: FIREBASE_PROJECT_ID });
    if (FIRESTORE_DATABASE_ID) {
      return getFirestore(app, FIRESTORE_DATABASE_ID);
    }
    return getFirestore(app);
  } catch {
    return getFirestore();
  }
})();

export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  planId: PlanTier;
  maxFileSizeMB: number;
  maxProtectedFiles: number;
  maxWorkflows: number;
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    planId: 'free',
    maxFileSizeMB: 15,
    maxProtectedFiles: 5,
    maxWorkflows: 3,
  },
  pro: {
    planId: 'pro',
    maxFileSizeMB: 50,
    maxProtectedFiles: 50,
    maxWorkflows: 20,
  },
  enterprise: {
    planId: 'enterprise',
    maxFileSizeMB: 150,
    maxProtectedFiles: Infinity,
    maxWorkflows: Infinity,
  },
};

export interface EntitlementRecord {
  uid: string;
  planId: PlanTier;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  provider?: string;
  subscriptionId?: string;
  customerId?: string;
  variantId?: string;
  updatedAt: number;
  createdAt: number;
}

/**
 * Reads verified user entitlement from /entitlements/{uid} on the server.
 * Never trusts client or localStorage.
 */
export async function getUserEntitlement(uid: string): Promise<EntitlementRecord & PlanLimits> {
  const fallback: EntitlementRecord & PlanLimits = {
    ...PLAN_LIMITS.free,
    uid,
    status: 'active',
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };

  if (!uid || typeof uid !== 'string') {
    return fallback;
  }

  try {
    const snap = await adminDb.collection('entitlements').doc(uid).get();
    if (!snap.exists) {
      return fallback;
    }
    const data = snap.data() as Partial<EntitlementRecord>;
    const rawPlan = String(data?.planId || 'free').toLowerCase();
    const planId: PlanTier =
      rawPlan === 'enterprise' || rawPlan === 'business'
        ? 'enterprise'
        : rawPlan === 'pro'
        ? 'pro'
        : 'free';

    const status = data?.status || 'active';
    const effectivePlan: PlanTier = status === 'active' ? planId : 'free';
    const limits = PLAN_LIMITS[effectivePlan];

    return {
      ...limits,
      uid,
      planId: effectivePlan,
      status,
      provider: data?.provider,
      subscriptionId: data?.subscriptionId,
      customerId: data?.customerId,
      variantId: data?.variantId,
      updatedAt: typeof data?.updatedAt === 'number' ? data.updatedAt : Date.now(),
      createdAt: typeof data?.createdAt === 'number' ? data.createdAt : Date.now(),
    };
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`Error reading entitlement for ${uid}:`, err);
    }
    return fallback;
  }
}

/**
 * Writes an authoritative entitlement record to /entitlements/{uid}
 * Called exclusively by the server (e.g. verified billing webhook).
 */
export async function setUserEntitlement(
  uid: string,
  record: {
    planId: PlanTier;
    status: 'active' | 'cancelled' | 'expired' | 'past_due';
    provider?: string;
    subscriptionId?: string;
    customerId?: string;
    variantId?: string;
  }
): Promise<void> {
  const now = Date.now();
  const docRef = adminDb.collection('entitlements').doc(uid);
  const snap = await docRef.get();
  const createdAt = snap.exists && snap.data()?.createdAt ? snap.data()?.createdAt : now;

  await docRef.set(
    {
      uid,
      planId: record.planId,
      status: record.status,
      provider: record.provider || 'lemonsqueezy',
      subscriptionId: record.subscriptionId || null,
      customerId: record.customerId || null,
      variantId: record.variantId || null,
      updatedAt: now,
      createdAt,
    },
    { merge: true }
  );
}
