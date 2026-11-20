# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Relationship Mapping

1. **Global Default-Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity**: All client write operations require an authenticated user with `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (Split Collection Pattern)**:
   - `/users/{userId}` holds non-sensitive profile settings (`uid`, `fullName`, `companyOrRole`, `country`, `planId`, `joinedAt`, `createdAt`, `updatedAt`). Access is strictly restricted to the owner (`request.auth.uid == userId`), with `planId == 'free'` enforced on client creation and immutable on client update.
   - `/users/{userId}/private/{docId}` (`docId == 'info'`) holds sensitive PII (`email`, `phone`). Access is strictly restricted to the owner (`request.auth.uid == userId`) AND requires the parent `/users/{userId}` document to exist (Master Gate).
4. **Server-Managed Collections (`/workflows`, `/entitlements`, & `/processedWebhooks`)**:
   - `/workflows/{workflowId}`: Client writes are strictly forbidden (`allow create, update, delete: if false;`) so `maxWorkflows` plan entitlements cannot be bypassed from the browser. All workflow creation, updates, and deletions pass exclusively through `/api/workflows`, which enforces verified authentication, `maxWorkflows` quota checks, `name` (`1–120` chars), `description` (`0–500` chars), `steps` (`1–10` items where **every** element is validated as `1–64` chars matching `^[a-zA-Z0-9_\-]+$`), and `estimatedSavedSec` (`0–86400`). Client read access (`get`, `list`) remains strictly restricted to the document owner (`ownerId == request.auth.uid`), with `isValidId(workflowId)` enforced on `get`.
   - `/entitlements/{userId}`: Readable only by the owner (`request.auth.uid == userId`); all client writes are forbidden (`allow write: if false;`).
   - `/processedWebhooks/{webhookId}`: Idempotency ledger managed exclusively by the server via Firebase Admin; all client reads and writes are forbidden (`allow read, write: if false;`).
5. **Relational Ownership & Existence on Client Audit Logs**:
   - `/activityLogs/{logId}` requires `ownerId == request.auth.uid` and `exists(/databases/$(database)/documents/users/$(request.auth.uid))` (or `existsAfter(...)`) on creation to prevent orphaned writes, and forbids updates (`allow update: if false;`).
6. **Strict Key & Type Enforcement**:
   - Every allowed client `create` and `update` must pass `isValid[Entity](incoming())` enforcing `hasAll` and `hasOnly` key allowlists, string `.size()` bounds, regex ID validation (`^[a-zA-Z0-9_\-]+$`), and server timestamps (`request.time`).
7. **Secure List Queries**:
   - `allow list` on `/workflows/{workflowId}` and `/activityLogs/{logId}` enforces `resource.data.ownerId == request.auth.uid` without calling `get()` or `exists()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on UserProfile)**: Authenticated user `user_A` attempts to create `/users/user_A` with `uid: "user_B"`.
2. **Payload 2 (Unverified Email Write)**: Authenticated user with `email_verified: false` attempts to create `/users/user_A`.
3. **Payload 3 (Shadow Field Injection on UserProfile)**: User sends valid `/users/user_A` payload plus unauthorized `"isAdmin": true`.
4. **Payload 4 (Cross-User PII Leak)**: Authenticated user `user_B` attempts `get` on `/users/user_A/private/info`.
5. **Payload 5 (Orphaned Subcollection Write)**: User `user_A` attempts to create `/users/user_A/private/info` before `/users/user_A` exists.
6. **Payload 6 (Direct Client Workflow Create Bypass)**: Verified owner `user_A` attempts to create `/workflows/wf_1` directly from the client SDK (bypassing `/api/workflows` and `maxWorkflows`).
7. **Payload 7 (Unbounded Array / Malicious Client Workflow Write)**: Verified owner `user_A` attempts to create `/workflows/wf_1` with 25 `steps` directly from the client SDK.
8. **Payload 8 (ID Poisoning Attack on Workflow Read/Write)**: User `user_A` attempts `get` or `set` on `/workflows/bad$id!@#` with invalid characters in the path ID.
9. **Payload 9 (Direct Client Workflow Update Bypass)**: Verified owner `user_A` attempts to `update` an existing `/workflows/wf_1` directly from the client SDK.
10. **Payload 10 (Direct Client Workflow Delete & Cross-User Read)**: Verified owner `user_A` attempts to `delete` `/workflows/wf_1` directly from the client SDK, or `user_B` attempts `get` on `user_A`'s `/workflows/wf_1`.
11. **Payload 11 (Unauthorized List Scraping on Workflows)**: User `user_B` executes an unconstrained `list` query on `/workflows` (or queries `ownerId == 'user_A'`).
12. **Payload 12 (Immutable Audit Log Tampering)**: User `user_A` attempts to `update` an existing `/activityLogs/log_1` record.
