/**
 * Website generators → app hand-off (lib/generatorHandoff.ts) and its wiring:
 * draft cleaning, storage + expiry, the job values, the document seed, and that the pages / App.tsx use it.
 *   npx tsx scripts/generator-handoff-check.ts
 */
import { readFileSync } from 'node:fs';
import {
  GENERATOR_DRAFT_KEY, GENERATOR_DRAFT_TTL_MS, buildGeneratorDraft, clearGeneratorDraft, generatorDocLabel, generatorDocumentSeed,
  generatorFormType, generatorJobValues, parseGeneratorDraft, readGeneratorDraft, saveGeneratorDraft,
} from '../lib/generatorHandoff.ts';
import { FormType } from '../types.ts';

let failures = 0;
let passes = 0;
const eq = (label: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passes++;
  else {
    failures++;
    console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
  }
};
const ok = (label: string, cond: boolean) => eq(label, cond, true);

class MemStore {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);

// ── buildGeneratorDraft ─────────────────────────────────────────────────────
const est = buildGeneratorDraft({
  kind: 'estimate', source: '/estimate-generator', company: '  Acme   Decks LLC ', client: 'Dana Ruiz', jobName: 'Deck replacement',
  jobAddress: '12 Oak St, Austin', number: 'EST-2001', date: '2026-11-20',
  lines: [
    { description: 'Remove deck', quantity: '1', rate: '900' },
    { description: 'Composite decking (sq ft)', quantity: '240', rate: '$18' },
    { description: '', quantity: '1', rate: '0' }, // empty line dropped
  ],
  tax: '8.25%', extra: '15', notes: 'Permits at cost.\r\nThanks!',
}, NOW);
eq('estimate: company trimmed + spaces collapsed', est.company, 'Acme Decks LLC');
eq('estimate: sample number dropped (app numbers it)', est.number, '');
eq('estimate: empty line dropped', est.lines.length, 2);
eq('estimate: "$18" parsed', est.lines[1].rate, 18);
eq('estimate: tax "8.25%" parsed', est.taxRate, 8.25);
eq('estimate: valid days', est.validDays, 15);
eq('estimate: no deposit', est.deposit, 0);
eq('estimate: notes keep line breaks, CRLF normalized', est.notes, 'Permits at cost.\nThanks!');
eq('estimate: date kept', est.date, '2026-11-20');

const placeholders = buildGeneratorDraft({ kind: 'invoice', company: 'Your Company LLC', client: 'Client name', number: 'INV-1001', date: 'nope', extra: '-50', tax: '500' }, NOW);
eq('placeholder company dropped', placeholders.company, '');
eq('placeholder client dropped', placeholders.client, '');
eq('placeholder number dropped', placeholders.number, '');
eq('bad date → ""', placeholders.date, '');
eq('negative deposit clamped to 0', placeholders.deposit, 0);
eq('tax clamped to 100', placeholders.taxRate, 100);
eq('invoice valid days default (unused) 30', placeholders.validDays, 30);

const inv = buildGeneratorDraft({ kind: 'invoice', client: 'Sam Lee', number: 'INV-77', extra: '1,000', lines: [{ description: 'Tile', quantity: '120', rate: '12' }] }, NOW);
eq('invoice: custom number kept', inv.number, 'INV-77');
eq('invoice: deposit "1,000" parsed', inv.deposit, 1000);
const many = buildGeneratorDraft({ kind: 'estimate', lines: Array.from({ length: 80 }, (_, i) => ({ description: `L${i}`, quantity: 1, rate: 1 })) }, NOW);
eq('lines capped at 60', many.lines.length, 60);
eq('unknown kind → estimate', buildGeneratorDraft({ kind: 'x' as never }, NOW).kind, 'estimate');
eq('long company cut to 300', buildGeneratorDraft({ kind: 'estimate', company: 'x'.repeat(500) }, NOW).company.length, 300);

