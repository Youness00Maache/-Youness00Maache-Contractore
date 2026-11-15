// Demo data for chapter 22 (subcontractors, subcontracts, quotes). Everything here is made up. Only built for chapter 22.
//
//  - Crew: 2 workers (Jamal, Eli) and 2 subcontractors: Luis Ramirez ("Ramirez Electric", Electrical) and Dana Cole ("Cole Plumbing", Plumbing),
//    each with a crew link (rpc crew_links). Luis's link is the real phone page /clock/<RAMIREZ_TOKEN> (crew_portal_get / crew_sub_get / crew_sub_accept).
//  - Job "Nair Master Bath": two subcontracts of Cole Plumbing ("Plumbing rough-in": Accepted, $1,000 paid; "Water heater swap": In progress and overdue), and 3 quotes for
//    the scope "Electrical rough-in": Volt and Sons 4,100 (expired), Bright Wire Co 4,350 (no inclusions or exclusions listed),
//    Ramirez Electric 4,700 (fastest, best value). The chapter then types a new subcontract for Ramirez ("Electrical rough-in and fixtures").
//  - Hooks make the rows behave like the database does: statuses stamp their times, payments add up to paid_total, quotes get a scope_key.

import { pinJobs, table } from './_helpers-b.mjs';

export const RAMIREZ_TOKEN = 'RamirezSubLinkDemoToken' + '0'.repeat(17); // a crew link token is 40 characters
const MINE = new Set(['22']);
const scopeKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
const tokenOf = (m) => (m.name === 'Luis Ramirez' ? RAMIREZ_TOKEN : (String(m.id).replace(/-/g, '') + '0000000000000000').slice(0, 40));

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (!MINE.has(chapter)) return;
  pinJobs(tables); // /jobs/<NAIR_ID>#subs works after a phone scene
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;

  // ---- crew (replaces whatever another chapter's demo module put there)
  const crew = table(tables, 'crew_members');
  crew.length = 0;
  const member = (name, extra) => ({ id: id(), user_id: uid, name, phone: '', email: '', cost_rate: null, active: true, link_nonce: 'n-' + name.replace(/\W/g, ''), link_created_at: iso(-20), last_seen_at: iso(-1, 8), created_at: iso(-30), kind: 'employee', company: '', trade: '', ...extra });
  const jamal = member('Jamal', { phone: '(555) 010-5101', cost_rate: 28 });
  const eli = member('Eli', { phone: '(555) 010-5102', cost_rate: 24 });
  const luis = member('Luis Ramirez', { phone: '(555) 010-5103', email: 'luis@ramirez-electric.example', kind: 'subcontractor', company: 'Ramirez Electric', trade: 'Electrical' });
  const dana = member('Dana Cole', { phone: '(555) 010-5104', email: 'dana@cole-plumbing.example', kind: 'subcontractor', company: 'Cole Plumbing', trade: 'Plumbing' });
  crew.push(jamal, eli, luis, dana);
  table(tables, 'crew_assignments').length = 0;

  // ---- subcontracts on the Nair job
  const commits = table(tables, 'sub_commitments');
  const commit = (m, title, description, amount, ret, status, extra = {}) => ({
    id: id(), user_id: uid, job_id: nair.id, crew_member_id: m.id, sub_name: m.company, title, description, amount, retainage_pct: ret, start_date: null, due_date: null, status,
    payments: [], paid_total: 0, issued_at: null, accepted_at: null, accepted_by: null, completed_at: null, cancelled_at: null, quote_id: null, notes: null, created_at: iso(-8), updated_at: iso(-3), ...extra,
  });
  commits.push(
    commit(dana, 'Plumbing rough-in and fixtures', 'Rough-in the new shower valve, vanity supply and drain. Set the fixtures we pick.', 3200, 10, 'accepted', {
      start_date: day(-3), due_date: day(6), issued_at: iso(-6, 9), accepted_at: iso(-4, 15), accepted_by: 'Dana Cole',
      payments: [{ id: id(), at: day(-2), amount: 1000, note: 'Deposit, check 1038' }], paid_total: 1000, notes: 'Dana prefers checks on Fridays.',
    }),
    commit(dana, 'Water heater swap', 'Replace the old tank with a 50 gallon heater and haul the old one away.', 900, 0, 'in_progress', {
      start_date: day(-6), due_date: day(-1), issued_at: iso(-8, 9), accepted_at: iso(-7, 15), accepted_by: 'Dana Cole',
    }),
  );

  // ---- quotes for one scope
  const quotes = table(tables, 'job_quotes');
  const quote = (vendor, m, amount, lead, valid, incl, excl, received, extra = {}) => ({
    id: id(), user_id: uid, job_id: nair.id, scope: 'Electrical rough-in', scope_key: scopeKey('Electrical rough-in'), vendor_name: vendor, crew_member_id: m ? m.id : null, supplier_id: null, amount,
    inclusions: incl, exclusions: excl, notes: null, lead_time_days: lead, valid_until: valid, received_on: received, url: null, file_path: null, file_name: null, size_bytes: null,
    status: 'received', chosen_at: null, created_at: iso(-10 + Math.round(amount / 1000)), ...extra,
  });
  quotes.push(
    quote('Volt and Sons', null, 4100, 3, day(-7), 'Labor and wire', 'Permit', day(-12)),
    quote('Bright Wire Co', null, 4350, 12, day(14), null, null, day(-4)),
    quote('Ramirez Electric', luis, 4700, 5, day(30), 'Labor, wire, devices and cleanup', 'Permit and fixtures', day(-6)),
  );
};

