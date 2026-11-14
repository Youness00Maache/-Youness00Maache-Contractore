# AI credit top-ups — progress (stopped early on coordinator request, 2026-11-14)

Feature flag OFF by default (secret AI_CREDITS_ENABLED unset) => current behaviour unchanged. Nothing applied,
deployed or committed. Project type-checks (tsc 0 errors).

## Kelviq research (public docs, base https://docs.kelviq.com)
- One-time plans: billing cycle "One time"; chargePeriod enum ONE_TIME|MONTHLY|YEARLY|WEEKLY|DAILY|... 
  /product-catalog/one-time-payments.md, /api-reference/checkout/create-a-checkout-session.md
- Credit packs documented as "a one-time plan that grants a fixed amount of a Meter feature": /checkout/checkout-examples.md,
  /product-catalog/usage-limits.md (Meter reset NEVER). We keep our own ledger instead.
- Checkout POST /checkout/: planIdentifier, chargePeriod, customerId, successUrl, cancelUrl, email, metadata (echoed on
  checkout.completed), customAmount (+taxBehavior/currencyCode), features[{identifier,quantity}]. No pay-what-you-want.
- OFF-SESSION CHARGE EXISTS: POST /charges/ {planIdentifier, chargePeriod: ONE_TIME, customerId, customAmount?} charges the
  customer's default saved payment method (from a previous checkout/subscription). 201 => {id, amount, currency, status};
  400 on decline / 3DS needed / no card. NO idempotency key; docs: don't auto-retry 400, check Sales > Orders on timeout.
  /api-reference/charges/create-a-charge.md, /sales/create-a-one-time-charge.md
- No built-in auto top-up / wallet. Usage report POST /report/usage/, entitlements GET /entitlements/, feature.usage_alert.
- Webhooks (/guides/webhooks.md): checkout.completed (id=cs_…, checkout_type, customer.customer_id, plan.identifier, amount,
  metadata; no order id), order.created|updated|refunded (id=ORD-…, plan.identifier, paid_at, amount_total_units,
  status REFUNDED|PARTIAL_REFUND), refund.created|updated (id, order_id, amount_units, status), invoice.*, subscription.*.
  Dedupe by event id = webhook-id header; up to 3 retries 60 s apart on 5xx/429/timeouts. Signature = HMAC-SHA256 hex (existing verifier OK).
- Fees: 2.9% + $0.40 (+1.5% international) per one-time payment (/getstarted/fees.md).

## Done (files)
- supabase/functions/_shared/aiCredits.ts — packs ($5=100, $10=220, $20=480, $50=1300), flag, routing, refund math, charge outcome.
- docs/work/DRAFT_ai_credits.sql — ledger (UNIQUE source_key), settings, recharges, orders, balance view, RLS read-own,
  service-role-only functions: spend_ai_credit, claim/finish_ai_auto_recharge, ai_credit_status, set_ai_credit_settings,
  apply_ai_credit_event (checkout/order/refund), adjust_ai_credits. NOT executed anywhere (no local Postgres; disk was full
  so PGlite could not be installed) — only statically checked.
- ai-assistant/handler.ts + index.ts — admit(): plan allowance -> credit -> (auto top-up at 0) -> 402 CREDITS_EMPTY; races; waitUntil.
- kelviq-checkout/credits.ts + index.ts — credits_status / credits_checkout (ONE_TIME) / credits_settings.
- kelviq-webhook/route.ts + index.ts — credit-pack events never reach apply_kelviq_event (its order.refunded would downgrade
  the subscription); refund.* falls back to the old handler when the SQL is missing.
- lib/aiCredits.ts, components/billing/AICredits.tsx (Settings row, panel "Buy more credits", upgrade-window strip),
  Settings.tsx, UpgradeModal.tsx, AssistantPanel.tsx, src/ai/events.ts (isAiLimitCode), useAIAssistant/useContractorAI,
  AIDocumentModal, PhotoAIModal, routerContract.ts (meta.usage optional fields).
- Help (helpContent.ts ai + settings tips) + knowledge.ts entry 'ai-credits' (synced with --sync-knowledge).
- scripts/ai-credits-check.ts — 162 checks.

## Left
- Run: npm run build, npm run qa:document-ai, npx tsx scripts/payments-qa.ts, esbuild bundles for the 3 functions.
- Execute the DRAFT SQL against a throwaway Postgres (PGlite/branch DB) before applying to production.
- Owner: create 4 one-time Kelviq plans (ai-credits-5/10/20/50), subscribe the webhook to order.* + refund.*, apply SQL,
  redeploy the 3 functions, set AI_CREDITS_ENABLED=true (needs KELVIQ_SERVER_API_KEY + KELVIQ_WEBHOOK_SECRET).
- Confirm with Kelviq: a one-time checkout saves the card for POST /charges/; which webhook a /charges/ payment sends.
