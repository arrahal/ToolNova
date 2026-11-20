# ToolNova

ToolNova is a privacy-focused web platform for client-side document, image, audio, video, and text utilities, paired with an Express API for server-backed file protection, user workflows, and subscription entitlements.

## Deployment

### Prerequisites

- Node.js 20+ and npm
- A Firebase project with Authentication and Cloud Firestore enabled (`firebase-applet-config.json` or explicit environment variables)
- Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` or GCP runtime service account) for `firebase-admin` in production
- A Lemon Squeezy store and webhook configuration for paid plan entitlements

### Required Environment Variables (Production)

| Variable | Description |
| --- | --- |
| `NODE_ENV` | Must be set to `production`. |
| `SERVER_MASTER_KEY` | 256-bit key (64 hex chars, e.g. `openssl rand -hex 32`) for protector envelope encryption. |
| `AUDIT_IP_SALT` | Secret salt for privacy-preserving SHA-256 IP audit hashing. |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins (for example `https://app.example.com`). |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | Signing secret for Lemon Squeezy webhook HMAC-SHA256 verification. |
| `LEMONSQUEEZY_PRO_VARIANT_IDS` | Comma-separated Lemon Squeezy variant IDs mapped to the `pro` plan. |
| `LEMONSQUEEZY_ENTERPRISE_VARIANT_IDS` | Comma-separated Lemon Squeezy variant IDs mapped to the `enterprise` plan. |
| `FIREBASE_PROJECT_ID` | Firebase project ID (or provide `VITE_FIREBASE_PROJECT_ID` / `firebase-applet-config.json`). |
| `FIRESTORE_DATABASE_ID` | Named Firestore database ID (or provide `VITE_FIREBASE_DATABASE_ID` / `firebase-applet-config.json`). |

### Optional & Client Environment Variables

- `PORT` (default `3000`), `PUBLIC_BASE_URL`, `TRUST_PROXY` (`false` by default; set when behind a reverse proxy), `STORAGE_DIR` (default `.secure_storage`), `SERVER_MASTER_KEY_ID` (default `k1`), `CSP_HEADER_VALUE`, `DISABLE_HMR`.
- Client overrides when not using `firebase-applet-config.json`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_RECAPTCHA_SITE_KEY`.
- Billing & UI client settings: `VITE_LEMONSQUEEZY_STORE_URL`, `VITE_LEMONSQUEEZY_CHECKOUT_URL`, `VITE_MAX_VIDEO_FILE_MB`.

See `.env.example` for the full reference list.

### Build and Start Commands

```bash
# Install dependencies
npm install

# Type-check and lint Firestore security rules
npm run lint

# Run the test suite
npm test

# Build the client bundle (dist/) and production server bundle (dist-server/server.js)
npm run build

# Start the production server (runs with NODE_ENV=production)
npm start
```