// ---- what the database does on its own
export const insertHooks = {
  sub_commitments: (row, tables) => {
    const m = row.crew_member_id && (tables.get('crew_members') || []).find((x) => x.id === row.crew_member_id);
    const now = new Date().toISOString();
    return {
      payments: [], paid_total: 0, accepted_at: null, accepted_by: null, completed_at: null, cancelled_at: null, ...row,
      sub_name: row.sub_name || (m ? (m.company || m.name) : ''), issued_at: row.status === 'issued' ? now : null, updated_at: now,
    };
  },
  job_quotes: (row) => ({ chosen_at: null, file_path: null, file_name: null, size_bytes: null, ...row, scope_key: scopeKey(row.scope) }),
};
export const patchHooks = {
  sub_commitments: (row, patch) => {
    const now = new Date().toISOString();
    if (patch.payments) row.paid_total = Math.round(patch.payments.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
    if (patch.status) {
      if (patch.status === 'issued') { row.issued_at = row.issued_at || now; row.accepted_at = null; row.accepted_by = null; }
      if (patch.status === 'draft') { row.issued_at = null; row.accepted_at = null; row.accepted_by = null; }
      if (patch.status === 'completed') row.completed_at = now;
      if (patch.status === 'cancelled') row.cancelled_at = now;
      if (patch.status === 'in_progress') row.completed_at = null;
    }
    // changing the terms of an accepted subcontract sends it back to "Sent" (the app also says so); keep the database's own rule here
    if (!patch.status && row.status === 'accepted' && ['amount', 'title', 'description', 'retainage_pct', 'start_date', 'due_date'].some((k) => k in patch)) { row.status = 'issued'; row.accepted_at = null; row.accepted_by = null; }
  },
  job_quotes: (row, patch) => {
    if ('scope' in patch) row.scope_key = scopeKey(row.scope);
    if (patch.status === 'chosen') row.chosen_at = new Date().toISOString();
  },
};

// ---- the crew link pages (a worker or a sub opens /clock/<token> on a phone, no login)
const memberOfToken = (tables, token) => (tables.get('crew_members') || []).find((m) => tokenOf(m) === token) || null;
const jobOf = (tables, jobId) => tables.get('jobs').find((j) => j.id === jobId) || {};
const linkCommit = (c, tables) => ({
  id: c.id, job_id: c.job_id, job_name: jobOf(tables, c.job_id).name || '', job_address: jobOf(tables, c.job_id).client_address || '', job_status: jobOf(tables, c.job_id).status || 'active',
  title: c.title, description: c.description, amount: c.amount, retainage_pct: c.retainage_pct, start_date: c.start_date, due_date: c.due_date, status: c.status, paid_total: c.paid_total,
  issued_at: c.issued_at, accepted_at: c.accepted_at, accepted_by: c.accepted_by, completed_at: c.completed_at, tasks_done: 0, tasks_total: 0,
});
export const rpc = {
  crew_links: (_a, tables) => {
    const list = (tables.get('crew_members') || []).filter((m) => m.link_nonce).map((m) => ({ member_id: m.id, token: tokenOf(m) }));
    return list.length ? list : undefined;
  },
  crew_member_link: (a, tables) => {
    const m = (tables.get('crew_members') || []).find((x) => x.id === a.p_member_id);
    return m ? { token: a.p_action === 'off' ? null : tokenOf(m) } : undefined;
  },
  crew_portal_get: (a, tables) => {
    const m = memberOfToken(tables, a.p_token);
    if (!m) return undefined;
    return { member: { name: m.name }, company: { name: 'Northline Remodeling', logo_url: '', phone: '(555) 010-2000' }, paused: false, server_now: new Date().toISOString(), jobs: [], punches: [] };
  },
  crew_tasks_get: (a, tables) => (memberOfToken(tables, a.p_token) ? { server_now: new Date().toISOString(), tasks: [], jobs: [] } : undefined),
  crew_sub_get: (a, tables) => {
    const m = memberOfToken(tables, a.p_token);
    if (!m || m.kind !== 'subcontractor') return undefined;
    const mine = (tables.get('sub_commitments') || []).filter((c) => c.crew_member_id === m.id && c.status !== 'draft').sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
    return { server_now: new Date().toISOString(), member: { name: m.name, company: m.company, trade: m.trade, is_subcontractor: true }, commitments: mine.map((c) => linkCommit(c, tables)) };
  },
  crew_sub_accept: (a, tables) => {
    const m = memberOfToken(tables, a.p_token);
    const c = m && (tables.get('sub_commitments') || []).find((x) => x.id === a.p_commitment_id && x.crew_member_id === m.id);
    if (!c) return undefined;
    if (c.status === 'issued') Object.assign(c, { status: 'accepted', accepted_at: new Date().toISOString(), accepted_by: a.p_name || m.name });
    return linkCommit(c, tables);
  },
};
