import type { Client, FormData } from '../types.ts';

export type MentionKind = 'client' | 'document';

export interface ResolvedMention {
    tag: string;
    id: string;
    name: string;
    kind: MentionKind;
}

export interface MentionOption {
    kind: MentionKind;
    id: string;
    name: string;
    label: string;
    /** secondary text in the dropdown (email, job, …) */
    detail?: string;
}

/** Human label of a document, e.g. "Invoice #INV-002". */
export function getFormLabel(form: FormData): string {
    const data = (form.data || {}) as unknown as Record<string, unknown>;
    const num = data.invoiceNumber || data.estimateNumber || data.workOrderNumber || data.changeOrderNumber
        || data.poNumber || data.receiptNumber || data.reportNumber || data.warrantyNumber;
    if (num) return `${form.type} #${num}`;
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : '';
    return title && title !== form.type ? `${form.type}: ${title}` : form.type;
}

/** Tag-safe version of a name: no spaces, apostrophes, accents or '#' ("O'Brien Homes" → "OBrienHomes"). */
export function toMentionTag(trigger: '@' | '#', name: string): string {
    const safe = name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '');
    return `${trigger}${safe || 'item'}`;
}

/** Removes any "[System Context: ...]" the user typed (only the app may add context). */
export function stripSystemContext(text: string): string {
    return text.replace(/\[\s*System Context:[^\]]*\]/gi, '').replace(/^\s*User Prompt:\s*"?/i, '').replace(/"\s*$/, '').trim();
}

const TAG_RE = /([@#])([\w.-]+)/g;

/**
 * Resolves the mentions present in the text. Mentions picked from the dropdown always win;
 * typed tags are resolved only when exactly ONE record matches (never the "first fuzzy match").
 */
export function resolveMentionsInText(
    text: string,
    resolvedMentions: ResolvedMention[],
    clients: Client[],
    forms: FormData[],
): ResolvedMention[] {
    const out: ResolvedMention[] = [];
    const seen = new Set<string>();
    for (const match of text.matchAll(TAG_RE)) {
        const tag = match[0];
        const trigger = match[1] as '@' | '#';
        const kind: MentionKind = trigger === '@' ? 'client' : 'document';
        const picked = resolvedMentions.find(m => m.tag === tag && m.kind === kind);
        let resolved: ResolvedMention | undefined = picked;
        if (!resolved) {
            const wanted = tag.toLowerCase();
            if (kind === 'client') {
                const matches = clients.filter(c => toMentionTag('@', c.name).toLowerCase() === wanted);
                if (matches.length === 1) resolved = { tag, id: matches[0].id, name: matches[0].name, kind };
            } else {
                const matches = forms.filter(f => toMentionTag('#', getFormLabel(f)).toLowerCase() === wanted
                    || toMentionTag('#', String(getFormLabel(f).split('#')[1] || '')).toLowerCase() === wanted);
                if (matches.length === 1) resolved = { tag, id: matches[0].id, name: getFormLabel(matches[0]), kind };
            }
        }
        if (resolved && !seen.has(`${resolved.kind}:${resolved.id}`)) {
            seen.add(`${resolved.kind}:${resolved.id}`);
            out.push(resolved);
        }
    }
    return out;
}

/**
 * Legacy text form of the resolved mentions (kept for compatibility and tests). The router now
 * receives mentions as structured data; this string is never shown to the user.
 */
export function buildEnrichedPrompt(
    trimmedInput: string,
    resolvedMentions: ResolvedMention[],
    clients: Client[],
    forms: FormData[],
): string {
    const clean = stripSystemContext(trimmedInput);
    const mentions = resolveMentionsInText(clean, resolvedMentions, clients, forms);
    if (!mentions.length) return clean;
    const parts = mentions.map(m => {
        if (m.kind === 'client') {
            const client = clients.find(c => c.id === m.id);
            return `ClientID: ${m.id} (${m.name})${client?.address ? `, ClientAddress: ${client.address}` : ''}`;
        }
        return `DocID: ${m.id} (${m.name})`;
    });
    return `[System Context: ${parts.join(', ')}]\nUser Prompt: "${clean}"`;
}

export function filterMentionOptions(
    trigger: '@' | '#',
    search: string,
    clients: Client[],
    forms: FormData[],
    jobId?: string,
): MentionOption[] {
    const q = search.toLowerCase().replace(/[^\w]+/g, '');
    const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '');
    if (trigger === '@') {
        return clients
            .filter(c => !q || norm(c.name).includes(q))
            .slice(0, 8)
            .map(c => ({ kind: 'client' as const, id: c.id, name: c.name, label: c.name, detail: c.email || c.address || undefined }));
    }
    const pool = jobId ? forms.filter(f => f.jobId === jobId) : forms;
    return pool
        .map(f => ({ f, label: getFormLabel(f) }))
        .filter(({ label }) => !q || norm(label).includes(q))
        .slice(0, 8)
        .map(({ f, label }) => ({
            kind: 'document' as const,
            id: f.id,
            name: label,
            label,
            detail: String((f.data as unknown as Record<string, unknown>)?.clientName || '') || undefined,
        }));
}

export function detectMentionTrigger(textBeforeCursor: string): { trigger: '@' | '#'; search: string } | null {
    const match = textBeforeCursor.match(/(?:^|\s)([@#])([\w.'-]*)$/);
    if (!match) return null;
    return { trigger: match[1] as '@' | '#', search: match[2] };
}

/**
 * Replaces the "@partial" before the cursor with a unique, tag-safe mention.
 * Two different records with the same name get distinct tags (@JohnSmith, @JohnSmith2).
 */
export function insertMention(
    inputText: string,
    cursor: number,
    trigger: '@' | '#',
    option: MentionOption,
    existing: ResolvedMention[] = [],
): { newText: string; tag: string; resolved: ResolvedMention; cursor: number } {
    const before = inputText.substring(0, cursor);
    const after = inputText.substring(cursor);
    const match = before.match(/(?:^|\s)([@#])([\w.'-]*)$/);
    const kind: MentionKind = trigger === '@' ? 'client' : 'document';
    if (!match || match.index === undefined) {
        return { newText: inputText, tag: '', resolved: { tag: '', id: '', name: '', kind }, cursor };
    }
    const start = match.index + (match[0].startsWith(' ') || match[0].startsWith('\n') || match[0].startsWith('\t') ? 1 : 0);
    const base = toMentionTag(trigger, option.kind === 'document' ? option.label.replace(/#/g, '') : option.name);
    let tag = base;
    let n = 2;
    while (existing.some(m => m.tag === tag && m.id !== option.id)) tag = `${base}${n++}`;
    const insert = `${tag} `;
    const newText = inputText.substring(0, start) + insert + after.replace(/^\s+/, '');
    return {
        newText,
        tag,
        resolved: { tag, id: option.id, name: option.name, kind: option.kind },
        cursor: start + insert.length,
    };
}
