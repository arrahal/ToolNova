export interface FileLockState {
  failedAttempts: number;
  lockedUntil: number;
  lastAttemptAt: number;
}

// In-memory store mapping fileId to lock state
const fileLocks = new Map<string, FileLockState>();

const MAX_FAILURES_BEFORE_HARD_LOCK = 10;
const HARD_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Checks whether a given fileId is currently locked due to repeated failed password attempts.
 * Operates independent of client IP so header/IP rotation attacks cannot bypass the lock.
 */
export function checkFileLock(fileId: string): {
  locked: boolean;
  retryAfterSeconds: number;
  reason?: string;
} {
  const entry = fileLocks.get(fileId);
  if (!entry) {
    return { locked: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (entry.lockedUntil > now) {
    const remainingMs = entry.lockedUntil - now;
    const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
    const isHardLock = entry.failedAttempts >= MAX_FAILURES_BEFORE_HARD_LOCK;

    return {
      locked: true,
      retryAfterSeconds,
      reason: isHardLock
        ? `تم قفل هذا الملف مؤقتاً بسبب تكرار إدخال كلمة المرور الخاطئة (${entry.failedAttempts} محاولات). يرجى المحاولة بعد ${retryAfterSeconds} ثانية.`
        : `يرجى الانتظار ${retryAfterSeconds} ثانية قبل المحاولة مجدداً (تطبيق تأخير أمني تصاعدي).`,
    };
  }

  return { locked: false, retryAfterSeconds: 0 };
}

/**
 * Records a failed password attempt for a fileId.
 * Applies exponential backoff starting at 3 failed attempts,
 * and a full 15-minute lockout at 10 failed attempts.
 */
export function recordFailedAttempt(fileId: string): {
  locked: boolean;
  retryAfterSeconds: number;
  attempts: number;
} {
  const now = Date.now();
  let entry = fileLocks.get(fileId);

  if (!entry) {
    entry = {
      failedAttempts: 1,
      lockedUntil: 0,
      lastAttemptAt: now,
    };
    fileLocks.set(fileId, entry);
    return { locked: false, retryAfterSeconds: 0, attempts: 1 };
  }

  // If previous lock has fully expired and last attempt was over 15 minutes ago, reset
  if (now > entry.lockedUntil && now - entry.lastAttemptAt > HARD_LOCK_DURATION_MS) {
    entry.failedAttempts = 1;
    entry.lockedUntil = 0;
    entry.lastAttemptAt = now;
    return { locked: false, retryAfterSeconds: 0, attempts: 1 };
  }

  entry.failedAttempts += 1;
  entry.lastAttemptAt = now;

  if (entry.failedAttempts >= MAX_FAILURES_BEFORE_HARD_LOCK) {
    // 10+ failures: Full 15-minute lock
    entry.lockedUntil = now + HARD_LOCK_DURATION_MS;
    const retryAfterSeconds = Math.ceil(HARD_LOCK_DURATION_MS / 1000);
    return { locked: true, retryAfterSeconds, attempts: entry.failedAttempts };
  }

  if (entry.failedAttempts >= 3) {
    // Exponential backoff: 2^(attempts - 3) seconds (e.g. 1s, 2s, 4s, 8s, 16s...)
    const backoffSeconds = Math.pow(2, entry.failedAttempts - 3);
    entry.lockedUntil = now + backoffSeconds * 1000;
    return { locked: true, retryAfterSeconds: backoffSeconds, attempts: entry.failedAttempts };
  }

  return { locked: false, retryAfterSeconds: 0, attempts: entry.failedAttempts };
}

/**
 * Resets the failure counter upon a successful password verification.
 */
export function recordSuccessAttempt(fileId: string): void {
  fileLocks.delete(fileId);
}

/**
 * Helper to explicitly clear locks (e.g., in unit tests).
 */
export function clearAllFileLocks(): void {
  fileLocks.clear();
}

// Periodic cleanup of stale in-memory records to prevent memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [fileId, entry] of fileLocks.entries()) {
    if (now > entry.lockedUntil && now - entry.lastAttemptAt > HARD_LOCK_DURATION_MS) {
      fileLocks.delete(fileId);
    }
  }
}, CLEANUP_INTERVAL_MS);

// unref ensures this timer does not prevent process termination or block test suites
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}
