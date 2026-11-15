// Demo data for chapter 26 (pipeline, Insights and the Business overview). Everything here is made up. Only built for chapter 26.
//
// Jobs spread over the six stages, each with the documents that put it there:
//   Requests       Halvorsen Deck Estimate (job with nothing sent) + the quote requests of chapter 2 / 10
//   Estimate sent  Nair Master Bath (EST-1043, no answer for 12 days = the waiting badge) and Quinn Kitchen Refresh (sent 4 days ago)
//   Approved       Dunn Storm Door (accepted estimate, nothing logged yet; its deposit invoice is still a Draft)
//   In progress    Ford Shed Roof (accepted estimate + a time sheet)
//   Invoiced       Whitfield Kitchen Remodel (INV-2081 sent), Alvarez Rental Repaint (INV-2072 overdue = Needs attention)
//   Paid           Okafor Basement Finish and Reyes Fence Repair (deposit paid)
// Insights: costs (time sheets, material logs, expense logs) on 5 jobs, so "Jobs by profit" ranks them; Dunn has an invoice but no costs
// ("without enough data"). Two estimates wait for a yes (Nair, Quinn). Gmail is connected (the Nudge button).

import { addJobCosts } from './21-job-costing.mjs';
import { functions as sendDemo } from './08-send-and-portal.mjs';

const MINE = new Set(['26']);

