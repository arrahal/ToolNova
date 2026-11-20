import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { LEMONSQUEEZY_WEBHOOK_SECRET } from './config';
import {
  setUserEntitlement,
  PlanTier,
  getUserEntitlement,
  claimProcessedWebhook,
  releaseProcessedWebhook,
} from './firebaseAdmin';
import { requireAuth } from './auth';

export const billingRouter = Router();

function parseVariantIdSet(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function resolvePlanFromVariantId(variantIdRaw: unknown): PlanTier | null {
  if (variantIdRaw === undefined || variantIdRaw === null) {
    return null;
  }
  const variantId = String(variantIdRaw).trim();
  if (!variantId) {
    return null;
  }

  const proVariants = parseVariantIdSet(process.env.LEMONSQUEEZY_PRO_VARIANT_IDS);
  const enterpriseVariants = parseVariantIdSet(process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_IDS);

  if (enterpriseVariants.has(variantId)) {
    return 'enterprise';
  }
  if (proVariants.has(variantId)) {
    return 'pro';
  }
  return null;
}

function parseEndsAtMs(rawEndsAt: unknown): number | null {
  if (typeof rawEndsAt === 'number' && Number.isFinite(rawEndsAt)) {
    return rawEndsAt;
  }
  if (typeof rawEndsAt === 'string' && rawEndsAt.trim()) {
    const parsed = Date.parse(rawEndsAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Lemon Squeezy Webhook endpoint
 * Validates HMAC SHA256 signature on the RAW body using LEMONSQUEEZY_WEBHOOK_SECRET
 */
billingRouter.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-signature'] as string | undefined;
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || LEMONSQUEEZY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Billing Webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not configured.');
    res.status(500).json({ error: 'Billing webhook secret not configured on server.' });
    return;
  }

  if (!signature || !rawBody) {
    res.status(400).json({ error: 'Missing webhook signature or raw payload.' });
    return;
  }

  // Compute HMAC SHA256 in hex
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(rawBody);
  const computedHex = hmac.digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const compBuffer = Buffer.from(computedHex, 'hex');

  if (sigBuffer.length !== compBuffer.length || !crypto.timingSafeEqual(sigBuffer, compBuffer)) {
    console.warn('[Billing Webhook] Rejected request with invalid HMAC signature.');
    res.status(401).json({ error: 'Invalid HMAC signature.' });
    return;
  }

  const payload = req.body;
  const eventName = String(payload?.meta?.event_name || '');

  if (process.env.NODE_ENV === 'production' && payload?.meta?.test_mode === true) {
    console.warn(`[Billing Webhook] Rejected test_mode webhook '${eventName}' in production.`);
    res.status(403).json({ error: 'Test mode webhooks are rejected in production.' });
    return;
  }

  const customData =
    payload?.meta?.custom_data ||
    payload?.data?.attributes?.custom_data ||
    {};

  const targetUid = String(
    customData?.user_id || customData?.firebase_uid || customData?.uid || ''
  ).trim();

  if (!targetUid) {
    console.warn(`[Billing Webhook] Event '${eventName}' missing Firebase UID in custom_data.`);
    // Acknowledge receipt to avoid webhook re-delivery loops for unmapped webhooks
    res.status(200).json({ received: true, warning: 'No Firebase UID mapped.' });
    return;
  }

  const attributes = payload?.data?.attributes || {};
  const rawVariantId = attributes.variant_id ?? attributes.first_order_item?.variant_id;
  const resolvedPlan = resolvePlanFromVariantId(rawVariantId);

  if (!resolvedPlan) {
    console.warn(
      `[Billing Webhook] Unknown variant '${String(rawVariantId ?? '')}' for event '${eventName}'.`
    );
    res.status(200).json({ received: true, warning: 'Unknown variant' });
    return;
  }

  const webhookIdRaw = payload?.meta?.webhook_id;
  const eventId =
    webhookIdRaw !== undefined && webhookIdRaw !== null && String(webhookIdRaw).trim()
      ? `ls_${String(webhookIdRaw).trim()}`
      : `sha256_${crypto.createHash('sha256').update(rawBody).digest('hex')}`;

  let claimed = false;
  try {
    claimed = await claimProcessedWebhook(eventId, { eventName, uid: targetUid });
  } catch (err: unknown) {
    console.error('[Billing Webhook] Failed to record idempotency lock:', err);
    res.status(500).json({ error: 'Failed to process webhook idempotency.' });
    return;
  }

  if (!claimed) {
    res.status(200).json({ received: true, duplicate: true });
    return;
  }

  const subscriptionId = payload?.data?.id ? String(payload.data.id) : undefined;
  const customerId = attributes.customer_id ? String(attributes.customer_id) : undefined;
  const variantId = String(rawVariantId).trim();
  const subscriptionStatus = String(attributes.status || '').toLowerCase();

  try {
    switch (eventName) {
      case 'order_created':
      case 'subscription_created':
      case 'subscription_resumed':
        await setUserEntitlement(targetUid, {
          planId: resolvedPlan,
          status: 'active',
          provider: 'lemonsqueezy',
          subscriptionId,
          customerId,
          variantId,
          endsAt: null,
        });
        console.log(`[Billing Webhook] Upgraded user ${targetUid} to ${resolvedPlan}.`);
        break;

      case 'subscription_payment_failed': {
        const endsAtMs = parseEndsAtMs(attributes.ends_at);
        await setUserEntitlement(targetUid, {
          planId: resolvedPlan,
          status: 'past_due',
          provider: 'lemonsqueezy',
          subscriptionId,
          customerId,
          variantId,
          endsAt: endsAtMs,
        });
        console.warn(`[Billing Webhook] Payment failed for user ${targetUid}; marked past_due.`);
        break;
      }

      case 'subscription_updated':
        if (subscriptionStatus === 'active' || subscriptionStatus === 'on_trial') {
          await setUserEntitlement(targetUid, {
            planId: resolvedPlan,
            status: 'active',
            provider: 'lemonsqueezy',
            subscriptionId,
            customerId,
            variantId,
            endsAt: null,
          });
        } else if (subscriptionStatus === 'past_due') {
          await setUserEntitlement(targetUid, {
            planId: resolvedPlan,
            status: 'past_due',
            provider: 'lemonsqueezy',
            subscriptionId,
            customerId,
            variantId,
            endsAt: parseEndsAtMs(attributes.ends_at),
          });
        } else if (subscriptionStatus === 'cancelled') {
          const endsAtMs = parseEndsAtMs(attributes.ends_at);
          const keepPaidPlan = endsAtMs !== null && endsAtMs > Date.now();
          await setUserEntitlement(targetUid, {
            planId: keepPaidPlan ? resolvedPlan : 'free',
            status: 'cancelled',
            provider: 'lemonsqueezy',
            subscriptionId,
            customerId,
            variantId,
            endsAt: endsAtMs,
          });
        } else if (subscriptionStatus === 'expired') {
          await setUserEntitlement(targetUid, {
            planId: 'free',
            status: 'expired',
            provider: 'lemonsqueezy',
            subscriptionId,
            customerId,
            variantId,
            endsAt: null,
          });
        }
        break;

      case 'subscription_cancelled': {
        const endsAtMs = parseEndsAtMs(attributes.ends_at);
        const keepPaidPlan = endsAtMs !== null && endsAtMs > Date.now();
        await setUserEntitlement(targetUid, {
          planId: keepPaidPlan ? resolvedPlan : 'free',
          status: 'cancelled',
          provider: 'lemonsqueezy',
          subscriptionId,
          customerId,
          variantId,
          endsAt: endsAtMs,
        });
        console.log(`[Billing Webhook] Subscription cancelled for user ${targetUid}.`);
        break;
      }

      case 'subscription_expired':
        await setUserEntitlement(targetUid, {
          planId: 'free',
          status: 'expired',
          provider: 'lemonsqueezy',
          subscriptionId,
          customerId,
          variantId,
          endsAt: null,
        });
        console.log(`[Billing Webhook] Subscription expired for user ${targetUid}, reverted to free.`);
        break;

      default:
        console.log(`[Billing Webhook] Unhandled event: ${eventName}`);
        break;
    }

    res.status(200).json({ success: true, event: eventName, uid: targetUid });
  } catch (err: unknown) {
    await releaseProcessedWebhook(eventId);
    console.error(`[Billing Webhook Error]:`, err);
    res.status(500).json({ error: 'Failed to process entitlement update.' });
  }
});

/**
 * Public entitlement inspection for authenticated user session
 */
billingRouter.get('/entitlement', requireAuth, async (req: Request, res: Response) => {
  const uid = req.user?.uid;
  if (!uid) {
    res.status(401).json({ ok: false, error: 'Authentication required.', code: 'UNAUTHORIZED' });
    return;
  }

  try {
    const entitlement = await getUserEntitlement(uid);
    res.json({ ok: true, entitlement });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve entitlement.' });
  }
});
