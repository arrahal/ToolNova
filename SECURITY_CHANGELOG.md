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

---

## [Task 2] Cryptography & Enforceable Limits Hardening

### Summary
Addressed critical cryptographic vulnerabilities: eliminated AES-GCM nonce reuse by using distinct 12-byte random IVs and HKDF-derived subkeys, upgraded server Argon2id password hashing to 64 MiB (m=65536, t=3, p=1) on a background worker thread with transparent re-hashing, instituted strict password policy (10-256 chars, rejecting common passwords, Arabic strength meter in UI), eliminated hard-coded SERVER_MASTER_KEY fallback and enforced 64 hex characters via environment with key rotation IDs, implemented constant-time container HMAC verification covering critical metadata, redesigned the launcher to be a thin client where all restricted files verify and decrypt strictly on the server (making limits and revocation enforceable and removing localStorage bypasses), decoupled origin from request headers to use PUBLIC_BASE_URL, and implemented crypto-shredding on file deletion while removing all ungrounded zero-overwrite claims.

### Security Fixes

#### 1. Nonce Reuse Prevention
- **Original issue:** In `/encrypt`, `webFileCipher` and `webViewerCipher` encrypted different plaintexts using the exact same AES-256-GCM key and identical IV, causing catastrophic Galois/Counter Mode authentication key and plaintext leakage.
- **Fix:**
  - For server storage, DEK wrapping and file ciphertext generation use independent 12-byte random IVs (`fileIv` and `dekIv`).
  - For offline mode (unrestricted files), derived two separate subkeys via HKDF (`toolnova-offline-file` and `toolnova-offline-viewer`) and generated separate 12-byte random IVs (`webFileIvHex` and `webViewerIvHex`).
  - No key/IV pair is ever reused across any ciphertexts.
- **Files:**
  - `server/crypto.ts`, `server/protectorRoutes.ts`, `server/launcherTemplate.ts`
- **How to verify:**
  - `npx vitest run tests/crypto_limits.test.ts` (verifies all IVs are distinct and 12 random bytes).

#### 2. Server Argon2id on Worker Thread & Transparent Re-hashing
- **Original issue:** Argon2id ran with weak parameters (m=16384 KiB, t=2) synchronously on Node's main thread, blocking the event loop and vulnerable to GPU attacks.
- **Fix:**
  - Upgraded Argon2id to memory-hard parameters: `m >= 65536 KiB` (64 MiB), `t >= 3`, `p = 1`.
  - Created worker thread script (`server/argonWorker.js`) and manager in `server/crypto.ts` so Argon2 runs completely asynchronously off the event loop without stalling concurrent requests.
  - Implemented `transparentlyRehashRecord` on successful open: if a record was created with older parameters or previous master keys, it automatically re-hashes with current parameters and re-wraps the DEK.
- **Files:**
  - `server/argonWorker.js`, `server/crypto.ts`, `server/config.ts`, `server/protectorRoutes.ts`
- **How to verify:**
  - `npx vitest run tests/crypto_limits.test.ts`.

#### 3. Strict Password Policy & Arabic Strength Meter
- **Original issue:** Passwords were permitted as short as 4 characters with no complexity checks or weak password rejection.
- **Fix:**
  - Enforced server AND client policy: min 10 characters, max 256 characters.
  - Built-in blacklist of common passwords (`COMMON_WEAK_PASSWORDS`) rejected on both server and client.
  - Added Arabic password strength meter with visual 4-level progress bar and real-time guidance in the UI (`FileProtectorModal.tsx`).
