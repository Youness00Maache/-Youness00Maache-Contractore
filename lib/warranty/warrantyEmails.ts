/**
 * The "Warranty emails" switch of one warranty (Warranty form): what the account has set, this document's own OFF
 * switch, and the next emails planned for it. A document switch can only turn the emails OFF (the server ignores an ON
 * switch for these kinds); it is stored like the invoice / estimate switch (setReminderOverride, reminder_overrides).
 *
 *   loadWarrantyEmailContext(documentId, clientId)   settings + switches (throws RemindersUnavailableError before the migration)
 *   warrantyEmailPlan(ctx, facts, now)               { off: why nothing goes out | null, next: steps }
 */
import { supabase } from '../supabase.ts';
import { loadReminderBasics, setReminderOverride, type ReminderBasics } from '../reminders.ts';
import { loadPostJobSettings } from './postJobSettings.ts';
import {
    nextPostJobSteps, postJobOff, type PostJobFacts, type PostJobOff, type PostJobSettings, type PostJobStep,
} from '../../supabase/functions/reminders/shared/postjob.ts';
import { OVERRIDE_SELECT, indexOverrides, overridesFor, type OverrideRow } from '../../supabase/functions/reminders/shared/targets.ts';
import { browserTimezone } from '../reminders.ts';

export interface WarrantyEmailContext {
    basics: ReminderBasics;
    settings: PostJobSettings;
    documentOff: boolean;
    clientOff: boolean;
}

export async function loadWarrantyEmailContext(documentId: string | null | undefined, clientId: string | null | undefined): Promise<WarrantyEmailContext> {
    const [basics, settings] = await Promise.all([loadReminderBasics(), loadPostJobSettings()]);
    let rows: OverrideRow[] = [];
    if (documentId || clientId) {
        const ors = [documentId ? `document_id.eq.${documentId}` : '', clientId ? `client_id.eq.${clientId}` : ''].filter(Boolean).join(',');
        const { data, error } = await supabase.from('reminder_overrides').select(OVERRIDE_SELECT).or(ors);
        if (error) throw error;
        rows = (data as OverrideRow[] | null) ?? [];
    }
    const o = overridesFor(indexOverrides(rows), { documentId, clientId });
    return { basics, settings, documentOff: !!o.document && !o.document.enabled, clientOff: !!o.client && !o.client.enabled };
}

/** Turns the emails of this warranty off (true) or back to the account setting (false: the switch is removed). */
export const setWarrantyEmailsOff = (documentId: string, off: boolean) => setReminderOverride({ documentId }, off ? false : null);

export interface WarrantyEmailPlan {
    off: PostJobOff | null;
    next: PostJobStep[];
}

/** Why nothing goes out (null = emails are planned) and the next step per person, as the server will plan them. */
export function warrantyEmailPlan(ctx: WarrantyEmailContext, facts: PostJobFacts, now: Date = new Date()): WarrantyEmailPlan {
    const s = ctx.basics.settings;
    const base = { enabled: s.enabled, sendHour: s.sendHour, timezone: ctx.basics.saved ? s.timezone : browserTimezone() };
    const input = {
        facts, base, settings: ctx.settings, paid: ctx.basics.paid, now,
        overrides: {
            document: ctx.documentOff ? { enabled: false, updatedAt: null } : null,
            job: null,
            client: ctx.clientOff ? { enabled: false, updatedAt: null } : null,
        },
    };
    const off = postJobOff(input);
    return { off, next: off ? [] : nextPostJobSteps(input) };
}
