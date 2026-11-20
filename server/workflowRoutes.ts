import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { adminDb, getUserEntitlement } from './firebaseAdmin';
import { requireAuth, requireVerifiedEmail } from './auth';

export const workflowRouter = Router();

export const WORKFLOW_LIMITS = {
  MIN_NAME_LENGTH: 1,
  MAX_NAME_LENGTH: 120,
  MIN_DESCRIPTION_LENGTH: 0,
  MAX_DESCRIPTION_LENGTH: 500,
  MIN_STEPS: 1,
  MAX_STEPS: 10,
  MIN_STEP_ID_LENGTH: 1,
  MAX_STEP_ID_LENGTH: 64,
  MIN_ESTIMATED_SAVED_SEC: 0,
  MAX_ESTIMATED_SAVED_SEC: 86400,
} as const;

const VALID_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;

/**
 * Validates workflow steps array:
 * 1 <= length <= 10, EVERY element is a valid tool ID string between 1 and 64 characters.
 */
export function validateWorkflowSteps(steps: unknown): string[] | null {
  if (!Array.isArray(steps)) return null;
  if (steps.length < WORKFLOW_LIMITS.MIN_STEPS || steps.length > WORKFLOW_LIMITS.MAX_STEPS) {
    return null;
  }
  const sanitized: string[] = [];
  for (const s of steps) {
    if (typeof s !== 'string') return null;
    const trimmed = s.trim();
    if (
      trimmed.length < WORKFLOW_LIMITS.MIN_STEP_ID_LENGTH ||
      trimmed.length > WORKFLOW_LIMITS.MAX_STEP_ID_LENGTH
    ) {
      return null;
    }
    if (!VALID_ID_PATTERN.test(trimmed)) return null;
    sanitized.push(trimmed);
  }
  return sanitized;
}

/**
 * Validates workflow name: string between 1 and 120 characters after trimming.
 */
