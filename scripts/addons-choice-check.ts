/**
 * Optional add-ons chosen by the client when signing (roadmap D13). No browser, no database:
 *   npx tsx scripts/addons-choice-check.ts
 * 1. SQL lint of supabase/migrations/20261116000700_optional_addons_choice.sql: exactly the listed functions, bodies
 *    open with `as $$`, security definer (except the trigger guard, like its original) + search_path '', bodies
 *    verbatim from their latest migration plus the marked additions, id validation, stock skip, privileges, no data change
 * 2. money: random estimates with/without add-ons and random chosen subsets: the total the client sees on the page
 *    (lib/addonChoice.ts applyAddonChoice) == the total computed from what the SQL stores (a TS mirror of
 *    _estimate_addon_patch), and every other total (portal, finance, export, reminders copy, invoice seed, cost, PDF)
 * 3. backwards compatibility: documents without add-ons are untouched; options estimates and signed ones are not choosable
 * 4. stock: the SQL rule (optional and not selected = no stock) == the app rule (isExcludedOptionalLine)
 * 5. app wiring + tolerance (new functions first, the existing ones when they don't exist yet)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeDocumentCost, computeDocumentTotals, countedLineItems, isExcludedOptionalLine, roundMoney, toNumber } from '../utils/money.ts';
import { computeTotals as remindersTotals } from '../supabase/functions/reminders/shared/money.ts';
import { documentTotals as portalTotals } from '../utils/clientPortalRules.ts';
import { documentTotals as financeTotals } from '../lib/finance.ts';
import { documentMoney } from '../lib/export/model.ts';
import {
    ADDON_CHOICE_MAX, applyAddonChoice, choosableAddons, cleanAddonPicks, clientAddonChoiceOf, defaultAddonPicks, hasOpenOptions,
    planAddonSigning, toggleAddonPick,
} from '../lib/addonChoice.ts';
import { buildInvoiceSeedFromEstimate, signedChangeProblem, signedContent } from '../components/forms/signedLock.ts';
import { computeMilestones } from '../lib/proposal.ts';
import { buildDocumentModel } from '../utils/templates/model.ts';
import { SAMPLE_JOB, SAMPLE_PROFILE } from '../utils/templates/sampleData.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f: string) => readFileSync(resolve(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: unknown, detail?: unknown) => { if (ok) passed++; else failures.push(`${name}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ''}`); };
const eq = (name: string, a: unknown, b: unknown) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });

// ---------------------------------------------------------------------------------------------------------------
// 1. SQL lint
// ---------------------------------------------------------------------------------------------------------------
const MIG = 'supabase/migrations/20261116000700_optional_addons_choice.sql';
const sql = read(MIG);
const code = sql.split('\n').filter(l => !/^\s*--/.test(l)).join('\n');

/** `create or replace function public.<name>(` … `\n$$;` */
const fnBlock = (src: string, name: string): string => {
    const start = src.indexOf(`create or replace function public.${name}(`);
    if (start < 0) return '';
    const end = src.indexOf('\n$$;', start);
    return end < 0 ? '' : src.slice(start, end + 4);
};
const head = (block: string) => block.slice(0, block.indexOf('\nas $$\n') + 1);
const body = (block: string) => block.slice(block.indexOf('\nas $$\n'));