- **Files:**
  - `server/crypto.ts`, `server/protectorRoutes.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - Test password with < 10 characters or 'password123' -> rejected with Arabic warning.

#### 4. Server Master Key & Key Rotation ID
- **Original issue:** `SERVER_MASTER_KEY` silently created a fallback file next to ciphertexts and lacked production enforcement or key rotation metadata.
- **Fix:**
  - Enforces loading `SERVER_MASTER_KEY` (64 hex characters / 256 bits) from environment.
  - Fails to start in production with a fatal error if missing or invalid.
  - In development only, generates a temporary key into a git-ignored `.server_master_key.dev` file.
  - Added `keyId` (e.g. `k1`, configurable via `SERVER_MASTER_KEY_ID`) to every record to enable seamless key rotation.
  - Documented variables in `.env.example`.
- **Files:**
  - `server/config.ts`, `server/storage.ts`, `.env.example`, `.gitignore`
- **How to verify:**
  - Run with invalid hex `SERVER_MASTER_KEY=invalid` -> throws clear error.

#### 5. Constant-Time Container HMAC Verification
- **Original issue:** `containerHmacHex` was computed during encryption but never verified on open or inspect, allowing metadata modification.
- **Fix:**
  - Updated HMAC calculation to include `fileId`, `originalName`, `extension`, `maxOpens`, `expiresAt`, `fileIvHex`, and `fileAuthTagHex` signed by `SERVER_MASTER_KEY`.
  - Added constant-time verification (`crypto.timingSafeEqual`) in `verifyContainerHmac`.
  - Verified on both `/api/protector/inspect` and `/api/protector/open`. Tampered containers return HTTP 400.
- **Files:**
  - `server/crypto.ts`, `server/protectorRoutes.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - `npx vitest run tests/crypto_limits.test.ts` (tampered container test).

#### 6. Enforceable Limits Design & Thin-Client Launcher
- **Original issue:** `.protected.html` embedded the full ciphertext and decrypted offline in the browser, relying on `localStorage` counters for open limits and expiration, which could be easily bypassed by disabling JavaScript or clearing storage.
- **Fix:**
  - For all restricted files (with `maxOpens`, `expiresAt`, or revocation capability), the generated `.protected.html` is a thin client containing NO decryptable ciphertext or offline key paths.
  - It transmits the password over HTTPS to `/api/protector/open`, where limits are atomically checked and decremented on the server, and the decrypted viewer payload is rendered directly in memory.
  - Provided an explicit opt-in "Offline mode (limits NOT enforced)" ONLY for unrestricted files (`maxOpens === null` and `expiresAt === null`), with clear Arabic warnings in the UI and launcher banner. For offline mode, uses PBKDF2-SHA256 with 600,000 iterations and HKDF subkeys.
  - Removed duplicate base64 ciphertext copies from server records for restricted files.
  - Trade-off documentation: PBKDF2 in the browser is vulnerable to specialized ASIC/GPU cracking compared to memory-hard Argon2; it is strictly restricted to unrestricted files where the creator explicitly opted into offline usage.
- **Files:**
  - `server/launcherTemplate.ts`, `server/protectorRoutes.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - Inspect HTML source of a restricted file -> contains 0 ciphertext bytes.
  - `npx vitest run tests/crypto_limits.test.ts` (concurrent open requests enforce limits).

#### 7. Origin Decoupled from Request Headers
- **Original issue:** `serverOrigin` was constructed from attacker-controlled `Host` and `X-Forwarded-Proto` headers, and `clientOrigin` came from the request body.
- **Fix:**
  - `serverOrigin` is loaded strictly from environment variable `PUBLIC_BASE_URL`.
  - Removed `clientOrigin` completely from requests, containers, and templates.
- **Files:**
  - `server/config.ts`, `server/protectorRoutes.ts`, `server/launcherTemplate.ts`, `src/components/FileProtectorModal.tsx`, `.env.example`
- **How to verify:**
  - Inspect container JSON in download -> `serverOrigin` equals `PUBLIC_BASE_URL`.

#### 8. Crypto-Shredding on Delete
- **Original issue:** Deletion claimed "zero-overwrite" in comments/UI but was susceptible to SSD wear leveling and flash memory persistence.
- **Fix:**
  - Implemented cryptographic erasure (crypto-shredding): unlinks the file from disk and deletes the wrapped DEK, IVs, and authentication tags from the database record, rendering ciphertexts permanently unrecoverable.
  - Removed all ungrounded "zero-overwrite" claims from comments and UI copy.
- **Files:**
  - `server/protectorRoutes.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - `npx vitest run tests/crypto_limits.test.ts` (crypto-shredding test).