export function validateWorkflowName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (
    trimmed.length < WORKFLOW_LIMITS.MIN_NAME_LENGTH ||
    trimmed.length > WORKFLOW_LIMITS.MAX_NAME_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Validates workflow description: string between 0 and 500 characters (empty string allowed).
 */
export function validateWorkflowDescription(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  const trimmed = description.trim();
  if (
    description.length > WORKFLOW_LIMITS.MAX_DESCRIPTION_LENGTH ||
    trimmed.length > WORKFLOW_LIMITS.MAX_DESCRIPTION_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

/**
 * Validates estimatedSavedSec: finite number between 0 and 86400.
 */
export function validateEstimatedSavedSec(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (
    value < WORKFLOW_LIMITS.MIN_ESTIMATED_SAVED_SEC ||
    value > WORKFLOW_LIMITS.MAX_ESTIMATED_SAVED_SEC
  ) {
    return null;
  }
  return Math.round(value);
}

/**
 * POST /api/workflows
 * Creates a workflow with server-enforced entitlement limits, verified auth, and server-generated ID
 */
workflowRouter.post('/', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({
      ok: false,
      error: 'يجب تسجيل الدخول لإنشاء مسار عمل.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const { name, description, steps, estimatedSavedSec } = req.body || {};

  const cleanSteps = validateWorkflowSteps(steps);
  if (!cleanSteps) {
    res.status(400).json({
      error:
        'خطوات مسار العمل غير صالحة. يجب أن يحتوي المسار على ما بين 1 و 10 خطوات، بحيث يكون كل معرّف أداة نصاً صالحاً (1-64 حرفاً).',
    });
    return;
  }

  const cleanName = validateWorkflowName(name);
  if (!cleanName) {
    res.status(400).json({ error: 'اسم مسار العمل غير صالح (يجب أن يكون بين 1 و 120 حرفاً).' });
    return;
  }

  const cleanDescription = validateWorkflowDescription(
    description === undefined || description === null ? '' : description
  );
  if (cleanDescription === null) {
    res.status(400).json({
      error: 'وصف مسار العمل غير صالح (يجب أن يكون نصاً بطول 0 إلى 500 حرف).',
    });
    return;
  }

  const defaultEstimatedSec = Math.min(
    WORKFLOW_LIMITS.MAX_ESTIMATED_SAVED_SEC,
    cleanSteps.length * 22
  );
  const cleanEstimatedSavedSec =
    estimatedSavedSec === undefined || estimatedSavedSec === null
      ? defaultEstimatedSec
      : validateEstimatedSavedSec(estimatedSavedSec);
  if (cleanEstimatedSavedSec === null) {
    res.status(400).json({
      error: 'قيمة الوقت المقدر الموفر (estimatedSavedSec) غير صالحة (يجب أن تكون بين 0 و 86400 ثانية).',
    });
    return;
  }

  // Enforce server-verified entitlement limits
  const entitlement = await getUserEntitlement(uid);
  try {
    const existingSnap = await adminDb
      .collection('workflows')
      .where('ownerId', '==', uid)
      .get();

    if (existingSnap.size >= entitlement.maxWorkflows) {
      res.status(403).json({
        error: `تم استنفاد الحد الأقصى لمسارات العمل المسموحة لخطتك الحالية (${entitlement.maxWorkflows} مسارات). يرجى الترقية لإضافة المزيد من المسارات المؤتمتة.`,
        planId: entitlement.planId,
        limit: entitlement.maxWorkflows,
        currentCount: existingSnap.size,
      });
      return;
    }

    // Never accept client-supplied ID; generate cryptographically random ID on the server
    const wfId = `wf_${crypto.randomUUID().replace(/-/g, '')}`;

    const now = Date.now();
    const workflowRecord = {
      id: wfId,
      ownerId: uid,
      name: cleanName,
      description: cleanDescription,
      steps: cleanSteps,
      estimatedSavedSec: cleanEstimatedSavedSec,
      runsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Use create() instead of set() so existing documents can never be overwritten
    await adminDb.collection('workflows').doc(wfId).create(workflowRecord);

    res.status(201).json({ ok: true, workflow: workflowRecord });
  } catch (err: unknown) {
    const errCode = (err as { code?: number | string } | null)?.code;
    if (errCode === 6 || errCode === 'already-exists' || errCode === 'ALREADY_EXISTS') {
      res.status(409).json({ error: 'مسار العمل موجود مسبقاً.' });
      return;
    }
    console.error('Error creating workflow:', err);
    res.status(500).json({ error: 'فشل حفظ مسار العمل في قاعدة البيانات.' });
  }
});

/**
 * PUT /api/workflows/:id
 */
workflowRouter.put('/:id', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول.', code: 'UNAUTHORIZED' });
    return;
  }

  const wfId = String(req.params.id || '');
  if (!wfId || wfId.length > 128 || !VALID_ID_PATTERN.test(wfId)) {
    res.status(400).json({ error: 'معرّف مسار العمل غير صالح.' });
    return;
  }

  const { name, description, steps, estimatedSavedSec } = req.body || {};

  try {
    const docRef = adminDb.collection('workflows').doc(wfId);
    const snap = await docRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'مسار العمل غير موجود.' });
      return;
    }
    const existingData = snap.data();
    if (existingData?.ownerId !== uid) {
      res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المسار.' });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const cleanName = validateWorkflowName(name);
      if (!cleanName) {
        res.status(400).json({ error: 'الاسم غير صالح (يجب أن يكون بين 1 و 120 حرفاً).' });
        return;
      }
      updates.name = cleanName;
    }

    if (description !== undefined) {
      const cleanDescription = validateWorkflowDescription(description);
      if (cleanDescription === null) {
        res.status(400).json({
          error: 'الوصف غير صالح (يجب أن يكون نصاً بطول 0 إلى 500 حرف).',
        });
        return;
      }
      updates.description = cleanDescription;
    }

    if (steps !== undefined) {
      const cleanSteps = validateWorkflowSteps(steps);
      if (!cleanSteps) {
        res.status(400).json({
          error: 'الخطوات غير صالحة (يجب أن تكون بين 1 و 10 خطوات، 1-64 حرفاً لكل خطوة).',
        });
        return;
      }
      updates.steps = cleanSteps;
    }

    if (estimatedSavedSec !== undefined) {
      const cleanEstimatedSavedSec = validateEstimatedSavedSec(estimatedSavedSec);
      if (cleanEstimatedSavedSec === null) {
        res.status(400).json({
          error: 'قيمة الوقت المقدر الموفر (estimatedSavedSec) غير صالحة (بين 0 و 86400 ثانية).',
        });
        return;
      }
      updates.estimatedSavedSec = cleanEstimatedSavedSec;
    }

    await docRef.update(updates);
    res.json({
      ok: true,
      workflow: {
        ...existingData,
        ...updates,
        id: wfId,
      },
    });
  } catch {
    res.status(500).json({ error: 'فشل تحديث مسار العمل.' });
  }
});

/**
 * DELETE /api/workflows/:id
 */
workflowRouter.delete('/:id', requireAuth, requireVerifiedEmail, async (req: Request, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ ok: false, error: 'يجب تسجيل الدخول.', code: 'UNAUTHORIZED' });
    return;
  }

  const wfId = String(req.params.id || '');
  if (!wfId || wfId.length > 128 || !VALID_ID_PATTERN.test(wfId)) {
    res.status(400).json({ error: 'معرّف مسار العمل غير صالح.' });
    return;
  }

  try {
    const docRef = adminDb.collection('workflows').doc(wfId);
    const snap = await docRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'مسار العمل غير موجود.' });
      return;
    }
    if (snap.data()?.ownerId !== uid) {
      res.status(403).json({ error: 'غير مصرح لك بحذف هذا المسار.' });
      return;
    }

    await docRef.delete();
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'فشل حذف مسار العمل.' });
  }
});
