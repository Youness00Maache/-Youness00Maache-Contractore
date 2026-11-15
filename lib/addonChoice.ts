/**
 * The client chooses optional add-ons when signing an estimate (roadmap D13). Pure logic: no React, no Supabase, so the
 * client pages, the owner's form and scripts/addons-choice-check.ts share it.
 *
 * Optional add-on lines (lib/proposal.ts, N4) count in the money only when `selected` is true (utils/money.ts
 * isExcludedOptionalLine). On the approval link / portal the client ticks the add-ons they want; the signing call sends
 * the ticked line ids and the database (supabase/migrations/20261116000700_optional_addons_choice.sql,
 * _estimate_addon_patch) writes, in the same transaction as the signature:
 *   lineItems[i].selected = true for the chosen optional lines, false for the other optional lines (nothing else changes)
 *   clientAddonChoice     = { ids: [...], by: 'client', at: '<utc iso>', name: '<signer>' }
 * No money is computed in SQL: the total the client saw is documentTotals(applyAddonChoice(data, ids)), which is
 * exactly what every screen computes from the stored lines afterwards.
 *
 * applyAddonChoice() below is the JS mirror of that SQL patch (same line rule: optional flag + a string id of 1-100
 * characters). Documents without choosable add-ons are returned untouched (same object).
 */
import { isOptionalLine } from '../utils/money.ts';

type Rec = Record<string, any>;

/** Most add-ons one signing call may choose (the SQL refuses more). */
export const ADDON_CHOICE_MAX = 50;

/** New signing functions of the migration (tried first). */
export const ADDON_SIGN_RPC = { portal: 'sign_document_addons_via_portal', token: 'approve_document_addons_by_token' } as const;

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const linesOf = (d: unknown): unknown[] => (Array.isArray(rec(d).lineItems) ? rec(d).lineItems : []);

/** A line id the database can match: a string of 1-100 characters (the SQL uses the same test). */
export const isAddonId = (id: unknown): id is string => typeof id === 'string' && id.length >= 1 && id.length <= 100;

/** An optional add-on line the client can tick (it has a usable id). */
export const isChoosableAddon = (li: unknown): boolean =>
    !!li && typeof li === 'object' && !Array.isArray(li) && isOptionalLine(li as never) && isAddonId((li as Rec).id);

const isSigned = (d: Rec) => Boolean(str(d.clientSignatureUrl) || str(d.clientSignedAt));

/**
 * Good/better/best options that are still open (not applied). Same test as the SQL (an `options` array of 2 or more and
 * no `appliedId`): add-ons are not chosen online on such an estimate (the option choice replaces its lines).
 */
export const hasOpenOptions = (d: unknown): boolean => {
    let set: unknown = rec(d).estimateOptions;
    if (typeof set === 'string') { try { set = JSON.parse(set); } catch { set = null; } }
    const s = rec(set);
    return Array.isArray(s.options) && s.options.length >= 2 && !str(s.appliedId);
};

/**
 * Add-on lines the client can choose from on a client page: an Estimate, not signed, no open options, with optional
 * lines that have ids. [] otherwise (the page then shows add-ons exactly as before).
 */
export const choosableAddons = (type: string, data: unknown): Rec[] => {
    const d = rec(data);
    if (type !== 'Estimate' || isSigned(d) || hasOpenOptions(d)) return [];
    return linesOf(d).filter(isChoosableAddon) as Rec[];
};

/** The add-ons ticked when the page opens: the ones the contractor already switched on. */
export const defaultAddonPicks = (type: string, data: unknown): string[] =>
    uniqueIds(choosableAddons(type, data).filter(li => (li.selected === true || str(li.selected).toLowerCase() === 'true')).map(li => li.id));

const uniqueIds = (ids: unknown[]): string[] => {
    const out: string[] = [];
    for (const id of ids) if (isAddonId(id) && !out.includes(id)) out.push(id);
    return out;
};

/** Picks cleaned against the document: only choosable add-on ids, no duplicates, at most ADDON_CHOICE_MAX. */
export const cleanAddonPicks = (type: string, data: unknown, picks: unknown[] | null | undefined): string[] => {
    const allowed = new Set(choosableAddons(type, data).map(li => li.id as string));
    return uniqueIds(Array.isArray(picks) ? picks : []).filter(id => allowed.has(id)).slice(0, ADDON_CHOICE_MAX);
};

/** Toggles one add-on in a pick list. */
export const toggleAddonPick = (picks: string[], id: string, on: boolean): string[] =>
    on ? (picks.includes(id) ? picks : [...picks, id]) : picks.filter(x => x !== id);

/**
 * JS mirror of the SQL patch: every choosable optional line gets selected = (its id is picked); other lines unchanged.
 * Returns the same object when the document has no choosable add-on line.
 */
export const applyAddonChoice = <T,>(data: T, picks: readonly string[]): T => {
    const lines = linesOf(data);
    if (!lines.some(isChoosableAddon)) return data;
    const set = new Set(picks);
    return {
        ...(data as Rec),
        lineItems: lines.map(li => (isChoosableAddon(li) ? { ...(li as Rec), selected: set.has((li as Rec).id) } : li)),
    } as T;
};

export interface ClientAddonChoice { ids: string[]; at: string; name: string }

/** What the client chose when signing (stored by the database), null when there is none or the document isn't signed. */
export const clientAddonChoiceOf = (data: unknown): ClientAddonChoice | null => {
    const d = rec(data);
    if (!isSigned(d)) return null;
    let raw: unknown = d.clientAddonChoice;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = null; } }
    const c = rec(raw);
    if (!Array.isArray(c.ids)) return null;
    return { ids: uniqueIds(c.ids), at: str(c.at), name: str(c.name) };
};

/** Signing call plan: the new function (with the picks) first, the existing one when the database doesn't have it yet. */
export interface AddonSigningPlan {
    rpc: { name: typeof ADDON_SIGN_RPC[keyof typeof ADDON_SIGN_RPC]; args: Rec };
    fallback: { name: 'sign_document_via_portal' | 'approve_document_by_token'; args: Rec };
}

export const planAddonSigning = (
    target: { portalKey: string; documentId: string } | { token: string },
    picks: readonly string[],
    signerName: string,
    signature: string,
): AddonSigningPlan => {
    const ids = uniqueIds([...picks]).slice(0, ADDON_CHOICE_MAX);
    if ('token' in target) {
        return {
            rpc: { name: ADDON_SIGN_RPC.token, args: { doc_token: target.token, p_addon_ids: ids, p_signature: signature, p_signer_name: str(signerName) } },
            fallback: { name: 'approve_document_by_token', args: { doc_token: target.token, p_signature: signature } },
        };
    }
    return {
        rpc: { name: ADDON_SIGN_RPC.portal, args: { p_key: target.portalKey, p_doc_id: target.documentId, p_addon_ids: ids, p_signature: signature, p_signer_name: str(signerName) } },
        fallback: { name: 'sign_document_via_portal', args: { p_key: target.portalKey, p_doc_id: target.documentId, p_signature: signature } },
    };
};
