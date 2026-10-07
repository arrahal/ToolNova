# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants & Relationship Mapping

1. **Global Default-Deny**: Any path not explicitly matched is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity**: All write operations require an authenticated user with `request.auth != null && request.auth.token.email_verified == true`.
3. **PII Isolation (Split Collection Pattern)**:
   - `/users/{userId}` holds non-sensitive profile settings (`uid`, `fullName`, `companyOrRole`, `country`, `planId`, `joinedAt`, `createdAt`, `updatedAt`). Access is strictly restricted to the owner (`request.auth.uid == userId`).
   - `/users/{userId}/private/{docId}` (`docId == 'info'`) holds sensitive PII (`email`, `phone`). Access is strictly restricted to the owner (`request.auth.uid == userId`) AND requires the parent `/users/{userId}` document to exist (Master Gate).
4. **Relational Ownership & Existence**:
   - `/workflows/{workflowId}` and `/activityLogs/{logId}` must have `ownerId == request.auth.uid` and require `exists(/databases/$(database)/documents/users/$(request.auth.uid))` on creation to prevent orphaned writes.
5. **Strict Key & Type Enforcement**:
   - Every `create` and `update` must pass `isValid[Entity](incoming())` enforcing `hasAll` and `hasOnly` key allowlists, string `.size()` bounds, regex ID validation (`^[a-zA-Z0-9_\-]+$`), bounded list sizes (`steps.size() >= 2 && steps.size() <= 10`), and server timestamps (`request.time`).
6. **Secure List Queries**:
   - `allow list` on `/workflows/{workflowId}` and `/activityLogs/{logId}` enforces `resource.data.ownerId == request.auth.uid` without calling `get()` or `exists()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 (Identity Spoofing on UserProfile)**: Authenticated user `user_A` attempts to create `/users/user_A` with `uid: "user_B"`.
2. **Payload 2 (Unverified Email Write)**: Authenticated user with `email_verified: false` attempts to create `/users/user_A`.
3. **Payload 3 (Shadow Field Injection on UserProfile)**: User sends valid `/users/user_A` payload plus unauthorized `"isAdmin": true`.
4. **Payload 4 (Cross-User PII Leak)**: Authenticated user `user_B` attempts `get` on `/users/user_A/private/info`.
5. **Payload 5 (Orphaned Subcollection Write)**: User `user_A` attempts to create `/users/user_A/private/info` before `/users/user_A` exists.
6. **Payload 6 (Client Timestamp Forgery)**: User attempts to create `/workflows/wf_1` with a past client timestamp instead of `request.time`.
7. **Payload 7 (Unbounded Array Exhaustion)**: User attempts to create `/workflows/wf_1` with `steps` containing 25 items (exceeding max 10).
8. **Payload 8 (ID Poisoning Attack)**: User attempts to create `/workflows/bad$id!@#` with invalid characters in the path ID.
9. **Payload 9 (Update-Gap / Type Poisoning on Workflow)**: User updates allowed key `name` on `/workflows/wf_1` with a 5,000-character string or boolean.
10. **Payload 10 (Immutable Field Mutation)**: User attempts to update `ownerId` or `createdAt` on `/workflows/wf_1`.
11. **Payload 11 (Unauthorized List Scraping)**: User `user_B` executes an unconstrained `list` query on `/workflows` without filtering `ownerId == user_B`.
12. **Payload 12 (Immutable Audit Log Tampering)**: User `user_A` attempts to `update` an existing `/activityLogs/log_1` record.
