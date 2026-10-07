/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads defined in security_spec.md return PERMISSION_DENIED.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Identity Spoofing on UserProfile',
    collectionPath: '/users/user_A',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      uid: 'user_B',
      fullName: 'Spoofed User',
      companyOrRole: 'Engineer',
      country: 'Morocco',
      planId: 'pro',
      joinedAt: '2026-10-07',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Write',
    collectionPath: '/users/user_A',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: false },
    payload: {
      uid: 'user_A',
      fullName: 'Unverified User',
      companyOrRole: 'Engineer',
      country: 'Morocco',
      planId: 'pro',
      joinedAt: '2026-10-07',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on UserProfile',
    collectionPath: '/users/user_A',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      uid: 'user_A',
      fullName: 'Valid Name',
      companyOrRole: 'Engineer',
      country: 'Morocco',
      planId: 'pro',
      joinedAt: '2026-10-07',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User PII Leak',
    collectionPath: '/users/user_A/private/info',
    operation: 'get',
    auth: { uid: 'user_B', email: 'b@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned Subcollection Write',
    collectionPath: '/users/user_no_parent/private/info',
    operation: 'create',
    auth: { uid: 'user_no_parent', email: 'np@example.com', email_verified: true },
    payload: {
      uid: 'user_no_parent',
      email: 'np@example.com',
      phone: '+212600000000',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery',
    collectionPath: '/workflows/wf_1',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'wf_1',
      ownerId: 'user_A',
      name: 'My Pipeline',
      description: 'Pipeline description',
      steps: ['pdf-merge', 'pdf-protect'],
      estimatedSavedSec: 45,
      runsCount: 0,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unbounded Array Exhaustion',
    collectionPath: '/workflows/wf_1',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'wf_1',
      ownerId: 'user_A',
      name: 'My Pipeline',
      description: 'Pipeline description',
      steps: Array(25).fill('pdf-merge'),
      estimatedSavedSec: 45,
      runsCount: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning Attack',
    collectionPath: '/workflows/bad$id!@#',
    operation: 'create',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      id: 'bad$id!@#',
      ownerId: 'user_A',
      name: 'My Pipeline',
      description: 'Pipeline description',
      steps: ['pdf-merge', 'pdf-protect'],
      estimatedSavedSec: 45,
      runsCount: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Update-Gap / Type Poisoning on Workflow',
    collectionPath: '/workflows/wf_1',
    operation: 'update',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      name: 'X'.repeat(5000),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Mutation',
    collectionPath: '/workflows/wf_1',
    operation: 'update',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      ownerId: 'user_B',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unauthorized List Scraping',
    collectionPath: '/workflows',
    operation: 'list',
    auth: { uid: 'user_B', email: 'b@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Immutable Audit Log Tampering',
    collectionPath: '/activityLogs/log_1',
    operation: 'update',
    auth: { uid: 'user_A', email: 'a@example.com', email_verified: true },
    payload: {
      detail: 'Modified audit history',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
