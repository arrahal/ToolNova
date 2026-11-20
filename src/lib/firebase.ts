import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { UserProfileData } from '../components/AuthAccountModal';
import { WorkflowPreset } from '../data/toolsData';

function resolveConfigValue(envVal: unknown, fallback: string | undefined): string {
  if (typeof envVal === 'string') {
    const trimmed = envVal.trim();
    if (
      trimmed.length > 0 &&
      trimmed !== 'undefined' &&
      trimmed !== 'null' &&
      !trimmed.startsWith('YOUR_') &&
      trimmed !== 'remixed-project-id'
    ) {
      return trimmed;
    }
  }
  return (fallback || '').trim();
}

const resolvedProjectId = resolveConfigValue(
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  firebaseAppletConfig.projectId
);

const appletDatabaseId = (firebaseAppletConfig as { firestoreDatabaseId?: string })
  .firestoreDatabaseId;

const resolvedDatabaseId =
  resolveConfigValue(
    import.meta.env.VITE_FIREBASE_DATABASE_ID,
    resolvedProjectId === firebaseAppletConfig.projectId ? appletDatabaseId : undefined
  ) || undefined;

// 1. Unified Firebase Configuration
// Reads from environment variables with firebase-applet-config.json as default.
// No hardcoded placeholder keys.
export const firebaseConfig = {
  apiKey: resolveConfigValue(import.meta.env.VITE_FIREBASE_API_KEY, firebaseAppletConfig.apiKey),
  authDomain: resolveConfigValue(
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    firebaseAppletConfig.authDomain
  ),
  projectId: resolvedProjectId,
  storageBucket: resolveConfigValue(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    firebaseAppletConfig.storageBucket
  ),
  messagingSenderId: resolveConfigValue(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppletConfig.messagingSenderId
  ),
  appId: resolveConfigValue(import.meta.env.VITE_FIREBASE_APP_ID, firebaseAppletConfig.appId),
  firestoreDatabaseId: resolvedDatabaseId,
};

// 2. Single Firebase App & Firestore Initialization Instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  if (typeof window !== 'undefined') {
    try {
      // Force HTTP long-polling in browser/iframe environments so cross-origin preview iframes,
      // proxies, or privacy shields blocking WebChannel streams do not mark the client offline.
      return initializeFirestore(
        app,
        { experimentalForceLongPolling: true },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      // Instance already initialized (e.g., HMR reload)
    }
  }
  return firebaseConfig.firestoreDatabaseId
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

export const db: Firestore = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// 3. App Check with reCAPTCHA v3
const recaptchaKey =
  import.meta.env.VITE_RECAPTCHA_SITE_KEY ||
  (firebaseAppletConfig as { recaptchaSiteKey?: string })?.recaptchaSiteKey ||
  '';

if (typeof window !== 'undefined') {
  if (import.meta.env.DEV) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  if (recaptchaKey && recaptchaKey.trim().length > 0) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(recaptchaKey.trim()),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      console.warn('Firebase App Check initialization error:', err);
    }
  }
}

// 4. Auth helpers
export async function signInWithGoogle(): Promise<FirebaseUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await firebaseSignOut(auth);
}

// 5. Firestore Error & Sanitization helpers
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => void testConnection(), { once: true });
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          retryError.message.includes('the client is offline') &&
          (typeof navigator === 'undefined' || navigator.onLine !== false)
        ) {
          console.error('Please check your Firebase configuration.');
        }
      }
    }
  }
}

