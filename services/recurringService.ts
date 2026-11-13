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

export interface RecurringRunResult {
  /** number of invoices created by this call */
  created: number;
  /** set when the RPC failed (e.g. offline or not deployed yet); never thrown */
  error?: string;
}

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
      const { data, error } = await supabase.rpc('generate_due_recurring_invoices');
      if (error) return { created: 0, error: error.message };
      lastRunAt = Date.now();
      const created = typeof data === 'number' ? data : Number((data as any)?.created ?? data) || 0;
      return { created: Math.max(0, Math.floor(created)) };
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
