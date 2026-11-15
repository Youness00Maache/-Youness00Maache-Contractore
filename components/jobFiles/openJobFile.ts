/**
 * Open or download a job file / link in a new tab. A file is a signed link that is made first (a moment), so the tab is
 * opened straight away (phones block a tab opened after the wait) and pointed at the link when it is ready.
 */
import { jobFileUrl } from '../../lib/jobFiles/jobFilesApi.ts';
import type { JobFile } from '../../lib/jobFiles/jobFileTypes.ts';

/** true = opened; false = the link could not be made (the caller says so). */
export async function openJobFile(file: JobFile, opts: { download?: boolean } = {}): Promise<boolean> {
    if (file.kind === 'link') {
        if (!file.url) return false;
        window.open(file.url, '_blank', 'noopener,noreferrer');
        return true;
    }
    const tab = window.open('', '_blank');
    try {
        const url = await jobFileUrl(file, { download: opts.download });
        if (!url) { tab?.close(); return false; }
        if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
        return true;
    } catch {
        tab?.close();
        return false;
    }
}
