// Demo data for chapter 27 (automations, integrations, calendar file, accounting files). Everything here is made up. Only built for chapter 27.
//
//  - Gmail shows as Connected on "Integrations & data" (the same fake `gmail` function as chapter 8, switched on here).
//  - The calendar file counts come from what the demo already holds (active jobs, the appointments of chapter 10, the tasks of chapter 8,
//    lead follow-ups, invoice dates), so "Set up the file" shows non-zero numbers.
//  - The accounting preview needs last month's money: 3 more sent / paid invoices and 3 expense logs dated in the previous month, next to
//    the seed's two. (The automation rules need no data: they start in their normal state.)

import { addJobCosts } from './21-job-costing.mjs';
import { functions as sendDemo } from './08-send-and-portal.mjs';

const MINE = new Set(['27']);

export default (ctx) => {
  if (!MINE.has(ctx.chapter)) return;
  const { tables, uid, day, iso, id } = ctx;
  sendDemo.gmail({ action: 'exchange' });
  const jobs = tables.get('jobs');
  const docs = tables.get('documents');
  const byName = (n) => jobs.find((j) => j.name === n);
  const lines = (list) => list.map(([description, quantity, rate, unitCost]) => ({ id: id(), description, quantity, rate, unitCost: unitCost || 0 }));
  const inv = (job, number, off, status, rows, extra = {}) => docs.push({
    id: id(), user_id: uid, job_id: job.id, client_id: job.client_id || null, type: 'Invoice',
    data: { companyName: 'Northline Remodeling', clientName: job.client_name, clientAddress: job.client_address, invoiceNumber: number, issueDate: day(off), dueDate: day(off + 14), status, taxRate: 7.5, amountPaid: status === 'Paid' ? 1 : 0, lineItems: lines(rows), terms: 'Net 14', ...extra },
    created_at: iso(off), updated_at: iso(off), public_token: id().replace(/-/g, '').slice(0, 24),
  });
  const total = (rows) => Math.round(rows.reduce((s, [, q, r]) => s + q * r, 0) * 1.075 * 100) / 100;
  const okafor = byName('Okafor Basement Finish');
  const whitfield = byName('Whitfield Porch Rail Repair');
  const alvarez = byName('Alvarez Rental Repaint');
  const rows1 = [['Porch rail repair, labor and materials', 1, 1850, 700]];
  const rows2 = [['Basement trim and paint touch-up', 1, 2400, 900]];
  const rows3 = [['Interior repaint, 3 units (second half)', 1, 3100, 1300]];
  inv(whitfield, 'INV-2060', -36, 'Paid', rows1, { paidAt: day(-30), amountPaid: total(rows1) });
  inv(okafor, 'INV-2061', -32, 'Paid', rows2, { paidAt: day(-26), amountPaid: total(rows2) });
  inv(alvarez, 'INV-2062', -28, 'Sent', rows3);
  // three expense logs in the previous month
  addJobCosts(ctx, okafor, { expenses: [[-33, 'Tile saw rental', 'Maple Grove Rentals', 'Other', 145], [-29, 'Fuel for the truck', 'Lakeside Gas', 'Fuel', 96], [-25, 'Lunch for the crew', 'Corner Deli', 'Food', 78]] });
};
