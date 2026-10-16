import { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { FIREBASE_PROJECT_ID, NODE_ENV } from './config';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  email_verified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

// Google public JWKS for Firebase ID tokens
const GOOGLE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);
const googleJWKS = createRemoteJWKSet(GOOGLE_JWKS_URL);

// Pluggable verifier for testing
type TokenVerifier = (token: string) => Promise<AuthenticatedUser>;

let customTokenVerifier: TokenVerifier | null = null;

export function setCustomTokenVerifierForTesting(verifier: TokenVerifier | null): void {
  customTokenVerifier = verifier;
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedUser> {
  // If custom verifier is set (e.g., during tests), use it
  if (customTokenVerifier) {
    return await customTokenVerifier(token);
  }

  // Handle mock tokens in test environment for reliable offline test suites
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  if (isTest && token.startsWith('mock-token:')) {
    try {
      const parts = token.split(':');
      const payloadBase64 = parts[1];
      const parsed = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf-8'));
      if (!parsed.uid) throw new Error('Missing uid in test token');
      return {
        uid: parsed.uid,
        email: parsed.email || `${parsed.uid}@example.com`,
        email_verified: parsed.email_verified !== false,
      };
    } catch {
      throw new Error('Invalid test token payload');
    }
  }

  // Production verification against Google JWKS
  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  const { payload } = await jwtVerify(token, googleJWKS, {
    issuer: expectedIssuer,
    audience: FIREBASE_PROJECT_ID,
  });

  const uid = (payload.user_id || payload.sub) as string;
  if (!uid) {
    throw new Error('Firebase ID token is missing user id claim (sub/user_id)');
  }

  return {
    uid,
    email: payload.email as string | undefined,
    email_verified: Boolean(payload.email_verified),
  };
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Middleware: Strict Authentication Required (401 on missing or invalid token)
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({
      ok: false,
      error: 'غير مصرح: يرجى تسجيل الدخول أولاً.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  try {
    const user = await verifyFirebaseIdToken(token);
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: 'رمز المصادقة غير صالح أو انتهت صلاحيته. يرجى تسجيل الدخول مجدداً.',
      code: 'INVALID_TOKEN',
    });
  }
}

// Middleware: Verified Email Required for Write Operations (403 if email is not verified)
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      ok: false,
      error: 'غير مصرح: يرجى تسجيل الدخول أولاً.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  if (req.user.email_verified !== true) {
    res.status(403).json({
      ok: false,
      error: 'يرجى تأكيد بريدك الإلكتروني للمتابعة وإجراء هذه العملية.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }

  next();
}

// Middleware: Optional Authentication (attaches req.user if valid token present, otherwise proceeds)
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const user = await verifyFirebaseIdToken(token);
    req.user = user;
  } catch {
    // Optional token was invalid or expired; proceed unauthenticated
  }
  next();
}
