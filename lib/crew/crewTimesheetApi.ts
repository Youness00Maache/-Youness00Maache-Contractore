/**
 * Saves crew hours as Time Sheet documents (lib/crew/crewTimesheet.ts builds the data). Same record shape as a form
 * save, so the document shows on the job, in job costing, Insights and "Bill time & materials" right away.
 */
import { supabase } from '../supabase.ts';
import { FormType, type FormData as FormDataType, type Job, type UserProfile } from '../../types.ts';
import { describeError, isMissingColumnError, isPlanLimitError, planLimitMessage } from '../account.ts';
import { DOCUMENT_DETAIL_COLUMNS, assertFullDocument, mapDocumentRow, primeDocumentCache, stripLightweightFlag } from '../documents.ts';
import { newId, todayISO } from '../../components/forms/formUtils.ts';
import { crewTimeSheetData, updatedCrewTimeSheetData, type TimeSheetPlan } from './crewTimesheet.ts';
import { linkPunchesToTimesheet } from './crewApi.ts';
import type { OvertimeRule } from './crewLogic.ts';

export class CrewTimesheetLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CrewTimesheetLimitError';
    }
}

/**
 * Creates the time sheet of a plan, or updates the one its punches already belong to (if it still exists), then
 * points the punches at it. Returns the saved document.
 */
export async function saveCrewTimeSheet(args: {
    userId: string;
    job: Job & { clientId?: string | null };
    profile?: UserProfile | null;
    plan: TimeSheetPlan;
    rule: OvertimeRule;
}): Promise<{ doc: FormDataType; created: boolean }> {
    const nowIso = new Date().toISOString();
    if (args.plan.existingTimesheetId) {
        const { data: row, error } = await supabase.from('documents').select(DOCUMENT_DETAIL_COLUMNS).eq('id', args.plan.existingTimesheetId).maybeSingle();
        if (!error && row) {
            const current = mapDocumentRow(row, true);
            const next = updatedCrewTimeSheetData(stripLightweightFlag(current.data as unknown as Record<string, unknown>), args.plan, { rule: args.rule, nowIso });
            assertFullDocument({ data: next });
            const { error: upErr } = await supabase.from('documents').update({ data: next }).eq('id', current.id);
            if (upErr) throw new Error(describeError(upErr, 'The time sheet could not be updated.'));
            const doc = { ...current, data: next } as unknown as FormDataType;
            primeDocumentCache(doc);
            await linkPunchesToTimesheet(args.plan.punchIds, doc.id);
            return { doc, created: false };
        }
        // the old sheet was deleted: make a new one
    }
    const id = newId();
    const data = crewTimeSheetData(args.plan, args.job, args.profile, { rule: args.rule, today: todayISO(), nowIso });
    assertFullDocument({ data });
    const record: Record<string, unknown> = { id, user_id: args.userId, job_id: args.job.id, type: FormType.TimeSheet, data };
    if (args.job.clientId) record.client_id = args.job.clientId;
    let res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    if (res.error && 'client_id' in record && isMissingColumnError(res.error)) {
        delete record.client_id;
        res = await supabase.from('documents').insert(record).select('public_token, created_at').maybeSingle();
    }
    if (res.error) {
        if (isPlanLimitError(res.error)) throw new CrewTimesheetLimitError(planLimitMessage(res.error));
        throw new Error(describeError(res.error, 'The time sheet could not be created.'));
    }
    const saved = (res.data || {}) as { public_token?: string | null; created_at?: string | null };
    const doc = mapDocumentRow({ ...record, public_token: saved.public_token ?? null, created_at: saved.created_at ?? nowIso }, true);
    primeDocumentCache(doc);
    await linkPunchesToTimesheet(args.plan.punchIds, doc.id);
    return { doc, created: true };
}
