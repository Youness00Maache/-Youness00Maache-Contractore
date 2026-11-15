/**
 * Shared bits of the job Subs tab: the guards every write goes through (Premium, connection, errors) and "Copy sub link".
 * A sub's link IS the crew link (lib/crew): the copy code is the same, only the message that goes with it differs.
 */
import { NEEDS_CONNECTION, isBrowserOffline } from '../../lib/offline/connection.ts';
import { describeError } from '../../lib/account.ts';
import { loadCrewData } from '../../lib/crew/crewApi.ts';
import { crewLinkUrl } from '../../lib/crew/crewLogic.ts';
import { subInviteText } from '../../lib/subs/subView.ts';
import { copyToClipboard } from '../../utils/clientLinks.ts';

export interface SubsGuards {
    paid: boolean;
    isOnline: boolean;
    /** true when the plan allows the change; otherwise it opens the upgrade prompt */
    needPremium: () => boolean;
    /** true when there is a connection; otherwise it says so */
    needOnline: () => boolean;
    /** shows a readable error (or the upgrade prompt for a plan limit) */
    fail: (e: unknown, fallback: string) => void;
    onUpgrade: (reason?: string) => void;
}

export interface CopyLinkResult { ok: boolean; message: string }

/** Copies the sub's crew link with a short message to send with it. Never throws. */
export async function copySubLink(args: { memberId: string; memberName: string; company: string }): Promise<CopyLinkResult> {
    if (isBrowserOffline()) return { ok: false, message: NEEDS_CONNECTION };
    try {
        const data = await loadCrewData();
        const token = data.links[args.memberId];
        if (!token) return { ok: false, message: 'This sub’s link is off. On the Crew screen, tap Share link to make a new one.' };
        const url = crewLinkUrl(window.location.origin, token);
        const copied = await copyToClipboard(subInviteText(args.memberName, args.company, url));
        return copied
            ? { ok: true, message: 'Sub link copied. Send it to them by text or email.' }
            : { ok: false, message: 'Copying is blocked by your browser. Open the Crew screen to copy the link.' };
    } catch (e) {
        return { ok: false, message: describeError(e, 'The link could not be copied.') };
    }
}
