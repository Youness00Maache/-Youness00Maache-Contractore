/**
 * The next after-the-job emails for already-loaded jobs / warranties, pure (no Supabase): planned with the SAME code the
 * reminders server uses (nextPostJobSteps). lib/warranty/postJobUpcoming.ts loads the data; scripts/warranty-check.ts
 * runs this.
 */
import {
    nextPostJobSteps, postJobStepLabel, setPostJobEnabled,
    type PostJobFacts, type PostJobKind, type PostJobSettings, type PostJobStep,
} from '../../supabase/functions/reminders/shared/postjob.ts';
import type { ReminderSettings, TargetOverrides } from '../../supabase/functions/reminders/shared/schedule.ts';

export interface UpcomingEmail {
    key: string;
    date: string;
    audience: 'client' | 'owner';
    kind: PostJobKind;
    /** "3 days after the job", "30 days before it ends" */
    label: string;
    client: string;
    job: string;
    targetId: string;
}

export interface UpcomingResult {
    items: UpcomingEmail[];
    /** true when the kind is still off: the list shows what WOULD go out if it were switched on today */
    preview: boolean;
}

export type UpcomingBase = Pick<ReminderSettings, 'enabled' | 'sendHour' | 'timezone'> & { paid: boolean };

export interface UpcomingTarget {
    facts: PostJobFacts;
    client: string;
    job: string;
    overrides: TargetOverrides;
}

const asEmail = (kind: PostJobKind, step: PostJobStep, targetId: string, client: string, job: string): UpcomingEmail => ({
    key: `${kind}:${targetId}:${step.stepKey}:${step.date}`,
    date: step.date,
    audience: step.audience,
    kind,
    label: postJobStepLabel(kind, step.offset),
    client,
    job,
    targetId,
});

/** The next emails (soonest first), at most `limit`. A kind that is off is planned as if it were switched on today. */
export function planUpcoming(
    kind: PostJobKind,
    settings: PostJobSettings,
    base: UpcomingBase,
    today: string,
    now: Date,
    targets: readonly UpcomingTarget[],
    limit = 5,
): UpcomingResult {
    const preview = !settings[kind].enabled;
    const effective = preview ? setPostJobEnabled(settings, kind, true, today, now.getTime()) : settings;
    const out: UpcomingEmail[] = [];
    for (const t of targets) {
        for (const step of nextPostJobSteps({ facts: t.facts, base, settings: effective, overrides: t.overrides, paid: base.paid, now })) {
            out.push(asEmail(kind, step, t.facts.id, t.client, t.job));
        }
    }
    out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.audience < b.audience ? -1 : a.audience > b.audience ? 1 : 0));
    return { items: out.slice(0, Math.max(1, limit)), preview };
}
