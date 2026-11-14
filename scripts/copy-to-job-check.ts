/** Pure-logic checks for "Copy to another job" (lib/copyToJob.ts): npx tsx scripts/copy-to-job-check.ts */
import { buildCopyToJobData, rankJobsForPicker, copyDoneMessage, type CopyTargetJob } from '../lib/copyToJob.ts';
import { buildDuplicateDocumentData } from '../lib/documents.ts';
import { createOptionSet, readOptionSet } from '../lib/estimateOptions.ts';
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error('FAIL ' + label); } };
const eq = (label: string, a: unknown, b: unknown) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x === y) pass++; else { fail++; console.error(`FAIL ${label}\n  expected ${y}\n  actual   ${x}`); } };

const target: CopyTargetJob = { id: 'job-B', userId: 'u', name: 'Kitchen B', clientName: 'Bob Builder', clientAddress: '9 Oak St', startDate: '2026-11-01', endDate: null, status: 'active', clientId: 'cl-B', createdAt: '2026-11-02T00:00:00Z' };
const client = { id: 'cl-B', name: 'Bob Builder', address: '9 Oak Street, Springfield' };
const items = [{ id: 'l1', description: 'Tile', quantity: 4, rate: 25, inventoryItemId: 'inv-1' }];
const options = createOptionSet(items as any, 3);
const internal = { l1: { unitCost: 10 } };

const base: Record<string, any> = {
    clientId: 'cl-A', clientName: 'Ann A', clientAddress: '1 Elm', projectName: 'Kitchen A', projectAddress: '1 Elm',
    notes: 'Net 30', terms: 'Terms text', templateId: 'modern', accentColor: '#123456', lineItems: items,
    status: 'Accepted', estimateNumber: 'EST-7', clientSignatureUrl: 'x', clientSignedAt: 't', clientSignedBy: 'Ann', approvedAt: 't',
    clientDeclinedAt: 'd', viewedByProvider: true, payments: [{ id: 'p', amount: 5 }], amountPaid: 5, paidAt: 't', paymentReportedAt: 't',
    reviewRequestedAt: 't', recurrenceSourceId: 'r', recurrencePeriod: '2026-10', clientOptionChoice: { optionId: 'o1' },
    estimateOptions: options, estimateOptionsInternal: internal,
    deductInventory: true, inventoryDeductedAt: 't', internalStockReceipt: { state: 'done' }, internalReorder: { x: 1 },
};

const c = buildCopyToJobData(base, target, client);
eq('client fields replaced', [c.clientId, c.clientName, c.clientAddress], ['cl-B', 'Bob Builder', '9 Oak Street, Springfield']);
eq('project fields replaced', [c.projectName, c.projectAddress], ['Kitchen B', '9 Oak St']);
ok('draft status', c.status === 'Draft');
ok('number gets -COPY', c.estimateNumber === 'EST-7-COPY');
eq('line items kept', c.lineItems, items);
eq('notes/terms/design kept', [c.notes, c.terms, c.templateId, c.accentColor], ['Net 30', 'Terms text', 'modern', '#123456']);
ok('options kept (no client choice)', readOptionSet(c)?.options.length === 3 && !('clientOptionChoice' in c));
eq('internal option costs kept', c.estimateOptionsInternal, internal);
for (const k of ['clientSignatureUrl', 'clientSignedAt', 'clientSignedBy', 'approvedAt', 'clientDeclinedAt', 'viewedByProvider', 'payments', 'paidAt', 'paymentReportedAt', 'reviewRequestedAt', 'recurrenceSourceId', 'recurrencePeriod', 'internalStockReceipt', 'internalReorder'])
    ok(`cleared ${k}`, !(k in c));
ok('no amountPaid left from recorded payments', c.amountPaid === undefined);
ok('deductInventory forced false', c.deductInventory === false);
ok('inventoryDeductedAt gone', !('inventoryDeductedAt' in c));
const noFlag = buildCopyToJobData({ lineItems: items, invoiceNumber: 'I-1' }, target, client);
ok('no deductInventory introduced when absent', !('deductInventory' in noFlag));

