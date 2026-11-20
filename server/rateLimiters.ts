import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

// Standard rate limit response format
const createRateLimitHandler = (message: string) => {
  return (_req: Request, res: Response) => {
    res.status(429).json({
      ok: false,
      error: message,
      code: 'RATE_LIMIT_EXCEEDED',
    });
  };
};

/**
 * 1. Encrypt Limiter
 * 30 requests per 15 minutes per IP
 */
export const encryptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد المسموح به لعمليات التشفير (30 عملية كل 15 دقيقة). يرجى الانتظار قليلاً.'
  ),
});

/**
 * 2. Open Limiter
 * 60 attempts per 15 minutes per IP
 */
export const openLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد الأقصى لمحاولات فتح الملفات (60 محاولة كل 15 دقيقة). يرجى الانتظار.'
  ),
});

/**
 * 3. Inspect Limiter
 * 60 inspect requests per 15 minutes per IP
 */
export const inspectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد الأقصى لطلبات فحص الحاويات (60 طلباً كل 15 دقيقة).'
  ),
});

/**
 * 4. Dashboard Limiter
 * 120 queries per 15 minutes per IP
 */
export const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد المسموح به لطلبات لوحة التحكم. يرجى الانتظار قليلاً.'
  ),
});

/**
 * 5. Download Limiter
 * 60 downloads per 15 minutes per IP
 */
export const downloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد المسموح به لطلبات التنزيل (60 تنزيلاً كل 15 دقيقة).'
  ),
});

/**
 * 6. Billing Limiter
 * 60 requests per 15 minutes per IP
 */
export const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد المسموح به لطلبات خدمة الفوترة.'
  ),
});

/**
 * 7. Workflow Limiter
 * 60 requests per 15 minutes per IP
 */
export const workflowLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: createRateLimitHandler(
    'تم تجاوز الحد المسموح به لطلبات مسارات العمل (60 طلباً كل 15 دقيقة). يرجى الانتظار قليلاً.'
  ),
});