export default (ctx) => {
  if (!MINE.has(ctx.chapter)) return;
  const { tables, uid, day, iso, id } = ctx;
  const jobs = tables.get('jobs');
  const clients = tables.get('clients');
  const docs = tables.get('documents');
  const byName = (n) => jobs.find((j) => j.name === n);
  const lines = (list) => list.map(([description, quantity, rate, unitCost]) => ({ id: id(), description, quantity, rate, unitCost: unitCost || 0 }));
  const company = 'Northline Remodeling';
  const mkDoc = (job, type, data, off) => docs.push({ id: id(), user_id: uid, job_id: job.id, client_id: job.client_id || null, type, data: { companyName: company, clientName: job.client_name, clientAddress: job.client_address, ...data }, created_at: iso(off), updated_at: iso(off), public_token: id().replace(/-/g, '').slice(0, 24) });
  const newClient = (name, email, phone, address) => { const c = { id: id(), user_id: uid, name, email, phone, address, notes: '', portal_key: 'demo-portal-' + id().replace(/-/g, '').slice(0, 20), created_at: iso(-20) }; clients.push(c); return c; };
  const newJob = (name, client, status, start) => { const j = { id: id(), user_id: uid, name, client_name: client.name, client_address: client.address, client_id: client.id, status, start_date: day(start), end_date: null, worker_name: null, created_at: iso(start - 1) }; jobs.push(j); return j; };

  // Nair keeps ONE estimate, sent and unanswered (chapter 7's second estimate would make the job "Approved")
  const nair = byName('Nair Master Bath');
  for (let i = docs.length - 1; i >= 0; i--) if (docs[i].job_id === nair.id && docs[i].type === 'Estimate' && docs[i].data.estimateNumber === 'EST-1044') docs.splice(i, 1);

  // new jobs
  const dunn = newJob('Dunn Storm Door', newClient('Mike Dunn', 'mike.dunn@example.com', '(555) 010-4413', '58 Cooper Lane, Maple Grove, OH'), 'active', -6);
  mkDoc(dunn, 'Estimate', { estimateNumber: 'EST-1050', title: 'Storm door and trim', issueDate: day(-9), expiryDate: day(21), status: 'Accepted', taxRate: 7.5, lineItems: lines([['Storm door, installed', 1, 780, 420], ['Trim and caulk', 1, 360, 90]]), clientSignedAt: iso(-7, 12), clientSignedBy: 'Mike Dunn', terms: 'Balance on completion.' }, -9);
  mkDoc(dunn, 'Invoice', { invoiceNumber: 'INV-2090', issueDate: day(-5), dueDate: day(9), status: 'Draft', taxRate: 7.5, amountPaid: 0, lineItems: lines([['Deposit: storm door (50%)', 1, 570, 0]]), terms: 'Due on receipt.' }, -5);

  const reyes = newJob('Reyes Fence Repair', newClient('Ana Reyes', 'ana.reyes@example.com', '(555) 010-4416', '19 Mill Road, Lakeside, OH'), 'active', -8);
  mkDoc(reyes, 'Estimate', { estimateNumber: 'EST-1051', title: 'Fence repair', issueDate: day(-12), expiryDate: day(18), status: 'Accepted', taxRate: 7.5, lineItems: lines([['Replace 4 fence sections, labor and material', 1, 3400, 1900]]), clientSignedAt: iso(-10, 12), clientSignedBy: 'Ana Reyes', terms: 'Balance on completion.' }, -12);
  mkDoc(reyes, 'Invoice', { invoiceNumber: 'INV-2091', issueDate: day(-7), dueDate: day(7), status: 'Paid', paidAt: day(-3), taxRate: 7.5, amountPaid: 1500, lineItems: lines([['Deposit: fence repair', 1, 1500, 0]]) }, -7);

  const ford = newJob('Ford Shed Roof', newClient('Sam Ford', 'sam.ford@example.com', '(555) 010-4418', '77 Alder Street, Maple Grove, OH'), 'active', -7);
  mkDoc(ford, 'Estimate', { estimateNumber: 'EST-1053', title: 'Shed roof', issueDate: day(-10), expiryDate: day(20), status: 'Accepted', taxRate: 7.5, lineItems: lines([['Re-roof the shed, labor and material', 1, 2800, 1500]]), clientSignedAt: iso(-8, 12), clientSignedBy: 'Sam Ford', terms: 'Balance on completion.' }, -10);

  const quinn = newJob('Quinn Kitchen Refresh', newClient('Tom Quinn', 'tom.quinn@example.com', '(555) 010-4417', '300 Harbor Road, Lakeside, OH'), 'active', -4);
  mkDoc(quinn, 'Estimate', { estimateNumber: 'EST-1052', title: 'Kitchen refresh', issueDate: day(-4), expiryDate: day(26), status: 'Sent', taxRate: 7.5, lineItems: lines([['Cabinet repaint and new hardware', 1, 3900, 2100], ['New faucet and sink', 1, 1700, 900]]), terms: '40% deposit.' }, -4);

  // costs on five jobs (Jobs by profit): income comes from the invoices above and the seed's
  const whitfield = byName('Whitfield Kitchen Remodel');
  const okafor = byName('Okafor Basement Finish');
  const alvarez = byName('Alvarez Rental Repaint');
  addJobCosts(ctx, okafor, { time: [['Jamal', -12, 40, 0, 'Finish work']], materials: [[-13, [['Drywall, framing and trim', 'Lumber Yard', 1, 4300], ['Flooring, 640 sq ft', 'Floor Mart', 1, 1700]]]], expenses: [[-12, 'Fuel', 'Lakeside Gas', 'Fuel', 220]] });
  addJobCosts(ctx, whitfield, { time: [['Jamal', -9, 24, 2, 'Cabinet install']], materials: [[-8, [['Shaker cabinets', 'Harbor Cabinet Supply', 1, 3350], ['Hardware and plywood', 'Lumber Yard', 1, 500]]]], expenses: [[-7, 'Fuel', 'Lakeside Gas', 'Fuel', 380]] });
  addJobCosts(ctx, alvarez, { time: [['Eli', -10, 30, 0, 'Prep and paint']], materials: [[-11, [['Paint and supplies', 'Paint Depot', 1, 1850]]]], expenses: [[-10, 'Dump fee', 'Maple Grove Disposal', 'Other', 180]] });
  addJobCosts(ctx, reyes, { time: [['Eli', -4, 16, 0, 'Posts and rails']], materials: [[-5, [['Fence sections and hardware', 'Lumber Yard', 1, 2900]]]] });
  addJobCosts(ctx, ford, { time: [['Eli', -3, 12, 0, 'Tear-off']] });
  addJobCosts(ctx, nair, { time: [['Jamal', -3, 8, 0, 'Demo']], materials: [[-4, [['Backer board and thinset', 'Tile Depot', 1, 410]]]] });

  // Gmail is connected for the Nudge button (the same fake `gmail` function as chapter 8)
  sendDemo.gmail({ action: 'exchange' });
};
