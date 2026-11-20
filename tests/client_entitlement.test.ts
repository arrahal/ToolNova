import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type SnapshotObserver = {
  next: (snap: { exists: () => boolean; data: () => Record<string, unknown> | undefined }) => void;
  error?: (err: Error) => void;
};

const { mockUnsubscribe, mockOnSnapshot, mockDoc, mockCurrentUser, mockGetIdToken } = vi.hoisted(
  () => ({
    mockUnsubscribe: vi.fn(),
    mockOnSnapshot: vi.fn(),
    mockDoc: vi.fn((_db: unknown, collectionName: string, docId: string) => ({
      path: `${collectionName}/${docId}`,
    })),
    mockGetIdToken: vi.fn(async () => 'firebase_id_token_abc'),
    mockCurrentUser: {
      current: {
        uid: 'client_user_1',
        getIdToken: async () => mockGetIdToken(),
      } as { uid: string; getIdToken: () => Promise<string> } | null,
    },
  })
);

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({
    get currentUser() {
      return mockCurrentUser.current;
    },
  })),
  GoogleAuthProvider: class {
    setCustomParameters = vi.fn();
  },
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  doc: mockDoc,
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: mockOnSnapshot,
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaV3Provider: class {},
}));

import {
  resolvePlanTierFromEntitlementData,
  subscribeToEntitlement,
  createWorkflowViaApi,
  deleteWorkflowViaApi,
  buildDefaultProfile,
  WorkflowApiError,
} from '../src/lib/firebase';
import { UI_TRANSLATIONS } from '../src/data/translations';

describe('TASK 3 — Client Entitlement Sync & Server-Mediated Workflows', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser.current = {
      uid: 'client_user_1',
      getIdToken: async () => mockGetIdToken(),
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('resolvePlanTierFromEntitlementData maps server entitlement statuses and endsAt expiry accurately', () => {
    expect(resolvePlanTierFromEntitlementData(null)).toBe('free');
    expect(resolvePlanTierFromEntitlementData({ planId: 'pro', status: 'active' })).toBe('pro');
    expect(resolvePlanTierFromEntitlementData({ planId: 'enterprise', status: 'active' })).toBe(
      'business'
    );
    expect(resolvePlanTierFromEntitlementData({ planId: 'pro', status: 'past_due' })).toBe('pro');

    const futureMs = Date.now() + 3600_000;
    const pastMs = Date.now() - 1000;
    expect(
      resolvePlanTierFromEntitlementData({
        planId: 'pro',
        status: 'cancelled',
        endsAt: futureMs,
      })
    ).toBe('pro');
    expect(
      resolvePlanTierFromEntitlementData({
        planId: 'pro',
        status: 'cancelled',
        endsAt: pastMs,
      })
    ).toBe('free');
    expect(resolvePlanTierFromEntitlementData({ planId: 'pro', status: 'expired' })).toBe('free');
  });

  it('subscribeToEntitlement listens to doc(db, "entitlements", uid) and streams live upgrades without page refresh', () => {
    let capturedObserver: SnapshotObserver | null = null;
    mockOnSnapshot.mockImplementation(
      (
        _ref: unknown,
        next: SnapshotObserver['next'],
        error?: SnapshotObserver['error']
      ) => {
        capturedObserver = { next, error };
        return mockUnsubscribe;
      }
    );

    const updates: string[] = [];
    const unsubscribe = subscribeToEntitlement('client_user_1', (plan) => {
      updates.push(plan);
    });

    expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'entitlements', 'client_user_1');
    expect(capturedObserver).not.toBeNull();

    // Initially no entitlement document exists -> fallback 'free'
    capturedObserver!.next({ exists: () => false, data: () => undefined });
    // Webhook upgrades user in Firestore -> live update to 'pro'
    capturedObserver!.next({
      exists: () => true,
      data: () => ({ uid: 'client_user_1', planId: 'pro', status: 'active' }),
    });
    // Upgrade to enterprise -> mapped to UI 'business'
    capturedObserver!.next({
      exists: () => true,
      data: () => ({ uid: 'client_user_1', planId: 'enterprise', status: 'active' }),
    });
    // Listener error -> safely falls back to 'free'
    capturedObserver!.error?.(new Error('Permission denied'));

    expect(updates).toEqual(['free', 'pro', 'business', 'free']);

    unsubscribe();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('createWorkflowViaApi throws WorkflowApiError(403) with server message on maxWorkflows limit and attaches ID token', async () => {
    const serverMsg =
      'تم استنفاد الحد الأقصى لمسارات العمل المسموحة لخطتك الحالية (3 مسارات). يرجى الترقية لإضافة المزيد من المسارات المؤتمتة.';

    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: serverMsg,
        planId: 'free',
        limit: 3,
        currentCount: 3,
      }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await createWorkflowViaApi({
        name: 'Fourth Workflow',
        description: 'Over limit',
        steps: ['merge-pdf'],
      });
    } catch (err) {
      caught = err;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflows',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase_id_token_abc',
        }),
      })
    );
    expect(caught).toBeInstanceOf(WorkflowApiError);
    const apiErr = caught as WorkflowApiError;
    expect(apiErr.status).toBe(403);
    expect(apiErr.message).toBe(serverMsg);
    expect(apiErr.limit).toBe(3);
    expect(apiErr.planId).toBe('free');
  });

  it('deleteWorkflowViaApi sends DELETE /api/workflows/:id with Firebase ID token', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await deleteWorkflowViaApi('wf_abc123');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/workflows/wf_abc123',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer firebase_id_token_abc',
        }),
      })
    );
  });

  it('buildDefaultProfile creates clean profiles without placeholder phone, country, or companyOrRole', () => {
    const profile = buildDefaultProfile(
      {
        uid: 'user_xyz',
        displayName: 'Jane Doe',
        email: 'jane@example.com',
        photoURL: 'https://example.com/avatar.png',
      },
      'free'
    );

    expect(profile.uid).toBe('user_xyz');
    expect(profile.fullName).toBe('Jane Doe');
    expect(profile.email).toBe('jane@example.com');
    expect(profile.photoURL).toBe('https://example.com/avatar.png');
    expect(profile.phone).toBe('');
    expect(profile.companyOrRole).toBe('');
    expect(profile.country).toBe('');
    expect(profile.planId).toBe('free');
    expect(profile.joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('UI_TRANSLATIONS defines identical non-empty keys across ar, fr, en, and es', () => {
    const baseKeys = Object.keys(UI_TRANSLATIONS.en).sort();
    for (const lang of ['ar', 'fr', 'en', 'es'] as const) {
      expect(Object.keys(UI_TRANSLATIONS[lang]).sort()).toEqual(baseKeys);
      expect(UI_TRANSLATIONS[lang].workflowCompletedDetail).toContain('{count}');
      expect(UI_TRANSLATIONS[lang].workflowStepProgress).toContain('{current}');
      expect(UI_TRANSLATIONS[lang].workflowStepProgress).toContain('{total}');
    }
  });
});
