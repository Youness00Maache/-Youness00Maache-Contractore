/**
 * Open a quote's file (a signed link, made first: the tab is opened straight away because phones block a tab opened after
 * the wait) or its https link in a new tab. true = opened; false = it could not be opened (the caller says so).
 */
import { quoteFileUrl } from '../../lib/subs/subsApi.ts';
import type { JobQuote } from '../../lib/subs/subTypes.ts';

export async function openQuote(quote: Pick<JobQuote, 'filePath' | 'url'>, which: 'file' | 'link' | 'any' = 'any'): Promise<boolean> {
    const wantFile = which === 'file' || (which === 'any' && !!quote.filePath);
    if (!wantFile) {
        if (!quote.url) return false;
        window.open(quote.url, '_blank', 'noopener,noreferrer');
        return true;
    }
    if (!quote.filePath) return false;
    const tab = window.open('', '_blank');
    try {
        const url = await quoteFileUrl(quote.filePath);
        if (!url) { tab?.close(); return false; }
        if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
        return true;
    } catch {
        tab?.close();
        return false;
    }
}
