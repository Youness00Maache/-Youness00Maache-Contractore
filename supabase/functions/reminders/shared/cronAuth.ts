// Who may run the reminders function: only pg_cron, which sends the x-reminders-secret header.
// The secret is generated inside the database (migration 20261113000300, Vault 'reminders_cron_secret') and never
// leaves it: the function asks public.reminders_check_secret(header) with its built-in service-role key.
// REMINDERS_CRON_SECRET (env) is an optional override (e.g. for a local stack); it is not needed in production.

export type CronAuthResult = 'ok' | 'denied' | 'unavailable';

/** Comparison whose time does not depend on where the strings differ. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i % a.length) ^ b.charCodeAt(i % b.length)) | 0;
  return diff === 0;
}

export const CRON_SECRET_MIN = 32;
export const CRON_SECRET_MAX = 512;

/**
 * ok          the header is the cron secret
 * denied      missing / malformed / wrong header
 * unavailable the database could not answer (migration not applied, network) -> 503, cron retries next tick
 */
export async function verifyCronSecret(
  header: string | null | undefined,
  opts: { override?: string | null; checkInDatabase: (secret: string) => Promise<boolean> },
): Promise<CronAuthResult> {
  const given = String(header ?? '').trim();
  if (given.length < CRON_SECRET_MIN || given.length > CRON_SECRET_MAX) return 'denied';
  const override = String(opts.override ?? '').trim();
  if (override && constantTimeEqual(given, override)) return 'ok';
  try {
    return (await opts.checkInDatabase(given)) ? 'ok' : 'denied';
  } catch {
    return 'unavailable';
  }
}