// ── storage + expiry ────────────────────────────────────────────────────────
const store = new MemStore();
ok('save returns true', saveGeneratorDraft(est, store));
ok('stored under cd_generator_draft', store.getItem(GENERATOR_DRAFT_KEY) !== null && GENERATOR_DRAFT_KEY === 'cd_generator_draft');
eq('read back equals the draft', readGeneratorDraft(store, NOW + 1000), est);
eq('expired after 7 days → null', readGeneratorDraft(store, NOW + GENERATOR_DRAFT_TTL_MS + 1), null);
eq('expired value removed', store.getItem(GENERATOR_DRAFT_KEY), null);
saveGeneratorDraft(est, store);
clearGeneratorDraft(store);
eq('clear removes it', store.getItem(GENERATOR_DRAFT_KEY), null);
eq('broken JSON → null', parseGeneratorDraft('{oops', NOW), null);
eq('wrong version → null', parseGeneratorDraft(JSON.stringify({ ...est, v: 2 }), NOW), null);
eq('future createdAt → null', parseGeneratorDraft(JSON.stringify({ ...est, createdAt: NOW + 3_600_000 }), NOW), null);
const tampered = parseGeneratorDraft(JSON.stringify({ ...est, taxRate: 9999, lines: [{ description: 'A', quantity: 'abc', rate: 5 }] }), NOW);
eq('tampered values re-cleaned: tax', tampered?.taxRate, 100);
eq('tampered values re-cleaned: bad qty → 1', tampered?.lines[0].quantity, 1);
eq('null store: read → null', readGeneratorDraft(null, NOW), null);
eq('null store: save → false', saveGeneratorDraft(est, null), false);
const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
eq('throwing store: read → null', readGeneratorDraft(throwing, NOW), null);
eq('throwing store: save → false', saveGeneratorDraft(est, throwing), false);

// ── job values ──────────────────────────────────────────────────────────────
eq('job values from the form', generatorJobValues(est), { name: 'Deck replacement', clientName: 'Dana Ruiz', clientAddress: '12 Oak St, Austin' });
eq('no job name → "Invoice for <client>"', generatorJobValues(inv).name, 'Invoice for Sam Lee');
eq('no job name, no client → first line', generatorJobValues(buildGeneratorDraft({ kind: 'estimate', lines: [{ description: 'Roof repair', quantity: 1, rate: 1 }] }, NOW)).name, 'Roof repair');
eq('nothing at all → "My first estimate"', generatorJobValues(buildGeneratorDraft({ kind: 'estimate' }, NOW)).name, 'My first estimate');
eq('labels', [generatorDocLabel('estimate'), generatorDocLabel('invoice')], ['estimate', 'invoice']);
eq('form types', [generatorFormType('estimate'), generatorFormType('invoice')], [FormType.Estimate, FormType.Invoice]);

// ── document seed ───────────────────────────────────────────────────────────
let n = 0;
const ids = () => `id-${++n}`;
const estSeed = generatorDocumentSeed(est, '2026-11-21', ids);
eq('estimate seed: issue date = typed date', estSeed.issueDate, '2026-11-20');
eq('estimate seed: expiry = date + valid days', estSeed.expiryDate, '2026-12-05');
eq('estimate seed: terms mention valid days', estSeed.terms, 'This estimate is valid for 15 days. Payment schedule: 50% deposit, 50% upon completion.');
eq('estimate seed: lines with ids + unitCost', estSeed.lineItems, [
  { id: 'id-1', description: 'Remove deck', quantity: 1, rate: 900, unitCost: 0 },
  { id: 'id-2', description: 'Composite decking (sq ft)', quantity: 240, rate: 18, unitCost: 0 },
]);
eq('estimate seed: company/client/address/title', [estSeed.companyName, estSeed.clientName, estSeed.clientAddress, estSeed.title], ['Acme Decks LLC', 'Dana Ruiz', '12 Oak St, Austin', 'Deck replacement']);
ok('estimate seed: no number when the sample was kept', !('estimateNumber' in estSeed));
eq('estimate seed: tax', estSeed.taxRate, 8.25);
const invSeed = generatorDocumentSeed(inv, '2026-11-21', ids);
eq('invoice seed: no date typed → today', invSeed.issueDate, '2026-11-21');
eq('invoice seed: due in 30 days', invSeed.dueDate, '2026-12-21');
eq('invoice seed: custom number', invSeed.invoiceNumber, 'INV-77');
eq('invoice seed: deposit → amountPaid', invSeed.amountPaid, 1000);
ok('invoice seed: no estimate fields', !('expiryDate' in invSeed) && !('terms' in invSeed));
ok('invoice seed: no companyName when blank (profile default stays)', !('companyName' in invSeed));
ok('invoice seed lines have no unitCost', !('unitCost' in (invSeed.lineItems as Record<string, unknown>[])[0]));
const emptySeed = generatorDocumentSeed(buildGeneratorDraft({ kind: 'estimate' }, NOW), '2026-11-21', ids);
ok('empty draft: no lineItems key (form default line stays)', !('lineItems' in emptySeed));

