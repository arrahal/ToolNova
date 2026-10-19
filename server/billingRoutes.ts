import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { LEMONSQUEEZY_WEBHOOK_SECRET } from './config';
import { setUserEntitlement, PlanTier, getUserEntitlement } from './firebaseAdmin';

export const billingRouter = Router();

/**
 * Lemon Squeezy Webhook endpoint
 * Validates HMAC SHA256 signature on the RAW body using LEMONSQUEEZY_WEBHOOK_SECRET
 */
billingRouter.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer | undefined;

  if (!LEMONSQUEEZY_WEBHOOK_SECRET) {
    console.error('[Billing Webhook] LEMONSQUEEZY_WEBHOOK_SECRET is not configured.');
    res.status(500).json({ error: 'Billing webhook secret not configured on server.' });
    return;
  }

  if (!signature || !rawBody) {
    res.status(400).json({ error: 'Missing webhook signature or raw payload.' });
    return;
  }

  // Compute HMAC SHA256 in hex
  const hmac = crypto.createHmac('sha256', LEMONSQUEEZY_WEBHOOK_SECRET);
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
  const eventName = payload?.meta?.event_name || '';
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
  const productName = String(
    attributes.first_order_item?.product_name ||
    attributes.product_name ||
    customData.plan_id ||
    ''
  ).toLowerCase();
  const variantName = String(
    attributes.first_order_item?.variant_name ||
    attributes.variant_name ||
    ''
  ).toLowerCase();

  let resolvedPlan: PlanTier = 'pro';
  if (productName.includes('enterprise') || variantName.includes('enterprise') || productName.includes('business')) {
    resolvedPlan = 'enterprise';
  } else if (productName.includes('pro') || variantName.includes('pro')) {
    resolvedPlan = 'pro';
  }

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
          subscriptionId: payload?.data?.id ? String(payload.data.id) : undefined,
          customerId: attributes.customer_id ? String(attributes.customer_id) : undefined,
          variantId: attributes.variant_id ? String(attributes.variant_id) : undefined,
        });
        console.log(`[Billing Webhook] Upgraded user ${targetUid} to ${resolvedPlan}.`);
        break;

      case 'subscription_updated':
        if (subscriptionStatus === 'active' || subscriptionStatus === 'on_trial') {
          await setUserEntitlement(targetUid, {
            planId: resolvedPlan,
            status: 'active',
            provider: 'lemonsqueezy',
            subscriptionId: payload?.data?.id ? String(payload.data.id) : undefined,
          });
        } else if (subscriptionStatus === 'cancelled' || subscriptionStatus === 'expired') {
          await setUserEntitlement(targetUid, {
            planId: 'free',
            status: subscriptionStatus as any,
            provider: 'lemonsqueezy',
          });
        }
        break;

      case 'subscription_cancelled':
        // Cancelled subscriptions may remain active until end of billing cycle or downgrade
        await setUserEntitlement(targetUid, {
          planId: attributes.ends_at && new Date(attributes.ends_at).getTime() < Date.now() ? 'free' : resolvedPlan,
          status: 'cancelled',
          provider: 'lemonsqueezy',
        });
        console.log(`[Billing Webhook] Subscription cancelled for user ${targetUid}.`);
        break;

      case 'subscription_expired':
        await setUserEntitlement(targetUid, {
          planId: 'free',
          status: 'expired',
          provider: 'lemonsqueezy',
        });
        console.log(`[Billing Webhook] Subscription expired for user ${targetUid}, reverted to free.`);
        break;

      default:
        console.log(`[Billing Webhook] Unhandled event: ${eventName}`);
        break;
    }

    res.status(200).json({ success: true, event: eventName, uid: targetUid });
  } catch (err: any) {
    console.error(`[Billing Webhook Error]:`, err);
    res.status(500).json({ error: 'Failed to process entitlement update.' });
  }
});

/**
 * Public entitlement inspection for authenticated user session
 */
billingRouter.get('/entitlement', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // Decode or verify user UID
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      res.status(401).json({ error: 'Invalid token.' });
      return;
    }
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const uid = payload.sub || payload.user_id || payload.uid;
    if (!uid) {
      res.status(401).json({ error: 'Invalid token payload.' });
      return;
    }

    const entitlement = await getUserEntitlement(uid);
    res.json({ ok: true, entitlement });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve entitlement.' });
  }
});
