// Demo data for chapter 18 (service plans). Only built for chapter 18 (GET /__reset?chapter=18).
//
//  - Two existing plans: "Spring and fall home check" for Linda Okafor (Twice a year, "Invoice each visit", $150 a visit, one visit coming up in a
//    few days with its Work Order and a Draft invoice, one old visit already done) and "Quarterly gutter cleaning" for Tom Alvarez (Quarterly,
//    "Quarterly invoice", one visit with a Work Order). Each plan has its job; the job starts on its next visit date, so it shows on the calendar.
//  - A new plan made in the chapter (client Sarah Whitfield) behaves like the database: saving it creates its job (guard_service_plan) and
//    generate_due_service_visits makes the visits that are due within the "create ahead" days (visit, Work Order, Draft invoice, next date moves on).
//  - Done / Skip a visit (complete_service_visit); the client's portal shows the plan (get_portal_service_plans) on /?portal=demo-portal-linda.

const UID = '00000000-0000-4000-8000-000000000001';
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));
const ymdOf = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const addMonths = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(d, last)); return t.toISOString().slice(0, 10); };
const nextAfter = (plan) => (plan.interval_unit === 'week' ? addDays(plan.next_visit, 7 * plan.interval_count) : addMonths(plan.next_visit, plan.interval_count));
let counter = 1010;

const workOrder = (plan, job, date, clientRow, extra = {}) => ({
  id: crypto.randomUUID(), user_id: UID, job_id: job.id, client_id: clientRow && clientRow.id, type: 'Work Order', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), public_token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
  data: { workOrderNumber: `WO-${++counter}`, title: plan.name, date, status: 'Open', description: plan.service || '', assignedTo: plan.assigned_to || '', clientName: plan.client_name, clientAddress: plan.client_address, companyName: 'Northline Remodeling', servicePlanId: plan.id, ...extra },
});
const draftInvoice = (plan, job, date, clientRow) => ({
  id: crypto.randomUUID(), user_id: UID, job_id: job.id, client_id: clientRow && clientRow.id, type: 'Invoice', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), public_token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
  data: { invoiceNumber: `INV-${2100 + (++counter - 1010)}`, issueDate: date, dueDate: addDays(date, 14), status: 'Draft', taxRate: 0, amountPaid: 0, clientName: plan.client_name, clientAddress: plan.client_address, companyName: 'Northline Remodeling', lineItems: [{ id: crypto.randomUUID(), description: `${plan.name} · visit`, quantity: 1, rate: Number(plan.price), unitCost: 0 }], notes: '', terms: 'Net 14', servicePlanId: plan.id },
});

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '18') return;
  counter = 1010;
  const clients = tables.get('clients');
  const jobs = tables.get('jobs');
  const docs = tables.get('documents');
  const linda = clients.find((c) => c.name === 'Linda Okafor');
  const tom = clients.find((c) => c.name === 'Tom Alvarez');
  if (!linda || !tom) return;
  const plans = table(tables, 'service_plans');
  const visits = table(tables, 'service_visits');

  const make = (client, name, service, price, billing, unit, count, nextVisit, assigned, visitDate, withInvoice, extra = {}) => {
    const planId = id();
    const job = { id: id(), user_id: uid, name, client_name: client.name, client_address: client.address, client_id: client.id, status: 'active', start_date: visitDate, end_date: visitDate, worker_name: assigned || null, created_at: iso(-190) };
    jobs.push(job);
    const plan = {
      id: planId, user_id: uid, client_id: client.id, client_name: client.name, client_address: client.address, job_id: job.id, name, service, price, billing, interval_unit: unit, interval_count: count, anchor_day: Number(nextVisit.slice(8, 10)),
      next_visit: nextVisit, ends_on: null, assigned_to: assigned || null, lead_days: 14, remind_client: true, show_in_portal: true, status: 'active', invoice_source_id: null, visits_created: 3, notes: null, created_at: iso(-190), ...extra,
    };
    plans.push(plan);
    const wo = workOrder(plan, job, visitDate, client);
    docs.push(wo);
    let inv = null;
    if (withInvoice) { inv = draftInvoice(plan, job, visitDate, client); docs.push(inv); }
    visits.push({ id: id(), user_id: uid, plan_id: plan.id, job_id: job.id, scheduled_for: visitDate, status: 'scheduled', assigned_to: assigned || null, work_order_id: wo.id, invoice_id: inv && inv.id, done_at: null, created_at: iso(-3) });
    return { plan, job };
  };
  const a = make(linda, 'Spring and fall home check', 'Check the roof and gutters, test the smoke alarms, look at caulk and trim, and note what needs fixing.', 150, 'per_visit', 'month', 6, addMonths(day(5), 6), 'Jamal', day(5), true);
  // one old visit, already done (the client's portal shows it as the last visit)
  visits.push({ id: id(), user_id: uid, plan_id: a.plan.id, job_id: a.job.id, scheduled_for: day(-176), status: 'done', assigned_to: 'Jamal', work_order_id: null, invoice_id: null, done_at: iso(-176, 15), created_at: iso(-190) });
  make(tom, 'Quarterly gutter cleaning', 'Clean the gutters and downspouts at the rental, check for leaks.', 240, 'quarterly', 'month', 3, addMonths(day(11), 3), 'Eli', day(11), false);
};

