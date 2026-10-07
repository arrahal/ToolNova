import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  getFirestore,
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
import firebaseConfig from '../firebase-applet-config.json';
import { UserProfileData } from './components/AuthAccountModal';
import { WorkflowPreset } from './data/toolsData';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Sanitization helpers matching firebase-blueprint.json & firestore.rules
function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

function clampString(raw: string, minLen: number, maxLen: number, fallback: string): string {
  const trimmed = (raw || '').trim();
  const base = trimmed.length >= minLen ? trimmed : fallback;
  return base.slice(0, maxLen);
}

/**
 * Fetch both public profile (/users/{uid}) and isolated PII (/users/{uid}/private/info)
 */
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

  const planId =
    pubData.planId === 'free' || pubData.planId === 'pro' || pubData.planId === 'business'
      ? pubData.planId
      : 'pro';

  return {
    uid: cleanUid,
    fullName: String(pubData.fullName || 'Professional User'),
    companyOrRole: String(pubData.companyOrRole || 'Independent Professional'),
    country: String(pubData.country || 'Morocco'),
    planId,
    joinedAt: String(pubData.joinedAt || new Date().toISOString().slice(0, 10)),
    email: String(privData?.email || auth.currentUser?.email || 'user@example.com'),
    phone: String(privData?.phone || '+212 600-000000'),
  };
}

/**
 * Save or update user profile & isolated PII in Firestore
 */
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
  const safePlanId: 'free' | 'pro' | 'business' =
    profile.planId === 'free' || profile.planId === 'pro' || profile.planId === 'business'
      ? profile.planId
      : 'pro';
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

  if (!existingPub.exists()) {
    const batch = writeBatch(db);
    batch.set(publicRef, {
      uid: cleanUid,
      fullName: safeFullName,
      companyOrRole: safeCompany,
      country: safeCountry,
      planId: safePlanId,
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
        planId: safePlanId,
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

    if (!existingPriv.exists()) {
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

/**
 * Update only the active subscription plan in Firestore
 */
export async function updateUserPlanInFirestore(
  uid: string,
  planId: 'free' | 'pro' | 'business'
): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const publicRef = doc(db, 'users', cleanUid);
  try {
    await updateDoc(publicRef, {
      planId,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${cleanUid}`);
  }
}

/**
 * Create a custom workflow in Firestore
 */
export async function saveWorkflowToFirestore(
  uid: string,
  wf: WorkflowPreset
): Promise<void> {
  const cleanUid = sanitizeId(uid);
  const cleanWfId = sanitizeId(wf.id);
  const wfRef = doc(db, 'workflows', cleanWfId);

  const boundedSteps = (wf.steps || [])
    .slice(0, 10)
    .map((s) => clampString(String(s), 1, 64, 'pdf-merge'));
  while (boundedSteps.length < 2) {
    boundedSteps.push('pdf-merge');
  }

  const payload = {
    id: cleanWfId,
    ownerId: cleanUid,
    name: clampString(wf.name, 1, 120, 'Custom Workflow'),
    description: clampString(wf.description, 1, 400, 'Automated multi-step workflow'),
    steps: boundedSteps,
    estimatedSavedSec: Math.max(0, Math.min(86400, Number(wf.estimatedSavedSec) || 45)),
    runsCount: Math.max(0, Math.min(1000000, Number(wf.runsCount) || 0)),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(wfRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `workflows/${cleanWfId}`);
  }
}

/**
 * Record an activity log entry in Firestore
 */
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

/**
 * Subscribe to the authenticated user's custom workflows and activity logs
 */
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
          description: String(d.description || ''),
          steps: Array.isArray(d.steps) ? d.steps.map(String) : ['pdf-merge', 'pdf-protect'],
          estimatedSavedSec: Number(d.estimatedSavedSec) || 45,
          runsCount: Number(d.runsCount) || 1,
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

export { signInWithPopup, firebaseSignOut };