const wo = buildCopyToJobData({ workOrderNumber: 'WO-1', status: 'Completed', clientName: 'Ann A', clientAddress: '1 Elm', description: 'Fix' }, target, null);
eq('work order: only present boxes replaced', [wo.clientName, wo.clientAddress, 'projectName' in wo, 'clientId' in wo, wo.status], ['Bob Builder', '9 Oak St', false, false, 'Scheduled']);
const dr = buildCopyToJobData({ reportNumber: 'R-1', clientName: 'Ann A', projectName: 'Kitchen A', projectAddress: '1 Elm', content: '<p>x</p>' }, target, client);
eq('daily report', [dr.clientName, dr.projectName, dr.projectAddress, dr.content], ['Bob Builder', 'Kitchen B', '9 Oak St', '<p>x</p>']);
const ml = buildCopyToJobData({ title: 'Mats', projectName: 'Kitchen A', items: [{ id: 'm', name: 'Nail' }] }, target, client);
eq('material log', [ml.projectName, ml.title, ml.items.length], ['Kitchen B', 'Mats (Copy)', 1]);
const unlinked = buildCopyToJobData({ clientId: 'cl-A', clientName: 'Ann A' }, { ...target, clientId: null }, null);
ok('unlinked client: clientId dropped, name from job', !('clientId' in unlinked) && unlinked.clientName === 'Bob Builder');
const po = buildCopyToJobData({ poNumber: 'PO-1', shipToType: 'Job Site', shipToName: 'Ann A', shipToAddress: '1 Elm', shipToPhone: '5', internalStockReceipt: { state: 'done' }, status: 'Received' }, target, client);
eq('PO job-site ship-to follows the job', [po.shipToName, po.shipToAddress, po.status, 'internalStockReceipt' in po], ['Bob Builder', '9 Oak St', 'Draft', false]);
const poOffice = buildCopyToJobData({ poNumber: 'PO-1', shipToType: 'Company Office', shipToName: 'HQ', shipToAddress: 'Main' }, target, client);
eq('PO company-office ship-to kept', [poOffice.shipToName, poOffice.shipToAddress], ['HQ', 'Main']);
const inv = { invoiceNumber: 'INV-1', amountPaid: 100, lineItems: items };
eq('same as Duplicate when no client/job boxes', buildCopyToJobData(inv, target, client), buildDuplicateDocumentData(inv));
ok('source data not mutated', base.clientName === 'Ann A' && base.status === 'Accepted' && 'clientSignatureUrl' in base);

const mk = (id: string, name: string, clientName: string, createdAt: string): CopyTargetJob => ({ ...target, id, name, clientName, createdAt });
const jobs = [mk('a', 'Roof', 'Zed', '2026-01-01T00:00:00Z'), mk('b', 'Deck', 'Amy', '2026-03-01T00:00:00Z'), mk('c', 'Bath', 'Zed', '2026-02-01T00:00:00Z')];
eq('recent first by created', rankJobsForPicker(jobs).map(j => j.id), ['b', 'c', 'a']);
eq('activity beats created', rankJobsForPicker(jobs, { lastActivity: { a: '2026-11-01T00:00:00Z' } }).map(j => j.id), ['a', 'b', 'c']);
eq('excludes source job', rankJobsForPicker(jobs, { excludeJobId: 'b' }).map(j => j.id), ['c', 'a']);
eq('search by client', rankJobsForPicker(jobs, { query: ' zed ' }).map(j => j.id), ['c', 'a']);
eq('search by job name', rankJobsForPicker(jobs, { query: 'DEC' }).map(j => j.id), ['b']);
eq('no match', rankJobsForPicker(jobs, { query: 'nope' }), []);
eq('toast text', copyDoneMessage({ name: 'Kitchen B', clientName: 'Bob' }), 'Copied to Kitchen B as a draft');

// wiring: same guards as Duplicate, no stock call, Open action
const app = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const h = app.slice(app.indexOf('const handleCopyDocToJob'), app.indexOf('const copyPickerActivity'));
ok('wiring: handler found', h.length > 200);
ok('wiring: waiting-to-sync guard', /outbox\.itemFor\(form\.id\)/.test(h));
ok('wiring: offline guard', /navigator\.onLine/.test(h));
ok('wiring: plan slot for the TARGET job', /ensureDocSlot\(target\.id\)/.test(h));
ok('wiring: plan-limit handler', /handlePlanLimit\(error\)/.test(h));
ok('wiring: inserts into target job', /job_id: target\.id/.test(h));
ok('wiring: Open action', /label: 'Open'/.test(h));
ok('wiring: no inventory writes', !/inventory/i.test(h));
ok('Duplicate unchanged (still present)', /const handleDuplicateDoc = async/.test(app) && /onDuplicateDocument=\{handleDuplicateDoc\}/.test(app));

console.log(`copy-to-job-check: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