const EXPECTED = ['_estimate_addon_patch', 'sign_document_addons_via_portal', 'approve_document_addons_by_token', 'guard_document_write', '_document_stock_lines'];
{
    const created = [...code.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_0-9]+)\s*\(/gi)].map(m => m[1]);
    eq('SQL: replaces / creates exactly the listed functions', created, EXPECTED);
    check('SQL: header says applied with the owner OK', sql.includes("Applied 2026-11-15 with the owner's OK"));
    for (const n of EXPECTED) check(`SQL header lists ${n}`, sql.split('\n').filter(l => l.startsWith('--')).some(l => l.includes(n)));
    check('SQL: header names where each replaced body came from',
        /guard_document_write\s+REPLACED, body = 20261114000100_estimate_options_choice\.sql/.test(sql)
        && /_document_stock_lines\s+REPLACED, body = 20261112000200_portal_forum_inventory\.sql/.test(sql));
    check('SQL: no existing signing function is redefined', !/function public\.(sign_document_via_portal|approve_document_by_token|sign_document_option_via_portal|approve_document_option_by_token|_apply_client_decision|_assert_document_open)\s*\(/.test(code));
    check('SQL: one migration file for D13', readdirSync(resolve(ROOT, 'supabase/migrations')).filter(f => /optional_addons_choice/.test(f)).length === 1);

    for (const n of EXPECTED) {
        const b = fnBlock(code, n);
        check(`SQL ${n}: found`, !!b);
        check(`SQL ${n}: body opens with "as $$"`, /\nas \$\$\n/.test(b) && b.trimEnd().endsWith('$$;'));
        check(`SQL ${n}: search_path = ''`, head(b).includes("set search_path = ''"));
        if (n === 'guard_document_write') check('SQL guard_document_write: NOT security definer (like the original: it reads current_user)', !/security definer/.test(head(b)));
        else check(`SQL ${n}: security definer`, /\nsecurity definer\n/.test(head(b)));
        // fully schema-qualified: no bare table / function names
        check(`SQL ${n}: tables schema-qualified`, !/\b(from|join|update|into)\s+(documents|clients|inventory|jobs)\b/i.test(body(b)));
        check(`SQL ${n}: helpers schema-qualified`, !/(?<![.\w])(_assert_document_open|_validate_signature|_clean_text|_apply_client_decision|_estimate_addon_patch|_client_document_ids|_try_uuid|_try_numeric|_document_stock_stage)\s*\(/.test(body(b)));
    }

    // --- verbatim bodies -------------------------------------------------------------------------------------
    const optSql = read('supabase/migrations/20261114000100_estimate_options_choice.sql');
    const invSql = read('supabase/migrations/20261112000200_portal_forum_inventory.sql');
    const guardNew = fnBlock(sql, 'guard_document_write')
        .replace("    -- add-ons: the client's add-on choice (clientAddonChoice) too\n", '')
        .replace(", 'clientOptionChoice', 'clientAddonChoice']", ", 'clientOptionChoice']")
        .replace("      -- add-ons: so did the add-on choice\n      new.data := new.data - 'clientAddonChoice';\n", '');
    eq('SQL guard_document_write = 20261114000100 version + the marked add-on lines only', guardNew, fnBlock(optSql, 'guard_document_write'));
    const stockNew = fnBlock(sql, '_document_stock_lines')
        .replace("      -- add-ons: an optional line the client / contractor did not take (selected not true) takes no stock\n      and not (lower(btrim(coalesce(li.value->>'optional', ''))) = 'true'\n               and lower(btrim(coalesce(li.value->>'selected', ''))) <> 'true')\n", '');
    eq('SQL _document_stock_lines = 20261112000200 version + the marked add-on lines only', stockNew, fnBlock(invSql, '_document_stock_lines'));
    check('SQL _document_stock_lines: skips optional lines not selected', /and not \(lower\(btrim\(coalesce\(li\.value->>'optional', ''\)\)\) = 'true'\s+and lower\(btrim\(coalesce\(li\.value->>'selected', ''\)\)\) <> 'true'\)/.test(fnBlock(sql, '_document_stock_lines')));
    // the two signing functions = the option ones with the add-on patch
    const asAddon = (b: string, kind: 'portal' | 'token') => b
        .replace(kind === 'portal' ? 'sign_document_option_via_portal(' : 'approve_document_option_by_token(', kind === 'portal' ? 'sign_document_addons_via_portal(' : 'approve_document_addons_by_token(')
        .replace('p_option_id text,', 'p_addon_ids text[],')
        .replace('_estimate_option_patch(v_doc, p_option_id, v_name)', '_estimate_addon_patch(v_doc, p_addon_ids, v_name)')
        .replace("jsonb_build_object('option_id', p_option_id)", "jsonb_build_object('addon_ids', v_patch -> 'clientAddonChoice' -> 'ids')");
    eq('SQL sign_document_addons_via_portal = sign_document_option_via_portal with the add-on patch', fnBlock(sql, 'sign_document_addons_via_portal'), asAddon(fnBlock(optSql, 'sign_document_option_via_portal'), 'portal'));
    eq('SQL approve_document_addons_by_token = approve_document_option_by_token with the add-on patch', fnBlock(sql, 'approve_document_addons_by_token'), asAddon(fnBlock(optSql, 'approve_document_option_by_token'), 'token'));

    // --- validation of the ids -------------------------------------------------------------------------------
    const patch = fnBlock(code, '_estimate_addon_patch');
    check('SQL patch: Estimate with lineItems only', patch.includes("p_doc.type <> 'Estimate' or coalesce(jsonb_typeof(v_lines), '') <> 'array'"));
    check('SQL patch: refuses open good/better/best options', patch.includes("jsonb_array_length(v_set -> 'options') >= 2 and coalesce(v_set ->> 'appliedId', '') = ''"));
    check('SQL patch: at most 50 ids', patch.includes(`coalesce(cardinality(p_addon_ids), 0) > ${ADDON_CHOICE_MAX}`));
    check('SQL patch: every id must be an optional line of this document', /where not exists \([\s\S]*?'optional'[\s\S]*?and l\.value ->> 'id' = x\.id\);\s*if v_bad > 0 then\s*raise exception/.test(patch));
    check('SQL patch: only selected flags change (other lines as stored)', patch.includes("then l.value || jsonb_build_object('selected', (l.value ->> 'id') = any (v_ids))") && patch.includes('else l.value end') && patch.includes('order by l.ord'));
    check('SQL patch: stores clientAddonChoice ids/by/at/name', /'clientAddonChoice', jsonb_strip_nulls\(jsonb_build_object\(\s*'ids', to_jsonb\(v_ids\),\s*'by', 'client',\s*'at',[\s\S]*?'name', p_signer_name\)\)/.test(patch));
    check('SQL patch: same line test everywhere (optional + string id 1-100)', (patch.match(/jsonb_typeof\(l\.value -> 'id'\) = 'string' and length\(l\.value ->> 'id'\) between 1 and 100/g) || []).length === 3);
    check('SQL patch: no money computed', !/quantity|rate|total|subtotal|tax/i.test(patch.replace(/--.*$/gm, '')));
    for (const n of ['sign_document_addons_via_portal', 'approve_document_addons_by_token']) {
        const b = fnBlock(code, n);
        check(`SQL ${n}: row locked, open-check before the patch, then the usual signature`,
            b.includes('for update') && b.indexOf('_assert_document_open(v_doc)') < b.indexOf('_estimate_addon_patch(') && b.indexOf('_estimate_addon_patch(') < b.indexOf('_apply_client_decision('));
        check(`SQL ${n}: validates the signature`, b.includes('perform public._validate_signature(p_signature);'));
    }
    check('SQL token: link used / expired checks kept', fnBlock(code, 'approve_document_addons_by_token').includes('approval_used_at is not null') && fnBlock(code, 'approve_document_addons_by_token').includes('approval_expires_at < now()'));

    // --- privileges / no data change ------------------------------------------------------------------------
    const grants = code.split('\n').filter(l => /^\s*(grant|revoke)\b/.test(l)).map(l => l.replace(/\s+/g, ' ').trim());
    for (const sig of ['_estimate_addon_patch(public.documents, text[], text)', 'guard_document_write()', '_document_stock_lines(uuid, text, jsonb)', 'sign_document_addons_via_portal(text, uuid, text[], text, text)', 'approve_document_addons_by_token(uuid, text[], text, text)'])
        check(`SQL revoke ${sig}`, grants.includes(`revoke all on function public.${sig} from public, anon, authenticated;`));
    eq('SQL grants: only the two signing functions, to anon + authenticated', grants.filter(g => g.startsWith('grant')), [
        'grant execute on function public.sign_document_addons_via_portal(text, uuid, text[], text, text) to anon, authenticated;',
        'grant execute on function public.approve_document_addons_by_token(uuid, text[], text, text) to anon, authenticated;',
    ]);
    check('SQL: no table / row change', !/\b(alter|drop|truncate)\s+(table|function|trigger)|\binsert\s+into\b|\bdelete\s+from\b|\bcreate\s+(table|trigger|index)\b/i.test(code));
    check('SQL: only the two signing functions update documents', (code.match(/update public\.documents/g) || []).length === 2);
    check('SQL: schema reload', code.includes("notify pgrst, 'reload schema';"));
    check('SQL: not applied by the app (no migration runner change)', !read('package.json').includes('20261116000700'));
}

// ---------------------------------------------------------------------------------------------------------------
// 2. money: page total == stored total, for random estimates and choices
// ---------------------------------------------------------------------------------------------------------------
/** TS mirror of public._estimate_addon_patch (validation + lineItems written). Throws like the SQL. */
const sqlTrue = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).trim().toLowerCase() === 'true';
const sqlIdOk = (li: any) => typeof li?.id === 'string' && li.id.length >= 1 && li.id.length <= 100;
const sqlOptional = (li: any) => !!li && typeof li === 'object' && !Array.isArray(li) && sqlTrue(li.optional) && sqlIdOk(li);
const sqlPatch = (type: string, data: any, ids: string[] | null) => {
    const lines = data.lineItems;
    if (type !== 'Estimate' || !Array.isArray(lines)) throw new Error('no add-ons');
    const set = data.estimateOptions;
    if (set && typeof set === 'object' && !Array.isArray(set) && Array.isArray(set.options) && set.options.length >= 2 && !String(set.appliedId ?? '')) throw new Error('options');
    if (!lines.some(sqlOptional)) throw new Error('no add-ons');
    if ((ids?.length ?? 0) > 50) throw new Error('too many');
    for (const id of ids ?? []) if (!lines.some((li: any) => sqlOptional(li) && li.id === id)) throw new Error('not an add-on');
    const chosen = [...new Set(ids ?? [])].sort();
    return { lineItems: lines.map((li: any) => (sqlOptional(li) ? { ...li, selected: chosen.includes(li.id) } : li)), clientAddonChoice: { ids: chosen, by: 'client', at: '2026-11-16T10:00:00.000Z', name: 'Jane Client' } };
};

