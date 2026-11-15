/**
 * After-the-job emails (D10): settings for the three reminder kinds 'completion', 'warranty', 'maintenance'.
 *
 * Stored in the account (public.user_settings 'reminders.postjob', through lib/userData.ts like the other account
 * settings) and read by the reminders server. The reminders master switch, send hour, time zone and Gmail account
 * are the existing reminder settings (lib/reminders.ts loadReminderBasics / saveReminderSettings): unchanged.
 * All three are off by default and need a paid plan (ReminderBasics.paid). Turning one on with setPostJobEnabled()
 * records the day (`since`): only jobs completed / warranty steps from that day on are emailed.
 *
 * Usage (UI): const s = await loadPostJobSettings(); const next = setPostJobEnabled(s, 'completion', true, todayYmd, Date.now());
 *             await savePostJobSettings(next)  // 'account' = saved; 'offline' / 'failed' = kept on this device, retried
 */
import { loadPostJobSetting, savePostJobSetting, type SyncMode } from '../userData.ts';
import {
    buildPostJobValues, defaultPostJobSettings, parsePostJobSettings, renderPostJob, type PostJobSettings, type PostJobTemplateKey,
} from '../../supabase/functions/reminders/shared/postjob.ts';
import { addDays } from '../../supabase/functions/reminders/shared/schedule.ts';

export {
    DEFAULT_MAINTENANCE_TIP, POST_JOB_DEFAULT_OFFSETS, POST_JOB_KINDS, POST_JOB_PLACEHOLDER_HELP, POST_JOB_RULES, POST_JOB_SETTING,
    POST_JOB_TEMPLATE_KEYS, POST_JOB_TEMPLATE_PLACEHOLDERS, POST_JOB_TEMPLATE_TITLES, POST_JOB_TEMPLATES,
    buildPostJobValues, completionDay, decidePostJob, defaultPostJobSettings, durationText, isPostJobKind, newerPostJobSettings,
    nextPostJobSteps, normalizePostJobOffsets, parsePostJobSettings, planPostJobSteps, postJobDedupeKey, postJobOff, postJobStepKey,
    postJobStepLabel, renderPostJob, resolvePostJobTemplate, setCompletionReview, setMaintenanceTip, setPostJobEnabled,
    setPostJobOffsets, setPostJobTemplate, setWarrantyOwner, whenText,
} from '../../supabase/functions/reminders/shared/postjob.ts';

/** The account's after-the-job settings (this device's copy when offline; defaults when none). Never throws. */
export async function loadPostJobSettings(): Promise<PostJobSettings> {
    try {
        return parsePostJobSettings(await loadPostJobSetting());
    } catch {
        return defaultPostJobSettings();
    }
}

/** Saves them (device copy at once, account when reachable). The server reads only the account copy. */
export const savePostJobSettings = (s: PostJobSettings): Promise<SyncMode> => savePostJobSetting(parsePostJobSettings(s));

/** A sample email for the settings preview ("what the client will get"), with the user's wording. */
export function previewPostJobEmail(
    s: PostJobSettings,
    key: PostJobTemplateKey,
    sample: { today: string; clientName?: string; jobName?: string; company?: string; myName?: string; reviewLink?: string; number?: string },
) {
    const offset = key === 'completion' ? s.completion.offsets[0] ?? 3
        : key === 'maintenance' ? s.maintenance.offsets[0] ?? 180
        : key === 'warranty_owner' ? s.warranty.ownerOffsets[0] ?? 30 : s.warranty.offsets[0] ?? 30;
    const warranty = key === 'warranty_client' || key === 'warranty_owner';
    const anchor = warranty ? addDays(sample.today, offset) : addDays(sample.today, -offset);
    const values = buildPostJobValues({
        templateKey: key, stepDate: sample.today, anchor, offset,
        clientName: sample.clientName ?? 'Alex', jobName: sample.jobName ?? 'the kitchen remodel', company: sample.company, myName: sample.myName,
        reviewLink: key === 'completion' && s.completion.includeReview ? sample.reviewLink : null,
        link: 'https://example.com/your-warranty', number: sample.number ?? 'WAR-1001', openClaims: 0, clientEmailed: true,
        tip: s.maintenance.tip,
    });
    return renderPostJob(s, key, values);
}
