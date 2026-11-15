/**
 * Timeline source: client questions and submittals (lib/questions). Sent, answered, approved or turned down, closed.
 * Each step is read from the question's own history (written by the database); a question without history falls back
 * to its sent / answered / closed times. Client group. Pure.
 */
import type { JobQuestion } from '../../questions/questionTypes.ts';
import { clientWord, firstName, isoOf, makeEvent, plainText, safely, str } from '../timelineHelpers.ts';
import type { TimelineContext, TimelineEvent } from '../timelineTypes.ts';

interface Step { action: string; at: string; by: string; note: string }

const stepsOf = (q: JobQuestion): Step[] => {
    const fromHistory = (Array.isArray(q.history) ? q.history : [])
        .map(h => ({ action: str(h?.action), at: isoOf(h?.at) || '', by: str(h?.by), note: str(h?.note) }))
        .filter(s => s.at && ['sent', 'answered', 'approved', 'rejected', 'closed'].includes(s.action));
    if (fromHistory.length) return fromHistory;
    const out: Step[] = [];
    const sent = isoOf(q.sentAt);
    if (sent) out.push({ action: 'sent', at: sent, by: 'owner', note: '' });
    const answered = isoOf(q.answeredAt);
    if (answered) out.push({ action: q.decision === 'approved' ? 'approved' : q.decision === 'rejected' ? 'rejected' : 'answered', at: answered, by: 'client', note: str(q.answer) });
    const closed = isoOf(q.closedAt);
    if (closed) out.push({ action: 'closed', at: closed, by: 'owner', note: '' });
    return out;
};

export const questionEvents = ({ questions }: { questions: readonly JobQuestion[] }, ctx: TimelineContext): TimelineEvent[] => safely(() => {
    const out: TimelineEvent[] = [];
    const link = { type: 'tab' as const, tab: 'questions' as const };
    for (const q of questions) {
        const submittal = q.kind === 'submittal';
        const noun = submittal ? 'submittal' : 'question';
        const title = plainText(q.title, 70);
        const client = clientWord(null, ctx);
        const who = firstName(q.answeredBy) || client;
        for (const s of stepsOf(q)) {
            const id = `question:${q.id}:${s.action}:${s.at}`;
            if (s.action === 'sent') out.push(makeEvent({ id, at: s.at, kind: 'question_sent', source: 'questions', title: `${submittal ? 'Submittal' : 'Question'} sent to ${client}: “${title}”`, actor: 'you', link }));
            else if (s.action === 'answered') out.push(makeEvent({ id, at: s.at, kind: 'question_answered', source: 'questions', title: `${who} answered “${title}”`, detail: plainText(s.note || q.answer, 160) ? `“${plainText(s.note || q.answer, 160)}”` : undefined, actor: 'client', link }));
            else if (s.action === 'approved') out.push(makeEvent({ id, at: s.at, kind: 'question_decided', source: 'questions', title: `${who} approved the ${noun} “${title}”`, detail: plainText(s.note, 160) ? `“${plainText(s.note, 160)}”` : undefined, actor: 'client', link }));
            else if (s.action === 'rejected') out.push(makeEvent({ id, at: s.at, kind: 'question_decided', source: 'questions', title: `${who} did not approve the ${noun} “${title}”`, detail: plainText(s.note, 160) ? `“${plainText(s.note, 160)}”` : undefined, actor: 'client', link }));
            else if (s.action === 'closed') out.push(makeEvent({ id, at: s.at, kind: 'question_closed', source: 'questions', title: `${submittal ? 'Submittal' : 'Question'} closed: “${title}”`, actor: 'you', link }));
        }
    }
    return out;
});