let seed = 20261116;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const randomLine = (i: number) => {
    const li: Record<string, any> = { id: pick([`l-${i}`, `l-${i}`, `l-${i}`, '', undefined, 7]), description: `Line ${i}`, quantity: pick([1, 2, 3, 0.5, '4', 10]), rate: pick([0, 19.99, 100, 250.5, '75.25', 1234.56]), unitCost: pick([undefined, 5, 40.5]) };
    if (li.id === undefined) delete li.id;
    if (rnd() < 0.45) { li.optional = pick([true, true, 'true', ' TRUE ', false, 'false']); const s = pick([undefined, true, false, 'true', 'false']); if (s !== undefined) li.selected = s; }
    return li;
};
const randomEstimate = () => ({
    status: 'Sent', clientName: 'Jane Client', estimateNumber: 'EST-1',
    taxRate: pick([0, 8.25, 13, '6.5']), discount: pick([0, 0, 25, '10']),
    lineItems: Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, i) => randomLine(i)),
    ...(rnd() < 0.3 ? { proposal: { milestones: [{ id: 'm1', label: 'Deposit', kind: 'deposit', mode: 'percent', value: 30, due: '' }, { id: 'm2', label: 'Final', kind: 'final', mode: 'percent', value: 70, due: '' }] } } : {}),
});

