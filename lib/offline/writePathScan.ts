/**
 * Finds every place in the app's code that writes to the account (database insert / update / upsert / delete, write
 * RPCs, storage uploads / removals / copies, edge functions). scripts/offline-drafts-check.ts runs it over the source
 * and checks each hit against the audit table (lib/offline/writePathAudit.ts), so a new write path can't ship without
 * saying what it does offline. Text only: no imports, no file access (the script reads the files).
 */

export interface WriteHit {
    file: string;
    line: number;
    text: string;
    kind: 'db' | 'rpc' | 'storage' | 'function';
}

/** RPCs that only read (not write paths). */
export const READ_ONLY_RPCS = new Set([
    'get_photo_usage', 'get_my_usage', 'get_portal_data', 'get_portal_photos', 'get_document_by_token', 'get_request_page',
    'get_my_request_page', 'reminders_config',
    // crew clock-in links and field features: stable functions that only read
    'crew_links', 'get_portal_punch_list', 'get_portal_credentials', 'get_portal_service_plans',
    // client portal project dashboard (D9, 20261116000300): stable, read-only
    'get_portal_project_dashboard',
    // client portal questions / submittals + shared job files (D3, 20261116000400): stable, read-only
    'get_portal_questions', 'get_portal_job_files',
    // client portal selections + shared mood boards (D5, 20261116000600): stable, read-only
    'get_portal_selections', 'get_portal_boards',
    // crew link: the sub's commitments (D7, 20261116000800): reads only (volatile just for the link's rate-limit log)
    'crew_sub_get',
    // client feedback link + public profile extras + the owner's profile read (D8, 20261116001000); the owner read
    // creates the request page on first use like get_my_request_page
    'get_feedback_request', 'get_public_profile_extras', 'get_my_request_profile',
]);

const DB_WRITE = /\.(insert|update|upsert|delete)\(/;
const NOT_DB = /\b(listeners|cache|timers|inflight|next|prev|selected|seen|map|set|ids|unsent|chains|loaded|inFlightKeys|slotListeners|used|dataUrlCache|fontCssCache|notificationStore|form|requested|deviceUrlIds|store|os|tx|keep|byId|out|gone|pending|added|registry|doneHashes)\.(delete|update)\(/;

/** The write calls in one source file. */
export const scanWrites = (file: string, source: string): WriteHit[] => {
    const lines = source.split(/\r?\n/);
    const hits: WriteHit[] = [];
    const context = (i: number, back: number) => lines.slice(Math.max(0, i - back), i + 1).join('\n');
    lines.forEach((raw, i) => {
        const text = raw.trim();
        if (!text || text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) return;
        const add = (kind: WriteHit['kind']) => hits.push({ file, line: i + 1, text, kind });
        // edge functions
        if (/functions\.invoke\s*(<[^>]*>)?\(/.test(text) || (/\binvokeFunction\s*(<[^>]*>)?\(/.test(text) && !/function invokeFunction/.test(text))) { add('function'); return; }
        // RPCs (write ones)
        const rpc = /\.rpc\(\s*['"`]([a-z_]+)['"`]/.exec(text) || (/\.rpc\(\s*[a-zA-Z_.]+/.test(text) ? [text, '?'] : null);
        if (rpc) { if (!READ_ONLY_RPCS.has(rpc[1])) add('rpc'); return; }
        // storage writes
        if (/\.(upload|copy)\(/.test(text) && /storage|bucket/i.test(context(i, 3))) { add('storage'); return; }
        if (/\.remove\(\s*[[a-zA-Z]/.test(text) && /storage/.test(context(i, 2))) { add('storage'); return; }
        // database writes (the chain may start a few lines above)
        if (DB_WRITE.test(text) && !NOT_DB.test(text) && /supabase|\.from\(['"`][a-z_]+['"`]\)|\bfrom\(table\)/.test(context(i, 4))) add('db');
    });
    return hits;
};
