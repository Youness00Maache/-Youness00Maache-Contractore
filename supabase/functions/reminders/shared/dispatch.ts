// Sending loop with all I/O injected, so scripts/reminders-check.ts can prove "never twice" and the email cap.
//
// For each due reminder, in order:
//   1. blocked (no Gmail / Gmail needs reconnect) or no client email -> record a skip (shown in the app)
//   2. Free plan and the monthly email cap reached                   -> record a skip 'email_limit'
//   3. claim: INSERT a 'sending' row under the unique (user_id, dedupe_key); someone else holds it -> do nothing.
//      A retryable failed row is claimed with a conditional UPDATE (status='failed' and attempts=n).
//   4. send through Gmail -> mark 'sent' + count the email; or mark 'failed' with a reason.
// A row left in 'sending' (crash mid-send) is never sent again: the server closes it as 'interrupted'.

import { canSendEmail, type EmailAllowance, type ReminderKind } from './schedule.ts';

export interface OutgoingReminder {
  userId: string;
  kind: ReminderKind;
  documentId: string | null;
  jobId: string | null;
  clientId: string | null;
  stepKey: string;
  /** step date (anchor + offset), part of the dedupe key */
  scheduledFor: string;
  dedupeKey: string;
  /** an earlier failed attempt that may be retried */
  retry: { id: string; attempts: number } | null;
  /** client address, null when the client has no valid email */
  to: string | null;
  /** why it cannot be sent at all right now */
  block: 'no_gmail' | 'gmail_reconnect' | null;
  accountId: string | null;
  subject: string;
  text: string;
  html: string;
}

/** A send that failed. `retryable` = nothing reached the client, try again on a later run. */
export class SendFailure extends Error {
  reason: string;
  retryable: boolean;
  constructor(reason: string, message: string, retryable: boolean) {
    super(message);
    this.name = 'SendFailure';
    this.reason = reason;
    this.retryable = retryable;
  }
}

export interface Claim {
  id: string;
  attempts: number;
}

export interface DispatchDeps {
  /** this month's email usage of the user (the loop increments `used` after each send) */
  allowance(userId: string): EmailAllowance;
  recordSkip(item: OutgoingReminder, reason: string): Promise<void>;
  claim(item: OutgoingReminder): Promise<Claim | null>;
  send(item: OutgoingReminder): Promise<{ messageId: string }>;
  markSent(claim: Claim, item: OutgoingReminder, messageId: string): Promise<void>;
  markFailed(claim: Claim, item: OutgoingReminder, failure: SendFailure): Promise<void>;
  recordUsage(claim: Claim, item: OutgoingReminder): Promise<void>;
  /** false = stop (time budget used up); the rest goes out on the next run */
  hasTime?(): boolean;
  log?(message: string): void;
}

export interface DispatchSummary {
  sent: number;
  skipped: number;
  failed: number;
  /** claimed by another run, or already handled */
  taken: number;
  /** left for the next run (out of time, Gmail busy) */
  deferred: number;
  reasons: Record<string, number>;
}

export const emptySummary = (): DispatchSummary => ({ sent: 0, skipped: 0, failed: 0, taken: 0, deferred: 0, reasons: {} });

export function mergeSummary(into: DispatchSummary, add: DispatchSummary): DispatchSummary {
  into.sent += add.sent;
  into.skipped += add.skipped;
  into.failed += add.failed;
  into.taken += add.taken;
  into.deferred += add.deferred;
  for (const [k, v] of Object.entries(add.reasons)) into.reasons[k] = (into.reasons[k] || 0) + v;
  return into;
}

/** Reasons after which the user's other reminders in this run cannot succeed either. */
const USER_BLOCKING = new Set(['gmail_reconnect', 'gmail_api_disabled', 'not_configured']);
/** Reasons after which the user's other reminders should simply wait for the next run. */
const USER_DEFER = new Set(['gmail_rate_limit']);

export async function dispatchReminders(items: OutgoingReminder[], deps: DispatchDeps): Promise<DispatchSummary> {
  const summary = emptySummary();
  const count = (reason: string) => { summary.reasons[reason] = (summary.reasons[reason] || 0) + 1; };
  const blocked = new Map<string, string>();
  const deferredUsers = new Set<string>();
  const seen = new Set<string>();

  for (const item of items) {
    if (deps.hasTime && !deps.hasTime()) {
      summary.deferred++;
      continue;
    }
    const key = `${item.userId}|${item.dedupeKey}`;
    if (seen.has(key)) {
      summary.taken++;
      continue;
    }
    seen.add(key);
    if (deferredUsers.has(item.userId)) {
      summary.deferred++;
      continue;
    }

    const skip = async (reason: string) => {
      await deps.recordSkip(item, reason);
      summary.skipped++;
      count(reason);
    };

    try {
      const block = item.block ?? blocked.get(item.userId) ?? null;
      if (block) { await skip(block); continue; }
      if (!item.to) { await skip('no_email'); continue; }
      const allowance = deps.allowance(item.userId);
      if (!canSendEmail(allowance)) { await skip('email_limit'); continue; }

      const claim = await deps.claim(item);
      if (!claim) { summary.taken++; continue; }

      let messageId: string;
      try {
        ({ messageId } = await deps.send(item));
      } catch (e) {
        // an unexpected error may have happened after Gmail accepted the message: never retried
        const failure = e instanceof SendFailure ? e : new SendFailure('interrupted', (e as Error)?.message || 'Unknown error', false);
        await deps.markFailed(claim, item, failure);
        summary.failed++;
        count(failure.reason);
        if (USER_BLOCKING.has(failure.reason)) blocked.set(item.userId, failure.reason);
        if (USER_DEFER.has(failure.reason)) deferredUsers.add(item.userId);
        continue;
      }
      // sent: from here on a database error leaves the row in 'sending' (closed later as 'interrupted', never resent)
      allowance.used++;
      summary.sent++;
      await deps.markSent(claim, item, messageId);
      await deps.recordUsage(claim, item);
    } catch (e) {
      // bookkeeping failed (database hiccup): leave it for the next run, the dedupe key keeps it single
      deps.log?.(`[reminders] ${item.dedupeKey} bookkeeping failed: ${(e as Error)?.message ?? e}`);
      summary.deferred++;
    }
  }
  return summary;
}