{
    let runs = 0, choosable = 0, mismatch = 0, everyTotal = 0, rejected = 0, defaultsOk = 0, lockOk = 0, scheduleOk = 0;
    const firstBad: unknown[] = [];
    for (let n = 0; n < 1500; n++) {
        const data = randomEstimate();
        const lines = choosableAddons('Estimate', data);
        runs++;
        if (!lines.length) {
            // no add-on to choose: the page data is the stored data, untouched
            if (applyAddonChoice(data, ['l-0']) !== data) { mismatch++; firstBad.push({ n, why: 'touched' }); }
            continue;
        }
        choosable++;
        const raw = [...lines.map(l => l.id as string).filter(() => rnd() < 0.5), ...(rnd() < 0.2 ? ['not-a-line'] : [])];
        const picks = cleanAddonPicks('Estimate', data, raw);
        const page = applyAddonChoice(data, picks);
        const shown = portalTotals(page).total;
        let stored: any;
        try { stored = { ...data, ...sqlPatch('Estimate', data, picks), clientSignatureUrl: 'data:image/png;base64,AA', clientSignedAt: '2026-11-16T10:00:00.000Z', status: 'Accepted' }; }
        catch (e) { mismatch++; firstBad.push({ n, why: String(e) }); continue; }
        const after = computeDocumentTotals(stored).total;
        if (Math.abs(shown - after) > 0.0001) { mismatch++; firstBad.push({ n, shown, after, picks }); }
        // every total in the app uses the same rule
        const inv = buildInvoiceSeedFromEstimate(stored, 'est-1');
        if (financeTotals({ type: 'Estimate', ...stored } as never).total === after && documentMoney('Estimate', stored).total === after
            && remindersTotals(stored as never).total === after && computeDocumentTotals(inv as never).total === after) everyTotal++;
        // the cost (costing panel) counts the chosen add-ons only
        const cost = roundMoney(countedLineItems(stored.lineItems).reduce((a: number, li: any) => a + toNumber(li.quantity) * toNumber(li.unitCost), 0));
        if (computeDocumentCost(stored) !== cost) { mismatch++; firstBad.push({ n, why: 'cost' }); }
        // payment schedule on the page == schedule from the stored total
        if (JSON.stringify(computeMilestones((page as any).proposal?.milestones || [], shown).rows) === JSON.stringify(computeMilestones(stored.proposal?.milestones || [], after).rows)) scheduleOk++;
        // the stored choice reads back
        if (JSON.stringify(clientAddonChoiceOf(stored)?.ids) === JSON.stringify([...picks].sort())) lockOk++;
        // anything that is not one of the add-ons is refused by the SQL
        try { sqlPatch('Estimate', data, ['not-a-line']); } catch { rejected++; }
        // defaults: the contractor's switched-on add-ons start ticked, and the page total equals the stored one
        if (portalTotals(applyAddonChoice(data, defaultAddonPicks('Estimate', data))).total === computeDocumentTotals(data).total) defaultsOk++;
    }
    eq('money: page total == total from the stored selection (all random runs)', mismatch, 0);
    if (firstBad.length) console.log('first mismatches', JSON.stringify(firstBad.slice(0, 3)));
    check(`money: enough random estimates with add-ons (${choosable}/${runs})`, choosable > 400);
    eq('money: finance / export / reminders / invoice seed all equal the signed total', everyTotal, choosable);
    eq('money: payment schedule on the page == schedule after signing', scheduleOk, choosable);
    eq('money: stored choice reads back', lockOk, choosable);
    eq('money: SQL refuses an id that is not an add-on of the document', rejected, choosable);
    eq('money: default ticks == the stored total before any change', defaultsOk, choosable);
}

