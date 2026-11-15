/**
 * The sub's side of the crew link (/clock/<token>, no login): the two public RPCs of migration
 * 20261116000800_subs_quotes.sql. Same errors as the crew task calls (lib/tasks/tasksPublicApi.ts): CrewSendError kinds
 * 'invalid_link', 'paused', 'network', 'rate_limit', 'unavailable', 'rejected', 'unknown' (lib/crew/punchQueue.ts).
 *
 *   fetchSubCommitments(token)          SubLinkView  { available, serverNow, member, commitments: SubLinkCommitment[] }
 *        available === false (SUB_LINK_MISSING) when the functions are not in the database yet: show the crew link
 *        EXACTLY as today (no sub section). Never throws for that case. The sub's tasks still come from
 *        fetchCrewTasks (lib/tasks/tasksPublicApi.ts).
 *   acceptSubCommitment(token, commitmentId, name)   SubLinkCommitment (status 'accepted', acceptedAt, acceptedBy)
 *        throws CrewSendError; isAlreadyAccepted(err) = it was accepted before (reload the view);
 *        kind 'unavailable' when the functions are missing.
 */
import { supabase } from '../supabase.ts';
import { classifyCrewError } from '../crew/crewLogic.ts';
import { CrewSendError } from '../crew/punchQueue.ts';
import { crewAnswerError } from '../tasks/taskRows.ts';
import { SUB_LINK_MISSING, mapSubLinkCommitment, mapSubLinkView } from './subLogic.ts';
import type { SubLinkCommitment, SubLinkView } from './subTypes.ts';

const toSendError = (error: unknown): CrewSendError => {
    if (error instanceof CrewSendError) return error;
    const text = String((error as { message?: unknown } | null)?.message ?? error ?? '');
    if (/ALREADY_ACCEPTED/i.test(text)) return new CrewSendError('rejected', 'ALREADY_ACCEPTED: This was already accepted.');
    const c = classifyCrewError(error as any);
    const kind = c.kind === 'premium' ? 'paused' : c.kind;
    return new CrewSendError(kind, c.message);
};

const answerError = (data: unknown): CrewSendError | null => {
    const e = crewAnswerError(data);
    if (e === 'invalid_link') return new CrewSendError('invalid_link', 'This link is not valid anymore. Ask your contact for a new one.');
    if (e === 'paused') return new CrewSendError('paused', 'This page is paused for this company right now. Ask your contact.');
    return null;
};

/** The acceptance failed because it was already accepted (show the current state instead of an error). */
export const isAlreadyAccepted = (e: unknown): boolean => e instanceof CrewSendError && /ALREADY_ACCEPTED/.test(e.message);

export async function fetchSubCommitments(token: string): Promise<SubLinkView> {
    let res;
    try {
        res = await supabase.rpc('crew_sub_get', { p_token: token });
    } catch (e) {
        const err = toSendError(e);
        if (err.kind === 'unavailable') return SUB_LINK_MISSING;
        throw err;
    }
    if (res.error) {
        const err = toSendError(res.error);
        if (err.kind === 'unavailable') return SUB_LINK_MISSING;
        throw err;
    }
    const bad = answerError(res.data);
    if (bad) throw bad;
    return mapSubLinkView(res.data);
}

export async function acceptSubCommitment(token: string, commitmentId: string, name: string): Promise<SubLinkCommitment> {
    let res;
    try {
        res = await supabase.rpc('crew_sub_accept', { p_token: token, p_commitment_id: commitmentId, p_name: (name || '').trim() || null });
    } catch (e) {
        throw toSendError(e);
    }
    if (res.error) throw toSendError(res.error);
    const bad = answerError(res.data);
    if (bad) throw bad;
    const out = mapSubLinkCommitment(res.data);
    if (!out) throw new CrewSendError('unknown', 'The acceptance could not be confirmed. Please try again.');
    return out;
}
