/**
 * "Next scheduled" for the after-the-job emails (Settings > Automations): reads the account's completed jobs and
 * warranties and plans them (lib/warranty/postJobPlan.ts, the same code the reminders server uses). Read only; needs a
 * connection (offline the list is simply not shown).
 *
 *   loadUpcomingPostJob(kind, settings, base, today)  -> { items, preview }
 */
import { supabase } from '../supabase.ts';
import { completionDay } from './postJobSettings.ts';
import type { PostJobKind, PostJobSettings } from './types.ts';
import { POST_JOB_JOB_SELECT, type PostJobFacts, type PostJobJobRow } from '../../supabase/functions/reminders/shared/postjob.ts';
import { OVERRIDE_SELECT, indexOverrides, overridesFor, type OverrideRow } from '../../supabase/functions/reminders/shared/targets.ts';
import { loadWarranties } from './warrantyApi.ts';
import { planUpcoming, type UpcomingBase, type UpcomingResult, type UpcomingTarget } from './postJobPlan.ts';

export type { UpcomingBase, UpcomingEmail, UpcomingResult } from './postJobPlan.ts';

export async function loadUpcomingPostJob(
    kind: PostJobKind,
    settings: PostJobSettings,
    base: UpcomingBase,
    today: string,
    now: Date = new Date(),
    limit = 5,
): Promise<UpcomingResult> {
    const { data: overrideRows, error: overrideError } = await supabase.from('reminder_overrides').select(OVERRIDE_SELECT);
    if (overrideError) throw overrideError;
    const idx = indexOverrides((overrideRows as OverrideRow[] | null) ?? []);
    const targets: UpcomingTarget[] = [];

    if (kind === 'warranty') {
        for (const w of await loadWarranties(today, { limit: 300 })) {
            const o = w.overview;
            const facts: PostJobFacts = { kind, id: w.id, anchor: o.expiresOn, inactive: o.status === 'void' || o.status === 'lifetime' || !o.expiresOn };
            targets.push({
                facts,
                client: w.clientName,
                job: w.number ? `Warranty ${w.number}` : 'Warranty',
                overrides: overridesFor(idx, { documentId: w.id, clientId: w.clientId }),
            });
        }
    } else {
        const { data, error } = await supabase.from('jobs').select(POST_JOB_JOB_SELECT).ilike('status', 'completed').order('updated_at', { ascending: false }).limit(300);
        if (error) throw error;
        for (const j of ((data as PostJobJobRow[] | null) ?? [])) {
            targets.push({
                facts: { kind, id: j.id, anchor: completionDay(j, base.timezone) },
                client: String(j.client_name ?? ''),
                job: String(j.name ?? ''),
                overrides: overridesFor(idx, { jobId: j.id, clientId: j.client_id ?? null }),
            });
        }
    }
    return planUpcoming(kind, settings, base, today, now, targets, limit);
}