// fixed example (readable)
{
    const est = {
        status: 'Sent', taxRate: 10, discount: 0,
        lineItems: [
            { id: 'a', description: 'Tile floor', quantity: 1, rate: 1000 },
            { id: 'b', description: 'Heated floor', quantity: 1, rate: 300, optional: true, selected: false, inventoryItemId: '11111111-1111-1111-1111-111111111111', unitCost: 120 },
            { id: 'c', description: 'Extra outlet', quantity: 2, rate: 50, optional: true, selected: true },
        ],
    };
    eq('example: before = 1000 + 100 (owner switched the outlet on) + tax', computeDocumentTotals(est).total, 1210);
    eq('example: defaults = the outlet', defaultAddonPicks('Estimate', est), ['c']);
    const both = applyAddonChoice(est, ['b', 'c']);
    eq('example: client adds the heated floor', computeDocumentTotals(both).total, 1540);
    eq('example: client removes everything', computeDocumentTotals(applyAddonChoice(est, [])).total, 1100);
    const stored = { ...est, ...sqlPatch('Estimate', est, ['b', 'c']) };
    eq('example: private fields kept on the chosen line', (stored.lineItems[1] as any).inventoryItemId, '11111111-1111-1111-1111-111111111111');
    eq('example: stored total == page total', computeDocumentTotals(stored).total, 1540);
    eq('example: only `selected` changed', stored.lineItems.map((l: any, i: number) => JSON.stringify({ ...l, selected: undefined }) === JSON.stringify({ ...est.lineItems[i], selected: undefined })), [true, true, true]);
    eq('toggle pick', [toggleAddonPick(['c'], 'b', true), toggleAddonPick(['c', 'b'], 'c', false), toggleAddonPick(['c'], 'c', true)], [['c', 'b'], ['b'], ['c']]);
    eq('clean picks: unknown / duplicate / regular-line ids dropped', cleanAddonPicks('Estimate', est, ['b', 'b', 'a', 'zzz', 5 as never]), ['b']);
    check('clean picks: at most 50', cleanAddonPicks('Estimate', { lineItems: Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, optional: true, rate: 1, quantity: 1 })) }, Array.from({ length: 60 }, (_, i) => `x${i}`)).length === ADDON_CHOICE_MAX);
    let threw = false; try { sqlPatch('Estimate', est, Array.from({ length: 51 }, () => 'b')); } catch { threw = true; }
    check('SQL mirror: more than 50 ids refused', threw);

    // signed lock: the add-on state is part of what the client signed
    const signed = { ...stored, clientSignatureUrl: 'data:image/png;base64,AA', clientSignedAt: '2026-11-16T10:00:00.000Z', status: 'Accepted' };
    check('lock: changing a chosen add-on after signing is refused', !!signedChangeProblem(signed, applyAddonChoice({ ...signed }, ['c']), 'estimate'));
    check('lock: same choice saves fine', signedChangeProblem(signed, { ...signed, clientAddonChoice: { ids: ['b', 'c'] } }, 'estimate') === null);
    check('lock: signed content differs by choice', JSON.stringify(signedContent(signed, 'estimate')) !== JSON.stringify(signedContent({ ...signed, ...applyAddonChoice(signed, []) }, 'estimate')));
    eq('signed: nothing left to choose', choosableAddons('Estimate', signed), []);
    eq('signed: choice read back', clientAddonChoiceOf({ ...signed, clientAddonChoice: { ids: ['b', 'c'], at: 'x', name: 'Jane' } }), { ids: ['b', 'c'], at: 'x', name: 'Jane' });
    eq('unsigned: a leftover choice is ignored', clientAddonChoiceOf({ ...est, clientAddonChoice: { ids: ['b'] } }), null);

    // convert to invoice: chosen add-ons become normal lines, the others are left out
    const inv = buildInvoiceSeedFromEstimate({ ...signed, ...applyAddonChoice(signed, ['b']) }, 'e1') as any;
    eq('invoice: chosen add-on billed as a normal line, the other left out', inv.lineItems.map((l: any) => [l.id, 'optional' in l]), [['a', false], ['b', false]]);

    // PDF model: chosen add-on in the items table, the other under Optional add-ons
    const m = buildDocumentModel('Estimate', { ...signed, ...applyAddonChoice(signed, ['b']), templateId: 'modern' } as never, SAMPLE_PROFILE as never, SAMPLE_JOB as never);
    const table = JSON.stringify(m.items);
    check('PDF: chosen add-on printed in the items, not-chosen one not', table.includes('Heated floor') && !table.includes('Extra outlet'));
    check('PDF: not-chosen add-on listed under Optional add-ons', JSON.stringify(m.after).includes('Extra outlet'));
}

