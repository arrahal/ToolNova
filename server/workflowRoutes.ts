import { Router, Request, Response } from 'express';
import { adminDb, getUserEntitlement } from './firebaseAdmin';

export const workflowRouter = Router();

function getAuthenticatedUid(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    return payload.sub || payload.user_id || payload.uid || null;
  } catch {
    return null;
  }
}

/**
 * Validates workflow steps array:
 * 1 <= length <= 10, every element is a string between 1 and 64 characters
 */
export function validateWorkflowSteps(steps: unknown): string[] | null {
  if (!Array.isArray(steps)) return null;
  if (steps.length < 1 || steps.length > 10) return null;
  const sanitized: string[] = [];
  for (const s of steps) {
    if (typeof s !== 'string') return null;
    const trimmed = s.trim();
    if (trimmed.length < 1 || trimmed.length > 64) return null;
    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) return null;
    sanitized.push(trimmed);
  }
  return sanitized;
}

/**
 * POST /api/workflows
 * Creates a workflow with server-enforced entitlement limits and step validation
 */
workflowRouter.post('/', async (req: Request, res: Response) => {
  const uid = getAuthenticatedUid(req);
  if (!uid) {
    res.status(401).json({ error: 'يجب تسجيل الدخول لإنشاء مسار عمل.' });
    return;
  }

  const { id, name, description, steps, estimatedSavedSec } = req.body || {};

  const cleanSteps = validateWorkflowSteps(steps);
  if (!cleanSteps) {
    res.status(400).json({
      error: 'خطوات مسار العمل غير صالحة. يجب أن يحتوي المسار على ما بين 1 و 10 خطوات، بحيث يكون كل اسم أداة نصاً صالحاً (1-64 حرفاً).',
    });
    return;
  }

  const cleanName = String(name || '').trim();
  if (cleanName.length < 1 || cleanName.length > 120) {
    res.status(400).json({ error: 'اسم مسار العمل غير صالح (يجب أن يكون بين 1 و 120 حرفاً).' });
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

    const wfId = id && typeof id === 'string' && /^[a-zA-Z0-9_\-]{3,128}$/.test(id)
      ? id
      : `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const now = Date.now();
    const workflowRecord = {
      id: wfId,
      ownerId: uid,
      name: cleanName,
      description: String(description || '').trim().slice(0, 500),
      steps: cleanSteps,
      estimatedSavedSec: Math.max(0, Math.min(36000, Number(estimatedSavedSec) || cleanSteps.length * 20)),
      runsCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await adminDb.collection('workflows').doc(wfId).set(workflowRecord);

    res.status(201).json({ ok: true, workflow: workflowRecord });
  } catch (err: unknown) {
    console.error('Error creating workflow:', err);
    res.status(500).json({ error: 'فشل حفظ مسار العمل في قاعدة البيانات.' });
  }
});

/**
 * PUT /api/workflows/:id
 */
workflowRouter.put('/:id', async (req: Request, res: Response) => {
  const uid = getAuthenticatedUid(req);
  if (!uid) {
    res.status(401).json({ error: 'يجب تسجيل الدخول.' });
    return;
  }

  const wfId = String(req.params.id || '');
  const { name, description, steps } = req.body || {};

  try {
    const docRef = adminDb.collection('workflows').doc(wfId);
    const snap = await docRef.get();
    if (!snap.exists) {
      res.status(404).json({ error: 'مسار العمل غير موجود.' });
      return;
    }
    if (snap.data()?.ownerId !== uid) {
      res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المسار.' });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (cleanName.length < 1 || cleanName.length > 120) {
        res.status(400).json({ error: 'الاسم غير صالح.' });
        return;
      }
      updates.name = cleanName;
    }

    if (description !== undefined) {
      updates.description = String(description).slice(0, 500);
    }

    if (steps !== undefined) {
      const cleanSteps = validateWorkflowSteps(steps);
      if (!cleanSteps) {
        res.status(400).json({ error: 'الخطوات غير صالحة (الحد الأقصى 10 خطوات، 1-64 حرفاً لكل خطوة).' });
        return;
      }
      updates.steps = cleanSteps;
    }

    await docRef.update(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل تحديث مسار العمل.' });
  }
});

/**
 * DELETE /api/workflows/:id
 */
workflowRouter.delete('/:id', async (req: Request, res: Response) => {
  const uid = getAuthenticatedUid(req);
  if (!uid) {
    res.status(401).json({ error: 'يجب تسجيل الدخول.' });
    return;
  }

  const wfId = String(req.params.id || '');
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
  } catch (err) {
    res.status(500).json({ error: 'فشل حذف مسار العمل.' });
  }
});