if (typeof window !== 'undefined' && !import.meta.env.VITEST) {
  void testConnection();
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function clampString(raw: string, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (raw || '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

// 6. User Profile Queries
export async function fetchUserProfileFromFirestore(
  uid: string
): Promise<UserProfileData | null> {
  const cleanUid = sanitizeId(uid);
  const publicPath = `users/${cleanUid}`;
  const privatePath = `users/${cleanUid}/private/info`;

  let pubSnap;
  try {
    pubSnap = await getDoc(doc(db, 'users', cleanUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  if (!pubSnap || !pubSnap.exists()) {
    return null;
  }

  let privSnap;
  try {
    privSnap = await getDoc(doc(db, 'users', cleanUid, 'private', 'info'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  const pubData = pubSnap.data();
  const privData = privSnap && privSnap.exists() ? privSnap.data() : null;

  let verifiedPlanId: 'free' | 'pro' | 'business' = 'free';
  try {
    const entSnap = await getDoc(doc(db, 'entitlements', cleanUid));
    if (entSnap && entSnap.exists()) {
      const entData = entSnap.data();
      const raw = String(entData?.planId || '').toLowerCase();
      if (raw === 'enterprise' || raw === 'business') {
        verifiedPlanId = 'business';
      } else if (raw === 'pro') {
        verifiedPlanId = 'pro';
      }
    }
  } catch {
    // Default to 'free'
  }

  return {
    uid: cleanUid,
    fullName: String(pubData.fullName || 'Professional User'),
    companyOrRole: String(pubData.companyOrRole || 'Independent Professional'),
    country: String(pubData.country || 'Morocco'),
    planId: verifiedPlanId,
    joinedAt: String(pubData.joinedAt || new Date().toISOString().slice(0, 10)),
    email: String(privData?.email || auth.currentUser?.email || 'user@example.com'),
    phone: String(privData?.phone || '+212 600-000000'),
  };
}

export async function saveUserProfileToFirestore(
  uid: string,
  profile: UserProfileData
): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const publicRef = doc(db, 'users', cleanUid);
  const privateRef = doc(db, 'users', cleanUid, 'private', 'info');

  const safeFullName = clampString(profile.fullName, 1, 120, 'ToolNova User');
  const safeCompany = clampString(profile.companyOrRole, 1, 120, 'Independent Professional');
  const safeCountry = clampString(profile.country, 1, 100, 'Morocco');
  const safeJoinedAt = clampString(
    profile.joinedAt,
    4,
    40,
    new Date().toISOString().slice(0, 10)
  );
  const safeEmail = clampString(
    profile.email || auth.currentUser?.email || 'user@example.com',
    3,
    254,
    'user@example.com'
  );
  const safePhone = clampString(profile.phone, 3, 40, '+212 600-000000');

  let existingPub;
  try {
    existingPub = await getDoc(publicRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${cleanUid}`);
  }

  if (!existingPub || !existingPub.exists()) {
    const batch = writeBatch(db);
    batch.set(publicRef, {
      uid: cleanUid,
      fullName: safeFullName,
      companyOrRole: safeCompany,
      country: safeCountry,
      planId: 'free',
      joinedAt: safeJoinedAt,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(privateRef, {
      uid: cleanUid,
      email: safeEmail,
      phone: safePhone,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${cleanUid}`);
    }
  } else {
    try {
      await updateDoc(publicRef, {
        fullName: safeFullName,
        companyOrRole: safeCompany,
        country: safeCountry,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${cleanUid}`);
    }

    let existingPriv;
    try {
      existingPriv = await getDoc(privateRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `users/${cleanUid}/private/info`);
    }

    if (!existingPriv || !existingPriv.exists()) {
      try {
        await setDoc(privateRef, {
          uid: cleanUid,
          email: safeEmail,
          phone: safePhone,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `users/${cleanUid}/private/info`);
      }
    } else {
      try {
        await updateDoc(privateRef, {
          email: safeEmail,
          phone: safePhone,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${cleanUid}/private/info`);
      }
    }
  }
}

export async function updateUserPlanInFirestore(
  _uid: string,
  _planId: 'free' | 'pro' | 'business'
): Promise<void> {
  console.warn(
    '[Plan Integrity] Client-side planId mutation blocked. Plans are managed server-side via verified billing webhooks at /entitlements/{uid}.'
  );
}

// 7. Workflows (Server-Mediated via /api/workflows) & Activity Logs
export const WORKFLOW_VALIDATION_LIMITS = {
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 120,
  MIN_DESCRIPTION_LENGTH: 0,
  MAX_DESCRIPTION_LENGTH: 500,
  MIN_STEPS: 1,
  MAX_STEPS: 10,
  MIN_ESTIMATED_SAVED_SEC: 0,
  MAX_ESTIMATED_SAVED_SEC: 86400,
} as const;

export interface WorkflowMutationInput {
  name: string;
  description: string;
  steps: string[];
  estimatedSavedSec?: number;
}

async function getVerifiedAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول بحساب موثق لإدارة مسارات العمل.');
  }
  return user.getIdToken();
}

function normalizeWorkflowApiPayload(input: WorkflowMutationInput): {
  name: string;
  description: string;
  steps: string[];
  estimatedSavedSec: number;
} {
  const cleanName = (input.name || '').trim();
  if (
    cleanName.length < WORKFLOW_VALIDATION_LIMITS.MIN_NAME_LENGTH ||
    cleanName.length > WORKFLOW_VALIDATION_LIMITS.MAX_NAME_LENGTH
  ) {
    throw new Error('اسم مسار العمل يجب أن يكون بين 1 و 120 حرفاً.');
  }

  const cleanDescription = (input.description ?? '').trim();
  if (cleanDescription.length > WORKFLOW_VALIDATION_LIMITS.MAX_DESCRIPTION_LENGTH) {
    throw new Error('وصف مسار العمل يجب ألا يتجاوز 500 حرف.');
  }

  if (
    !Array.isArray(input.steps) ||
    input.steps.length < WORKFLOW_VALIDATION_LIMITS.MIN_STEPS ||
    input.steps.length > WORKFLOW_VALIDATION_LIMITS.MAX_STEPS
  ) {
    throw new Error('يجب أن يحتوي مسار العمل على ما بين 1 و 10 خطوات.');
  }

  const cleanSteps = input.steps.map((s) => String(s).trim());
  for (const stepId of cleanSteps) {
    if (stepId.length < 1 || stepId.length > 64 || !/^[a-zA-Z0-9_\-]+$/.test(stepId)) {
      throw new Error('معرّف إحدى خطوات مسار العمل غير صالح.');
    }
  }

  const rawEstimated =
    input.estimatedSavedSec === undefined
      ? cleanSteps.length * 22
      : Number(input.estimatedSavedSec);
  if (
    !Number.isFinite(rawEstimated) ||
    rawEstimated < WORKFLOW_VALIDATION_LIMITS.MIN_ESTIMATED_SAVED_SEC ||
    rawEstimated > WORKFLOW_VALIDATION_LIMITS.MAX_ESTIMATED_SAVED_SEC
  ) {
    throw new Error('قيمة الوقت المقدر الموفر يجب أن تكون بين 0 و 86400 ثانية.');
  }

  return {
    name: cleanName,
    description: cleanDescription,
    steps: cleanSteps,
    estimatedSavedSec: Math.round(rawEstimated),
  };
}

export async function createWorkflowViaApi(
  input: WorkflowMutationInput
): Promise<WorkflowPreset> {
  const token = await getVerifiedAuthToken();
  const payload = normalizeWorkflowApiPayload(input);

  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    workflow?: WorkflowPreset;
  };

  if (!res.ok || !body.workflow) {
    throw new Error(body.error || 'فشل إنشاء مسار العمل عبر الخادم.');
  }

  return {
    id: String(body.workflow.id),
    name: String(body.workflow.name),
    description: String(body.workflow.description ?? ''),
    steps: Array.isArray(body.workflow.steps) ? body.workflow.steps.map(String) : payload.steps,
    estimatedSavedSec:
      typeof body.workflow.estimatedSavedSec === 'number'
        ? body.workflow.estimatedSavedSec
        : payload.estimatedSavedSec,
    runsCount: typeof body.workflow.runsCount === 'number' ? body.workflow.runsCount : 0,
  };
}

export async function updateWorkflowViaApi(
  workflowId: string,
  input: WorkflowMutationInput
): Promise<WorkflowPreset> {
  const cleanId = workflowId.trim();
  if (!cleanId || cleanId.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(cleanId)) {
    throw new Error('معرّف مسار العمل غير صالح.');
  }

  const token = await getVerifiedAuthToken();
  const payload = normalizeWorkflowApiPayload(input);

  const res = await fetch(`/api/workflows/${encodeURIComponent(cleanId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    workflow?: Partial<WorkflowPreset>;
  };

  if (!res.ok) {
    throw new Error(body.error || 'فشل تعديل مسار العمل عبر الخادم.');
  }

  return {
    id: cleanId,
    name: String(body.workflow?.name ?? payload.name),
    description: String(body.workflow?.description ?? payload.description),
    steps: Array.isArray(body.workflow?.steps)
      ? body.workflow.steps.map(String)
      : payload.steps,
    estimatedSavedSec:
      typeof body.workflow?.estimatedSavedSec === 'number'
        ? body.workflow.estimatedSavedSec
        : payload.estimatedSavedSec,
    runsCount: typeof body.workflow?.runsCount === 'number' ? body.workflow.runsCount : 0,
  };
}

export async function deleteWorkflowViaApi(workflowId: string): Promise<void> {
  const cleanId = workflowId.trim();
  if (!cleanId || cleanId.length > 128 || !/^[a-zA-Z0-9_\-]+$/.test(cleanId)) {
    throw new Error('معرّف مسار العمل غير صالح.');
  }

  const token = await getVerifiedAuthToken();
  const res = await fetch(`/api/workflows/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(body.error || 'فشل حذف مسار العمل عبر الخادم.');
  }
}

export async function saveActivityLogToFirestore(
  uid: string,
  log: { id: string; toolTitle: string; detail: string; time: string }
): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const cleanLogId = sanitizeId(log.id);
  const logRef = doc(db, 'activityLogs', cleanLogId);

  const payload = {
    id: cleanLogId,
    ownerId: cleanUid,
    toolTitle: clampString(log.toolTitle, 1, 140, 'Tool Execution'),
    detail: clampString(log.detail, 1, 300, 'Completed locally'),
    time: clampString(log.time, 1, 32, new Date().toTimeString().slice(0, 8)),
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(logRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `activityLogs/${cleanLogId}`);
  }
}

export function subscribeToUserWorkspace(
  uid: string,
  onWorkflows: (workflows: WorkflowPreset[]) => void,
  onLogs: (logs: { id: string; toolTitle: string; detail: string; time: string }[]) => void
): () => void {
  const cleanUid = sanitizeId(uid);
  const wfQuery = query(collection(db, 'workflows'), where('ownerId', '==', cleanUid));
  const logsQuery = query(collection(db, 'activityLogs'), where('ownerId', '==', cleanUid));

  const unsubWf = onSnapshot(
    wfQuery,
    (snapshot) => {
      const items: WorkflowPreset[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        items.push({
          id: String(d.id || docSnap.id),
          name: String(d.name || 'Custom Workflow'),
          description: String(d.description ?? ''),
          steps:
            Array.isArray(d.steps) && d.steps.length > 0
              ? d.steps.map(String)
              : ['merge-pdf'],
          estimatedSavedSec:
            typeof d.estimatedSavedSec === 'number' ? d.estimatedSavedSec : 45,
          runsCount: typeof d.runsCount === 'number' ? d.runsCount : 0,
        });
      });
      onWorkflows(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'workflows');
    }
  );

  const unsubLogs = onSnapshot(
    logsQuery,
    (snapshot) => {
      const logs: { id: string; toolTitle: string; detail: string; time: string }[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        logs.push({
          id: String(d.id || docSnap.id),
          toolTitle: String(d.toolTitle || ''),
          detail: String(d.detail || ''),
          time: String(d.time || ''),
        });
      });
      onLogs(logs);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'activityLogs');
    }
  );

  return () => {
    unsubWf();
    unsubLogs();
  };
}

export { signInWithPopup, firebaseSignOut, onAuthStateChanged };
export type { FirebaseUser };
