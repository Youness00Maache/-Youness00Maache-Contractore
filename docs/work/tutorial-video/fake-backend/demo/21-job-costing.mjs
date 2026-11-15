// Demo data for chapter 21 (job costing, Bill time & materials, profit calculator). Everything here is made up.
//
// Only for chapter 21 (and anything that imports addJobCosts): the job "Whitfield Kitchen Remodel" gets
//   - its estimate lines worded so the budget splits (cabinets are Materials, not "installed" labor), keeping one line that is NOT split
//     (the approved change order CO-1001 has "Plumber, rough-in and tie-in");
//   - 2 Time Sheets (Jamal, 3 days, 2 h overtime), a Material Log (4 lines), 2 Expense Logs (fuel; a dumpster = "Subs & other"),
//     one SENT Purchase Order (counts as "Ordered"), nothing billed yet, so "Not billed yet" and Bill time & materials list them all.
// Result: budget about $19,630, spent about $6,750 + ordered $2,940 = 49 percent used; the chapter types 40 percent complete, so
// "Costs are ahead of the work" shows in red.

/** Adds time sheets / material logs / expense logs / a purchase order to a job. `spec` = { time:[[worker,dayOffset,hours,overtime,notes]], materials:[[dayOffset,[[name,supplier,qty,unitCost]]]],
 *  expenses:[[dayOffset,item,vendor,category,amount]], po:{ number, vendor, status, lines:[[description,qty,rate]] } } */
export function addJobCosts({ tables, uid, iso, day, id }, job, spec) {
  const docs = tables.get('documents');
  const base = { companyName: 'Northline Remodeling', clientName: job.client_name, clientAddress: job.client_address };
  const add = (type, data, off) => docs.push({ id: id(), user_id: uid, job_id: job.id, client_id: job.client_id || null, type, data: { ...base, ...data }, created_at: iso(off, 15), updated_at: iso(off, 15), public_token: id().replace(/-/g, '').slice(0, 24) });
  for (const [worker, off, hours, overtime, notes] of spec.time || []) {
    add('Time Sheet', { title: 'Time sheet: ' + worker, workerName: worker, date: day(off), hoursWorked: hours, overtimeHours: overtime, notes, status: 'Draft' }, off);
  }
  for (const [off, items] of spec.materials || []) {
    add('Material Log', { title: 'Materials', date: day(off), projectName: job.name, items: items.map(([name, supplier, quantity, unitCost]) => ({ id: id(), name, supplier, quantity, unitCost })) }, off);
  }
  for (const [off, item, vendor, category, amount] of spec.expenses || []) {
    add('Expense Log', { title: item, date: day(off), item, vendor, category, amount, tax: 0, notes: '', lineItems: [{ id: id(), description: item, quantity: 1, rate: amount }] }, off);
  }
  if (spec.po) {
    const p = spec.po;
    add('Purchase Order', {
      title: 'Purchase order ' + p.number, poNumber: p.number, date: day(-4), deliveryDate: day(3), status: p.status || 'Sent',
      vendorName: p.vendor, vendorAddress: '2200 Industrial Way, Maple Grove, OH', vendorPhone: '(555) 010-7700', vendorEmail: 'orders@harbor-supply.example',
      shipToType: 'Job Site', shipToName: job.name, shipToAddress: job.client_address, shipToPhone: '', deliveryInstructions: 'Call Marcus 30 minutes before arriving.',
      lineItems: p.lines.map(([description, quantity, rate]) => ({ id: id(), description, quantity, rate })), taxRate: 0, notes: '', terms: '',
    }, -4);
  }
}

export default (ctx) => {
  if (ctx.chapter !== '21') return;
  const { tables, iso, day, id } = ctx;
  const jobs = tables.get('jobs');
  const kitchen = jobs.find((j) => j.name === 'Whitfield Kitchen Remodel');
  if (!kitchen) return;

  // the budget splits into Labor / Materials; one change-order line stays "not split"
  const est = tables.get('documents').find((d) => d.job_id === kitchen.id && d.type === 'Estimate');
  if (est) for (const li of est.data.lineItems) if (li.description === 'Custom shaker cabinets (installed)') li.description = 'Custom shaker cabinets';

  addJobCosts(ctx, kitchen, {
    time: [
      ['Jamal', -9, 16, 0, 'Cabinet install, first two days'],
      ['Jamal', -6, 8, 2, 'Cabinet install, trim and doors'],
    ],
    materials: [[-8, [
      ['Shaker cabinet boxes and doors', 'Harbor Cabinet Supply', 1, 3350],
      ['Cabinet pulls, brushed brass', 'Harbor Cabinet Supply', 30, 6.5],
      ['3/4 in plywood, countertop support', 'Lumber Yard', 6, 52],
      ['Thinset and backer board', 'Tile Depot', 1, 343],
    ]]],
    expenses: [
      [-7, 'Fuel for the truck, two weeks', 'Lakeside Gas', 'Fuel', 380],
      [-5, 'Dumpster rental, 10 days', 'Maple Grove Disposal', 'Other', 420],
    ],
    po: { number: 'PO-1007', vendor: 'Harbor Cabinet Supply', status: 'Sent', lines: [['Quartz countertop slab, 38 sq ft', 1, 2600], ['Undermount sink, stainless', 1, 340]] },
  });
};

