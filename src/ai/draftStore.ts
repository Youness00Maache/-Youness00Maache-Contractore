/**
 * One-shot registry for AI drafts (CORE-010 / DOC-005).
 * A prefill is applied once per `__draftId`; once a draft was auto-saved its id is "consumed", so
 * browser Back / refresh (which restore history.state) can never save it a second time.
 * Forms (hooks/useDocumentDraftPrefill.ts) call `isDraftConsumed` before an auto-save and
 * `markDraftConsumed` when they start it.
 */
// Same key CORE clears on logout (lib/account.ts).
const STORAGE_KEY = 'consumed_ai_drafts';
const memory = new Set<string>();

function read(): string[] {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export function markDraftConsumed(draftId: string | undefined | null): void {
    if (!draftId) return;
    memory.add(draftId);
    try {
        const next = [...read().filter(id => id !== draftId), draftId].slice(-100);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch { /* storage unavailable: the in-memory set still protects this tab */ }
}

export function isDraftConsumed(draftId: string | undefined | null): boolean {
    if (!draftId) return false;
    return memory.has(draftId) || read().includes(draftId);
}