// what the database does when a plan is saved: its job is created (guard_service_plan)
export const insertHooks = {
  service_plans: (row, tables) => {
    if (row.job_id) return row;
    const job = { id: crypto.randomUUID(), user_id: UID, name: row.name || 'Service plan', client_name: row.client_name, client_address: row.client_address, client_id: row.client_id, status: 'active', start_date: row.next_visit, end_date: row.next_visit, worker_name: row.assigned_to || null, created_at: new Date().toISOString() };
    table(tables, 'jobs').push(job);
    return { visits_created: 0, status: 'active', show_in_portal: true, ...row, job_id: job.id };
  },
};

export const rpc = {
  // creates the visits that are due now: visit + Work Order (+ Draft invoice when billed per visit), then the plan's next date moves on
  generate_due_service_visits: (_a, tables) => {
    const plans = table(tables, 'service_plans');
    const visits = table(tables, 'service_visits');
    const today = ymdOf(0);
    let made = 0;
    for (const plan of plans) {
      if (plan.status !== 'active') continue;
      const horizon = addDays(today, Number(plan.lead_days ?? 14));
      if (!plan.next_visit || plan.next_visit > horizon) continue;
      if (visits.some((v) => v.plan_id === plan.id && v.scheduled_for === plan.next_visit)) continue;
      const job = table(tables, 'jobs').find((j) => j.id === plan.job_id);
      if (!job) continue;
      const client = table(tables, 'clients').find((c) => c.id === plan.client_id);
      const date = plan.next_visit;
      Object.assign(job, { start_date: date, end_date: date, status: 'active' });
      const wo = workOrder(plan, job, date, client);
      table(tables, 'documents').push(wo);
      let inv = null;
      if (plan.billing === 'per_visit') { inv = draftInvoice(plan, job, date, client); table(tables, 'documents').push(inv); }
      visits.push({ id: crypto.randomUUID(), user_id: UID, plan_id: plan.id, job_id: job.id, scheduled_for: date, status: 'scheduled', assigned_to: plan.assigned_to, work_order_id: wo.id, invoice_id: inv && inv.id, done_at: null, created_at: new Date().toISOString() });
      plan.next_visit = nextAfter(plan);
      plan.visits_created = (plan.visits_created || 0) + 1;
      made++;
    }
    return made;
  },
  complete_service_visit: ({ p_visit_id, p_status }, tables) => {
    const v = table(tables, 'service_visits').find((x) => x.id === p_visit_id);
    if (!v) return undefined;
    v.status = p_status; v.done_at = p_status === 'done' ? new Date().toISOString() : null;
    if (p_status === 'done' && v.work_order_id) { const wo = table(tables, 'documents').find((d) => d.id === v.work_order_id); if (wo) wo.data.status = 'Completed'; }
    return { ok: true };
  },
  get_portal_service_plans: ({ p_key }, tables) => {
    const client = tables.get('clients').find((c) => c.portal_key === p_key);
    if (!client) return undefined;
    const list = table(tables, 'service_plans').filter((p) => p.client_id === client.id && p.show_in_portal !== false);
    if (!list.length) return undefined;
    return list.map((p) => {
      const done = table(tables, 'service_visits').filter((v) => v.plan_id === p.id && v.status === 'done').sort((x, y) => String(y.scheduled_for).localeCompare(String(x.scheduled_for)))[0];
      const upcoming = table(tables, 'service_visits').filter((v) => v.plan_id === p.id && v.status === 'scheduled').sort((x, y) => String(x.scheduled_for).localeCompare(String(y.scheduled_for)))[0];
      return { id: p.id, name: p.name, service: p.service, price: p.price, billing: p.billing, interval_unit: p.interval_unit, interval_count: p.interval_count, status: p.status, next_visit: upcoming ? upcoming.scheduled_for : p.next_visit, last_visit: done ? done.scheduled_for : null };
    });
  },
};
