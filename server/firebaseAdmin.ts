import crypto from 'crypto';
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

export type EntitlementStatus = 'active' | 'cancelled' | 'expired' | 'past_due';

export interface EntitlementRecord {
  uid: string;
  planId: PlanTier;
  status: EntitlementStatus;
  provider?: string;
  subscriptionId?: string;
  customerId?: string;
  variantId?: string;
  endsAt?: number | null;
  updatedAt: number;
  createdAt: number;
}

/**
 * Pure resolver that applies subscription status and endsAt expiration rules.
 * - 'active' and 'past_due' keep the paid plan unless endsAt has already passed.
 * - 'cancelled' keeps the paid plan until endsAt, then reverts to 'free'.
 * - 'expired' or past-due expiration always resolves to 'free'.
 */
export function resolveEffectiveEntitlement(
  uid: string,
  data: Partial<EntitlementRecord> | null | undefined,
  now = Date.now()
): EntitlementRecord & PlanLimits {
  const fallback: EntitlementRecord & PlanLimits = {
    ...PLAN_LIMITS.free,
    uid,
    status: 'active',
    endsAt: null,
    updatedAt: now,
    createdAt: now,
  };

  if (!data) {
    return fallback;
  }

  const rawPlan = String(data.planId || 'free').toLowerCase();
  const planId: PlanTier =
    rawPlan === 'enterprise' || rawPlan === 'business'
      ? 'enterprise'
      : rawPlan === 'pro'
      ? 'pro'
      : 'free';

  const rawStatus = String(data.status || 'active').toLowerCase();
  const status: EntitlementStatus =
    rawStatus === 'cancelled' ||
    rawStatus === 'expired' ||
    rawStatus === 'past_due' ||
    rawStatus === 'active'
      ? rawStatus
      : 'active';

  const endsAt =
    typeof data.endsAt === 'number' && Number.isFinite(data.endsAt) ? data.endsAt : null;
  const isExpiredByTime = endsAt !== null && endsAt <= now;

  let effectivePlan: PlanTier = 'free';
  let effectiveStatus: EntitlementStatus = status;

  if (status === 'expired' || isExpiredByTime) {
    effectivePlan = 'free';
    effectiveStatus = status === 'cancelled' ? 'cancelled' : 'expired';
  } else if (status === 'active' || status === 'past_due') {
    effectivePlan = planId;
  } else if (status === 'cancelled') {
    effectivePlan = endsAt !== null && endsAt > now ? planId : 'free';
  }

  const limits = PLAN_LIMITS[effectivePlan];

  return {
    ...limits,
    uid,
    planId: effectivePlan,
    status: effectiveStatus,
    provider: data.provider,
    subscriptionId: data.subscriptionId,
    customerId: data.customerId,
    variantId: data.variantId,
    endsAt,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : now,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : now,
  };
}

/**
 * Reads verified user entitlement from /entitlements/{uid} on the server.
 * Never trusts client or localStorage.
 */
export async function getUserEntitlement(uid: string): Promise<EntitlementRecord & PlanLimits> {
  const fallback = resolveEffectiveEntitlement(uid, null);

  if (!uid || typeof uid !== 'string') {
    return fallback;
  }

  try {
    const snap = await adminDb.collection('entitlements').doc(uid).get();
    if (!snap.exists) {
      return fallback;
    }
    const data = snap.data() as Partial<EntitlementRecord>;
    return resolveEffectiveEntitlement(uid, data);
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
    status: EntitlementStatus;
    provider?: string;
    subscriptionId?: string;
    customerId?: string;
    variantId?: string;
    endsAt?: number | null;
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
      createdAt,
    },
    { merge: true }
  );
}

function sanitizeWebhookDocId(eventId: string): string {
  const trimmed = String(eventId || '').trim();
  if (/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    return trimmed;
  }
  return crypto.createHash('sha256').update(trimmed).digest('hex');
}

/**
 * Atomically claims a webhook event ID in /processedWebhooks/{docId}.
 * Returns true if this is the first delivery, false if it was already processed.
 */
export async function claimProcessedWebhook(
  eventId: string,
  meta?: { eventName?: string; uid?: string }
): Promise<boolean> {
  const docId = sanitizeWebhookDocId(eventId);
  try {
    await adminDb
      .collection('processedWebhooks')
      .doc(docId)
      .create({
        eventId,
        eventName: meta?.eventName || '',
        uid: meta?.uid || '',
        processedAt: Date.now(),
      });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: unknown })?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (
      code === 6 ||
      code === 'already-exists' ||
      code === 'ALREADY_EXISTS' ||
      message.includes('ALREADY_EXISTS')
    ) {
      return false;
    }
    throw err;
  }
}

/**
 * Releases a claimed webhook lock if processing fails transiently so retries can succeed.
 */
export async function releaseProcessedWebhook(eventId: string): Promise<void> {
  const docId = sanitizeWebhookDocId(eventId);
  try {
    await adminDb.collection('processedWebhooks').doc(docId).delete();
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`Failed to release processed webhook lock ${docId}:`, err);
    }
  }
}