// ---------------------------------------------------------------------------------------------------------------
// 3. backwards compatibility
// ---------------------------------------------------------------------------------------------------------------
{
    const plain = { status: 'Sent', taxRate: 5, lineItems: [{ id: 'a', description: 'x', quantity: 1, rate: 10 }] };
    eq('plain estimate: nothing to choose', choosableAddons('Estimate', plain), []);
    check('plain estimate: data untouched (same object)', applyAddonChoice(plain, ['a']) === plain);
    eq('plain estimate: no defaults', defaultAddonPicks('Estimate', plain), []);
    const noLines = { status: 'Sent' };
    check('estimate without lines: untouched', applyAddonChoice(noLines, []) === noLines && choosableAddons('Estimate', noLines).length === 0);
    const withAddon = { status: 'Sent', lineItems: [{ id: 'a', quantity: 1, rate: 10 }, { id: 'o', optional: true, quantity: 1, rate: 5 }] };
    eq('change order / invoice: never choosable', [choosableAddons('Change Order', withAddon).length, choosableAddons('Invoice', withAddon).length], [0, 0]);
    const optionsOpen = { ...withAddon, estimateOptions: { options: [{ id: 'o1', lineItems: [] }, { id: 'o2', lineItems: [] }] } };
    check('open good/better/best options: add-ons not choosable', hasOpenOptions(optionsOpen) && choosableAddons('Estimate', optionsOpen).length === 0);
    let threw = false; try { sqlPatch('Estimate', optionsOpen, []); } catch { threw = true; }
    check('open options: the SQL refuses too', threw);
    const optionsApplied = { ...withAddon, estimateOptions: { options: [{ id: 'o1', lineItems: [] }, { id: 'o2', lineItems: [] }], appliedId: 'o1' } };
    check('applied options: add-ons choosable', !hasOpenOptions(optionsApplied) && choosableAddons('Estimate', optionsApplied).length === 1);
    check('options as JSON text: still detected', hasOpenOptions({ estimateOptions: JSON.stringify(optionsOpen.estimateOptions) }));
    const noIds = { status: 'Sent', lineItems: [{ optional: true, quantity: 1, rate: 5 }, { id: 9, optional: true, quantity: 1, rate: 5 }] };
    check('add-ons without a usable id: not choosable, data untouched (same rule as the SQL)', choosableAddons('Estimate', noIds).length === 0 && applyAddonChoice(noIds, []) === noIds && !noIds.lineItems.some(sqlOptional));
}

