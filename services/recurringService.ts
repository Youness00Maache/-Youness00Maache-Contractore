/**
 * Recurring invoices (VIEW-039).
 *
 * Generation happens in the database: RPC `generate_due_recurring_invoices()` copies every due recurring
 * invoice of the calling user, advances its `nextRunDate` (clamped month arithmetic) and is idempotent per
 * period, so calling it from several tabs or devices never creates duplicates. The browser only triggers it.
 *
 * Usage (App.tsx, once after login): `const created = await runDueRecurringInvoices(); if (created) refreshDocuments();`
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import type { FormData } from '../types.ts';
import { cappedRecurrence, describeRecurringRun, planRecurringCatchUp, serverToday, type SkippedSeries } from '../lib/recurring.ts';

export interface RecurringRunResult {
  /** number of invoices created by this call */
  created: number;
  /** series that were more than one period behind: only their latest period was created (PARITY_V2 D2) */
  skipped?: SkippedSeries[];
  /** set when the RPC failed (e.g. offline or not deployed yet); never thrown */
  error?: string;
}

export { describeRecurringRun };

/** Toast text for a run result (null = nothing to say). */
export const describeRecurringResult = (result: RecurringRunResult | null | undefined): string | null =>
  result ? describeRecurringRun(result.created, result.skipped || []) : null;

/**
 * Catch-up cap: a recurring invoice that is more than one period behind is moved to its latest due period before the
 * RPC runs, so the RPC creates ONE draft (the latest period) instead of up to 24. Only the source invoice's
 * `recurrence` changes (next run date, pinned anchor day, a note of the skipped periods); the update is conditional
 * on the next run date it read, so a run in another tab can't be undone. Never throws.
 */
export const capRecurringCatchUp = async (today: string = serverToday()): Promise<SkippedSeries[]> => {
  const skipped: SkippedSeries[] = [];
  try {
    const { data: rows, error } = await supabase
      .from('documents')
      .select('id, user_id, data')
      .eq('type', 'Invoice')
      .eq('data->recurrence->>enabled', 'true')
      .lte('data->recurrence->>nextRunDate', today)
      .is('data->>recurrenceSourceId', null)
      .limit(500);
    if (error || !rows) return skipped;
    for (const row of rows as Array<{ id: string; user_id: string; data: Record<string, any> | null }>) {
      const data = row.data;
      const rec = data && typeof data.recurrence === 'object' && data.recurrence ? data.recurrence as Record<string, unknown> : null;
      if (!data || !rec) continue;
      const plan = planRecurringCatchUp(rec, today);
      const next = cappedRecurrence(rec, plan);
      if (!next) continue;
      const { data: updated, error: upErr } = await supabase
        .from('documents')
        .update({ data: { ...data, recurrence: next } })
        .eq('id', row.id)
        .eq('user_id', row.user_id)
        .eq('data->recurrence->>nextRunDate', String(rec.nextRunDate))
        .select('id');
      if (upErr || !updated?.length) continue;
      skipped.push({ id: row.id, invoiceNumber: String(data.invoiceNumber || ''), skipped: plan.skipped.length, from: plan.skipped[0], to: plan.skipped[plan.skipped.length - 1] });
    }
  } catch {
    /* the cap is best effort: the RPC still runs */
  }
  return skipped;
};

let inFlight: Promise<RecurringRunResult> | null = null;
let lastRunAt = 0;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Calls the RPC and reports the outcome. Never throws. Concurrent calls share one request. */
export const generateDueRecurringInvoices = async (opts: { force?: boolean } = {}): Promise<RecurringRunResult> => {
  if (inFlight) return inFlight;
  if (!opts.force && Date.now() - lastRunAt < MIN_INTERVAL_MS) return { created: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { created: 0, error: 'offline' };
  inFlight = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return { created: 0, error: 'not signed in' };
      const skipped = await capRecurringCatchUp();
      const { data, error } = await supabase.rpc('generate_due_recurring_invoices');
      if (error) return { created: 0, skipped, error: error.message };
      lastRunAt = Date.now();
      const created = typeof data === 'number' ? data : Number((data as any)?.created ?? data) || 0;
      return { created: Math.max(0, Math.floor(created)), skipped };
    } catch (e: any) {
      return { created: 0, error: e?.message || String(e) };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

/** Convenience: number of invoices created (0 on any failure). */
export const runDueRecurringInvoices = async (opts: { force?: boolean } = {}): Promise<number> =>
  (await generateDueRecurringInvoices(opts)).created;

/**
 * @deprecated kept for backward compatibility with the old client-side generator signature.
 * The arguments are ignored; generation runs server-side.
 */
export const processRecurringInvoices = async (
  _client?: SupabaseClient,
  _userId?: string,
  _forms?: FormData[],
): Promise<{ processedCount: number; newForms: FormData[] }> => {
  const created = await runDueRecurringInvoices({ force: true });
  return { processedCount: created, newForms: [] };
};