// ── wiring ──────────────────────────────────────────────────────────────────
const page = readFileSync(new URL('../pages/GeneratorPage.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const formHook = readFileSync(new URL('../components/forms/useDocumentForm.ts', import.meta.url), 'utf8');
const signup = readFileSync(new URL('../components/Signup.tsx', import.meta.url), 'utf8');
const login = readFileSync(new URL('../components/Login.tsx', import.meta.url), 'utf8');
const seo = readFileSync(new URL('../pages/seo.ts', import.meta.url), 'utf8');
ok('generator: no print / save-as-PDF button any more', !page.includes('window.print') && !/Print \/ Save as PDF/.test(page));
ok('generator: Preview button + dialog', page.includes('<Eye className="h-4 w-4" /> Preview') && page.includes('const PreviewDialog'));
ok('generator: "Create it in ContractorDocs" saves the draft first', /const createInApp = \(\) => \{\s*saveGeneratorDraft\(buildGeneratorDraft\(/.test(page));
ok('generator: signed in → /dashboard, else sign up', page.includes("navigate(hasStoredSession() ? '/dashboard' : `${SIGNUP_PATH}?from=${kind}-generator`)"));
ok('generator: the tool is hidden when printing', page.includes('lg:grid-cols-[1fr_1.05fr] print:hidden'));
ok('generator: job name + address fields', page.includes('id="g-job"') && page.includes('id="g-address"'));
ok('generator copy: no free PDF promise', !/print it or save|Print or save|save it as a PDF for free/i.test(page));
ok('seo: generator titles/descriptions no longer promise print', !/Print or save as PDF free|Print or save it as a PDF for free/.test(seo));
ok('app: reads the hand-off once and clears it before working', /generatorRunRef\.current = true;\s*clearGeneratorDraft\(\);/.test(app));
ok('app: creates the job without navigating, then opens the form with an auto-saved seed', app.includes('await handleSaveJob(generatorJobValues(draft), true)') && app.includes('prefillData: { ...makeSeedPrefill(seed), __autoSave: true }'));
ok('app: waits for a signed-in, loaded account on an app screen', app.includes("if (!uid || !profile || profileStatus !== 'ready' || !jobsLoaded || generatorRunRef.current) return;") && app.includes("if (PUBLIC_SCREENS.includes(view.screen) || view.screen === 'billingSuccess'"));
ok('app: busy overlay is a modal (the first-run tour waits for it)', app.includes('aria-label={`Opening your ${generatorBusy}`}') && app.includes('role="dialog" aria-modal="true"'));
ok('form: a seed with __autoSave is saved once', formHook.includes('const seedAutoKey = seed && isAutoSaveDraft(options.prefillData)') && formHook.includes('markDraftConsumed(seedAutoKey);'));
ok('signup + login explain the waiting document', signup.includes('readGeneratorDraft()') && login.includes('readGeneratorDraft()'));

console.log(`generator-handoff-check: ${passes} passed, ${failures} failed`);
if (failures) process.exit(1);
