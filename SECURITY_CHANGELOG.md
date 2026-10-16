# ToolNova Security Changelog

## [Task 1] Authentication & Authorization Hardening

### Summary
Hardened all `/api/protector/*` endpoints by modularizing the server, introducing Firebase ID token authentication, enforcing verified email checks for write operations, isolating the dashboard to the authenticated user, enforcing strict ownership verification (404 on unowned files to prevent existence probing), and establishing a strict Public DTO (`toPublicFileDto`) to prevent cryptographic secret leakage.

---

### Security Fixes

#### 1. Unauthenticated & Unverified Protector Routes
- **Original issue:** Every `/api/protector/*` route (`/dashboard`, `/revoke`, `/recreate`, `/:fileId`, `/download`, `/download-secure`, `/encrypt`) lacked authentication. Anyone could access, download, revoke, or delete files. Additionally, `ownerId` was client-supplied in request bodies and never validated.
- **Fix:**
  - Added `requireAuth` middleware verifying the Firebase ID token in `Authorization: Bearer <token>` against Google's public JWKS (`https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com`).
  - Required `email_verified === true` for state-mutating operations (`/encrypt`, `/revoke`, `/recreate`, `DELETE /:fileId`).
  - Overrode `ownerId` in `/encrypt` to strictly equal `req.user.uid`, ignoring any `ownerId` sent in the request body.
  - Implemented closest secure alternative note: Since private Firebase Admin service account keys are unavailable in this server environment, token verification is performed securely using Google's public JWKS via the `jose` library, validating signature, `issuer` (`https://securetoken.google.com/<projectId>`), `audience` (`<projectId>`), and token expiration.
- **Files:**
  - `server/auth.ts`: Middleware for JWT verification, `requireAuth`, `requireVerifiedEmail`, and `optionalAuth`.
  - `server/protectorRoutes.ts`: Route definitions with authentication and verification middleware.
- **How to verify:**
  - `npx vitest run tests/auth_protector.test.ts`
  - Run unauthenticated `curl -i -X POST http://localhost:3000/api/protector/encrypt` → returns HTTP `401 Unauthorized`.
  - Run `curl -i -X GET http://localhost:3000/api/protector/dashboard` without token → returns HTTP `401 Unauthorized`.

#### 2. Recreate Exploitation & Secret Key Leaks
- **Original issue:** The `/recreate` route reset `usedOpens` to 0 without verifying ownership and returned the entire database record, including `passwordHash`, `cryptoMeta`, `wrappedDekHex`, and raw ciphertexts.
- **Fix:**
  - Required authentication and verified ownership (`record.ownerId === req.user.uid`).
  - Returns HTTP `404 Not Found` if the file doesn't exist or is owned by another user (preventing existence enumeration).
  - Introduced `toPublicFileDto(record)` that strips `passwordHash`, `cryptoMeta`, `wrappedDekHex`, `ciphertextBase64`, `webCiphertextBase64`, and `webViewerCiphertextBase64`.
  - Used `toPublicFileDto(record)` across all JSON responses (`inspect`, `open`, `dashboard`, `recreate`, `revoke`, `encrypt`).
- **Files:**
  - `server/storage.ts`: `toPublicFileDto` implementation and `PublicProtectedFileDto` interface.
  - `server/protectorRoutes.ts`: Responses updated to return only `toPublicFileDto`.
- **How to verify:**
  - `npx vitest run tests/auth_protector.test.ts` (verifies `toPublicFileDto` strips secrets and `/recreate` returns public DTO only).

#### 3. Dashboard Isolation & Cross-User Access Control
- **Original issue:** `/dashboard` returned all files across the platform. Non-owners could call `/revoke`, `/recreate`, `/download-secure`, `/download`, and `DELETE` on any file ID.
- **Fix:**
  - `/dashboard` now filters strictly by `r.ownerId === req.user.uid`.
  - `/revoke`, `/recreate`, `DELETE /:fileId`, `/download/:fileId`, and `/download-secure/:fileId` verify ownership against `req.user.uid`. Non-owned files return HTTP `404 Not Found`.
- **Files:**
  - `server/protectorRoutes.ts`
- **How to verify:**
  - `npx vitest run tests/auth_protector.test.ts` (tests user A vs user B isolation and cross-user 404 responses).

#### 4. Architecture Modularization
- **Original issue:** Monolithic 2,386-line `server.ts` file mixing configuration, crypto, HTML templates, storage, and routes.
- **Fix:**
  - Modularized into `server/config.ts`, `server/auth.ts`, `server/crypto.ts`, `server/storage.ts`, `server/launcherTemplate.ts`, `server/protectorRoutes.ts`, `server/vaultRoutes.ts`, and a thin wiring `server.ts`.
- **Files:**
  - `server/config.ts`, `server/auth.ts`, `server/crypto.ts`, `server/storage.ts`, `server/launcherTemplate.ts`, `server/protectorRoutes.ts`, `server/vaultRoutes.ts`, `server.ts`.
- **How to verify:**
  - `npm run lint` && `npm run test` && `npm run build`.

#### 5. Frontend Client Authentication Integration
- **Original issue:** Client modal never attached Firebase ID tokens and allowed unauthenticated operations to attempt hitting protected endpoints.
- **Fix:**
  - Integrated `auth` and `onAuthStateChanged` into `FileProtectorModal.tsx`.
  - Added helper `getAuthHeader()` to dynamically retrieve `await auth.currentUser.getIdToken()` and pass it as `Authorization: Bearer <token>` on all `/api/protector/*` requests.
  - Added Arabic and English authentication prompts in the Dashboard and Step 1 of Encryption wizard with 1-click Google Sign-in.
- **Files:**
  - `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - Open File Protector modal when logged out: Step 1 and Dashboard display sign-in prompts.
  - After logging in, dashboard loads only the authenticated user's files with Bearer tokens.