---

## [Task 3] XSS & Injection Prevention

### Summary
Hardened the entire application against Cross-Site Scripting (XSS) and code injection attacks: integrated DOMPurify with a strict allowlist (forbidding script, style, iframe, object, embed, form, on* handlers; stripping javascript: URLs; allowing data: URLs only for images), wrapped the Word document viewer in sandboxed iframes (`sandbox=""`), audited and eradicated unsafe `innerHTML` and `document.write` calls in favor of safe `textContent` / `createElement`, modernized container embedding in `.protected.html` launchers from HTML comments to safely-escaped `<script type="application/json" id="toolnova-container">` tags (escaping `<`, `>`, `&`, U+2028, U+2029 as `\uXXXX`), introduced strict Content-Security-Policy (CSP) meta tags with dynamic cryptographic nonces in launchers, added Helmet middleware to the Express server with strict production CSP while preserving Vite dev mode, and implemented an end-to-end Vitest + JSDOM test suite verifying that docx-like HTML payloads and malicious ZIP entry names produce zero executable output.

### Security Fixes

#### 1. DOMPurify with Strict Allowlist & Sandboxed Word Viewer
- **Original issue:** Mammoth HTML from uploaded Word documents was injected directly into the DOM via `dangerouslySetInnerHTML` and `innerHTML` without sanitization. Embedded `<script>` tags, `onerror` image handlers, and `javascript:` URLs in documents could execute arbitrary JavaScript in the victim's session.
- **Fix:**
  - Configured `DOMPurify` with a strict allowlist:
    - Allowed elements: standard semantic document formatting tags (`p`, `h1`-`h6`, `table`, `tr`, `td`, `th`, `strong`, `em`, `ul`, `ol`, `li`, `span`, `div`, `img`, `a`).
    - Explicitly forbidden elements: `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, `button`, `select`, `textarea`, `link`, `meta`, `base`, `applet`, `svg`, `math`.
    - Explicitly forbidden attributes: all `on*` inline event handlers (`onerror`, `onload`, `onclick`, etc.) and `style` attributes.
    - Protocol enforcement via `uponSanitizeAttribute` hook: blocks `javascript:` and `vbscript:` URLs; restricts `data:` URLs strictly to image MIME types (`data:image/*`).
  - Added `src/utils/sanitizeHtml.ts` for browser/client components and `server/sanitizeHtml.ts` with JSDOM for server-side processing in `buildSecureViewerPayload`.
  - In `FileProtectorModal.tsx` and `server/launcherTemplate.ts`, rendered the Word viewer inside `<iframe sandbox="" srcdoc=...>` so the browser kernel enforces total script, form, and popup blocking even in the defense-in-depth layer.
- **Files:**
  - `src/utils/sanitizeHtml.ts`, `server/sanitizeHtml.ts`, `server/crypto.ts`, `server/launcherTemplate.ts`, `src/components/FileProtectorModal.tsx`, `src/components/ToolWorkspaceModal.tsx`
- **How to verify:**
  - `npx vitest run tests/xss_injection.test.ts` (verifies scripts, on* attributes, and javascript: links are stripped).

#### 2. Codebase Audit: Elimination of Unsafe innerHTML
- **Original issue:** Multiple locations in `server/launcherTemplate.ts` and `FileProtectorModal.tsx` used `innerHTML` string concatenation (e.g. ZIP archive entry names, button state labels, empty sheet messages), exposing users to DOM-based XSS when opening archives with malicious file names.
- **Fix:**
  - Replaced all ZIP entry name rendering with safe DOM text node assignments (`textContent`) and `createElement`.
  - Replaced button and status messages with `textContent`.
  - Audited all uses of `dangerouslySetInnerHTML` across `src/`: the only remaining occurrence is in `ToolWorkspaceModal.tsx` for PDF preview HTML, which is now explicitly sanitized via `sanitizeHtml(pdfResult.previewHtml)`.
- **Files:**
  - `server/launcherTemplate.ts`, `src/components/FileProtectorModal.tsx`, `src/components/ToolWorkspaceModal.tsx`
- **How to verify:**
  - `grep -rn "innerHTML" src/ server/` returns no unsafe innerHTML assignments.
  - `npx vitest run tests/xss_injection.test.ts` (verifies ZIP entry `"><img src=x onerror=alert(1)>` renders as literal text with zero img elements created).

#### 3. Launcher Template Container Escaping & Migration to JSON Script Tag
- **Original issue:** Launcher templates embedded JSON payloads inside `<!--TOOLNOVA_SECURE_CONTAINER_START...-->` and inline `<script>const CONTAINER = ...</script>` without escaping `</script>` or `-->`, allowing attackers to craft file names that broke out of HTML comments or script contexts.
- **Fix:**
  - Removed comment embedding (`<!--TOOLNOVA_SECURE_CONTAINER_START...-->`).
  - Stored container metadata inside `<script type="application/json" id="toolnova-container">` with comprehensive escaping: `<`, `>`, `&`, `\u2028`, `\u2029` are encoded as `\uXXXX`.
  - Client script reads the container using `document.getElementById('toolnova-container').textContent` and parses via `JSON.parse`.
  - Updated container upload/inspection logic in `FileProtectorModal.tsx` to search for `<script type="application/json" id="toolnova-container">` first, while maintaining backward compatibility with legacy comment-based `.protected.html` files and raw `.secure` JSON containers.
- **Files:**
  - `server/launcherTemplate.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - `npx vitest run tests/xss_injection.test.ts` (verifies breakout strings like `</script><script>alert(1)</script>` are escaped as `\u003c/script\u003e` and parse safely back to the original object).

#### 4. Restrictive Content-Security-Policy (CSP) in Launcher HTML
- **Original issue:** Generated `.protected.html` files lacked Content-Security-Policy headers or meta tags, permitting unrestricted network requests and inline script injections.
- **Fix:**
  - Added a restrictive CSP `<meta>` tag inside every generated launcher HTML:
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; frame-src blob: data:; connect-src ${PUBLIC_BASE_URL};`
  - Generated a cryptographically random 16-byte nonce for each launcher file and attached `nonce="${nonce}"` to the authorized launcher script.
  - Restricts network connections strictly to `PUBLIC_BASE_URL` for password verification and decryption.
- **Files:**
  - `server/launcherTemplate.ts`, `src/components/FileProtectorModal.tsx`
- **How to verify:**
  - `npx vitest run tests/xss_injection.test.ts` (verifies presence of CSP meta tag, nonce match, and source restrictions).

#### 5. Helmet Integration & Application CSP
- **Original issue:** Express server lacked Helmet security middleware, omitting standard security headers (X-Frame-Options, X-Content-Type-Options, CSP, etc.).
- **Fix:**
  - Integrated `helmet` in `server.ts`.
  - In production (`NODE_ENV === 'production'`), enforces strict CSP:
    - `default-src 'self'`
    - `object-src 'none'`
    - `base-uri 'none'`
    - `frame-ancestors 'self'`
    - `script-src 'self'`
    - `style-src 'self' 'unsafe-inline'`
    - `img-src 'self' data: blob: https:`
    - `connect-src 'self' https://*.googleapis.com https://*.firebaseio.com`
  - In development mode, relaxes CSP (`contentSecurityPolicy: false`) so that Vite's development server, HMR, and inline client tooling function without hindrance.
- **Files:**
  - `server.ts`
- **How to verify:**
  - `npx vitest run tests/xss_injection.test.ts` (verifies production Helmet CSP headers).