// ---------------------------------------------------------------------------------------------------------------
// 4. stock: SQL predicate == the app's money rule
// ---------------------------------------------------------------------------------------------------------------
{
    /** the SQL: `not (lower(btrim(optional)) = 'true' and lower(btrim(coalesce(selected,''))) <> 'true')` */
    const sqlTakesStock = (li: any) => !(sqlTrue(li.optional) && !sqlTrue(li.selected));
    let same = 0, total = 0;
    for (const optional of [undefined, null, true, false, 'true', ' True ', 'false', '', 1]) {
        for (const selected of [undefined, null, true, false, 'true', ' TRUE', 'false', '', 1]) {
            const li: any = { id: 'x', quantity: 1, rate: 1, inventoryItemId: 'i' };
            if (optional !== undefined) li.optional = optional;
            if (selected !== undefined) li.selected = selected;
            total++;
            if (sqlTakesStock(li) === !isExcludedOptionalLine(li)) same++;
        }
    }
    eq('stock: SQL skips exactly the lines the money skips', same, total);
}

// ---------------------------------------------------------------------------------------------------------------
// 5. app wiring + tolerance before the SQL exists
// ---------------------------------------------------------------------------------------------------------------
{
    const p = planAddonSigning({ portalKey: 'k'.repeat(40), documentId: 'd1' }, ['b', 'b', 'c'], ' Jane ', 'sig');
    eq('plan portal: new function with the ids', [p.rpc.name, p.rpc.args.p_addon_ids, p.rpc.args.p_signer_name], ['sign_document_addons_via_portal', ['b', 'c'], 'Jane']);
    eq('plan portal: fallback = the existing call, unchanged', [p.fallback.name, Object.keys(p.fallback.args)], ['sign_document_via_portal', ['p_key', 'p_doc_id', 'p_signature']]);
    const t = planAddonSigning({ token: 'tok' }, [], 'Jane', 'sig');
    eq('plan token: new function', [t.rpc.name, t.rpc.args.p_addon_ids], ['approve_document_addons_by_token', []]);
    eq('plan token: fallback = the existing call, unchanged', [t.fallback.name, Object.keys(t.fallback.args)], ['approve_document_by_token', ['doc_token', 'p_signature']]);
    const sqlArgs = (n: string) => (fnBlock(sql, n).match(/\(([\s\S]*?)\)\nreturns/)?.[1] || '').split(',').map(a => a.trim().split(/\s+/)[0]);
    eq('plan args match the SQL parameters (portal)', Object.keys(p.rpc.args).sort(), sqlArgs('sign_document_addons_via_portal').sort());
    eq('plan args match the SQL parameters (token)', Object.keys(t.rpc.args).sort(), sqlArgs('approve_document_addons_by_token').sort());

    const dav = read('components/DocumentApprovalView.tsx');
    const fn = dav.slice(dav.indexOf('export async function signWithAddons'), dav.indexOf('/** Calls a decline RPC'));
    check('app: signWithAddons tries the new function, falls back only on a missing function', fn.includes('supabase.rpc(plan.rpc.name, plan.rpc.args)') && fn.includes('if (!isMissingFunctionError(res.error)) throw') && fn.includes('callSigningRpc(plan.fallback.name, plan.fallback.args, signerName)'));
    check('app: fallback tells the client the total actually signed (stored data, add-ons not recorded)', fn.includes('addonsNotRecorded: { total: documentTotals(doc.data).total }'));
    check('app: approval link signs with add-ons', dav.includes('signWithAddons({ token }, doc, addonPicks, name, signature)'));
    check('app: portal signs with add-ons', read('components/PortalView.tsx').includes('signWithAddons({ portalKey: key, documentId: current.id }, current'));
    check('app: options keep their own signing first', /if \(optionSet && pick\) await signWithOption[\s\S]{0,80}else if \(hasAddons\)/.test(dav));
    check('app: page totals come from the data with the ticks applied', dav.includes('const totals = documentTotals(d);') && dav.includes('const d = choosing ? addons!.data : doc.data;') && dav.includes('const d = addons.data;'));
    check('app: completion card shows the choice / the warning', dav.includes('Add-ons included:') && dav.includes('couldn’t be saved online'));
    const ppv = read('components/proposal/ProposalPortalView.tsx');
    check('portal view: tick box "Add to my estimate" + "Not chosen" after signing', ppv.includes('Add to my estimate') && ppv.includes('Not chosen') && ppv.includes("'Not included in the total. Ask the contractor to add any of them.'"));
    check('owner form: shows the client choice', read('components/EstimateForm.tsx').includes('clientChoice={clientAddonChoiceOf(d)}') && read('components/proposal/ProposalBuilder.tsx').includes('Client chose it'));
    check('help: proposals guide explains the client choice', /id: 'proposals'[\s\S]*?Add to my estimate/.test(read('components/help/helpContent.ts')));
    check('engine is pure (no supabase / react)', !/supabase|from 'react'/.test(read('lib/addonChoice.ts').replace(/^\s*\*.*$/gm, '').replace(/\/\/.*$/gm, '')));
}

const total = passed + failures.length;
for (const f of failures.slice(0, 80)) console.log(`FAIL  ${f}`);
console.log(failures.length ? `addons-choice-check: ${failures.length} of ${total} checks failed` : `addons-choice-check: all ${total} checks passed`);
process.exit(failures.length ? 1 : 0);
