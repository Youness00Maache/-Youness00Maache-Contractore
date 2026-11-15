// Demo data for chapter 10 (request-a-quote link, leads board, appointments). Everything here is made up.
//
//  - The request link: slug "northline-remodeling", intro text, page on. The REAL public page /r/northline-remodeling works through
//    get_request_page / submit_quote_request (a submitted request becomes a "new" lead on the board, like the database does).
//  - The leads board: 02-dashboard-navigation.mjs already seeds 2 leads (Marcus Webb new, Hannah Brooks contacted, follow-up today).
//    This adds 6 more so every column has something (one follow-up overdue = red), and the leads become 8; the page submission in
//    chapter 10 makes the 9th. Two appointments: Priya Shah's site visit tomorrow 9:30 (overlaps the default 9:00 booking of the form,
//    so the "overlaps another appointment" note shows) and an estimate meeting for Owen Fisher.
//  - convert_quote_request: client matched or created + an active job, the lead moves to Won and keeps the job (like the database function).

export const REQUEST_SLUG = 'northline-remodeling';
const DEFAULT_INTRO = 'Tell us what you need and we will call you back within one business day.';
let page = { slug: REQUEST_SLUG, enabled: true, intro: DEFAULT_INTRO, tier: 'ai' };

const CONTRACTOR = { name: 'Marcus Reed', company_name: 'Northline Remodeling', logo_url: '', phone: '(555) 010-2000', email: 'marcus@northline-demo.example', website: 'northline-demo.example' };
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

/** The instant at which the wall clock in New York (the recording browser's time zone) shows `ymd hh:mm`. */
const nyInstant = (ymd, hh, mm) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asUtc - guess)).toISOString();
};
const nyDay = (offset) => new Date(Date.now() + offset * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export default ({ tables, uid, day, iso, id }) => {
  page = { slug: REQUEST_SLUG, enabled: true, intro: DEFAULT_INTRO, tier: 'ai' };
  const ago = (days, hour = 10) => iso(-days, hour);
  const clients = tables.get('clients');
  const jobs = tables.get('jobs');
  const leads = table(tables, 'quote_requests');
  const lead = (name, phone, email, address, details, origin, stage, extra = {}) => ({
    id: id(), user_id: uid, name, phone, email, address, details, photo_paths: [], source: origin === 'request_page' ? 'link' : 'manual', status: stage === 'won' ? 'converted' : 'seen',
    stage, lead_source: origin, budget_min: null, budget_max: null, follow_up_on: null, lost_reason: null, notes: '', attachments: [], last_contact_at: null, client_id: null, job_id: null,
    created_at: ago(6), updated_at: ago(2), stage_changed_at: ago(2), ...extra,
  });
  const greg = clients.find((c) => c.name === 'Greg Halvorsen');
  const linda = clients.find((c) => c.name === 'Linda Okafor');
  const deckJob = jobs.find((j) => j.name === 'Halvorsen Deck Estimate');
  const basementJob = jobs.find((j) => j.name === 'Okafor Basement Finish');

  const priya = lead('Priya Shah', '(555) 010-4411', 'priya.shah@example.com', '31 Linden Avenue, Maple Grove, OH', 'Built-in shelving for a walk-in closet, about 8 feet wide.', 'referral', 'appointment_set',
    { budget_min: 4000, budget_max: 6000, created_at: ago(5), last_contact_at: ago(3), stage_changed_at: ago(3) });
  const owen = lead('Owen Fisher', '(555) 010-4412', 'owen.fisher@example.com', '9 Quarry Hill, Lakeside, OH', 'Kitchen refresh: paint the cabinets and put on new hardware.', 'request_page', 'quote_sent',
    { budget_min: 6000, budget_max: 9000, follow_up_on: day(2), created_at: ago(9), last_contact_at: ago(2), stage_changed_at: ago(2) });
  leads.push(
    lead('Mike Dunn', '(555) 010-4413', 'mike.dunn@example.com', '58 Cooper Lane, Maple Grove, OH', 'Replace the storm door and the trim around it.', 'phone', 'contacted',
      { budget_min: 900, budget_max: 1400, follow_up_on: day(-2), created_at: ago(7), last_contact_at: ago(4), stage_changed_at: ago(4) }),
    priya, owen,
    lead('Greg Halvorsen', '(555) 010-3105', 'greg.halvorsen@example.com', '8 Quarry Hill, Lakeside, OH', 'Build a deck next spring.', 'referral', 'won',
      { budget_min: 12000, budget_max: 16000, client_id: greg && greg.id, job_id: deckJob && deckJob.id, converted_at: ago(2), created_at: ago(14), stage_changed_at: ago(2) }),
    lead('Linda Okafor', '(555) 010-3104', 'linda.okafor@example.com', '60 Willow Way, Maple Grove, OH', 'Finish the basement: walls, floor and lighting.', 'referral', 'won',
      { budget_min: 12000, budget_max: 16000, client_id: linda && linda.id, job_id: basementJob && basementJob.id, converted_at: ago(80), created_at: ago(84), stage_changed_at: ago(80) }),
    lead('Carl Evans', '(555) 010-4414', 'carl.evans@example.com', '22 Mill Road, Lakeside, OH', 'Repaint the whole outside of the house.', 'website', 'lost',
      { budget_min: 9000, budget_max: 12000, lost_reason: 'Went with another contractor', created_at: ago(20), stage_changed_at: ago(10) }),
    lead('Tina Wu', '(555) 010-4415', 'tina.wu@example.com', '5 Harbor Road, Lakeside, OH', 'Replace six old windows.', 'phone', 'lost',
      { budget_min: 5000, budget_max: 7000, lost_reason: 'Price too high', created_at: ago(26), stage_changed_at: ago(16) }),
  );

  const appts = table(tables, 'appointments');
  appts.push(
    { id: id(), user_id: uid, lead_id: priya.id, job_id: null, client_id: null, kind: 'site_visit', title: 'Site visit: Priya Shah', notes: '', location: priya.address, starts_at: nyInstant(nyDay(1), 9, 30), ends_at: nyInstant(nyDay(1), 10, 30), status: 'scheduled', created_at: ago(3), updated_at: ago(3) },
    { id: id(), user_id: uid, lead_id: owen.id, job_id: null, client_id: null, kind: 'estimate', title: 'Estimate meeting: Owen Fisher', notes: '', location: owen.address, starts_at: nyInstant(nyDay(3), 14, 0), ends_at: nyInstant(nyDay(3), 15, 0), status: 'scheduled', created_at: ago(2), updated_at: ago(2) },
  );
};

export const rpc = {
  get_my_request_page: (_a, tables) => ({ ...page, new_count: (tables.get('quote_requests') || []).filter((r) => r.status === 'new').length }),
  update_request_page: (a) => {
    if (a && a.p_enabled !== null && a.p_enabled !== undefined) page.enabled = !!a.p_enabled;
    if (a && a.p_intro !== null && a.p_intro !== undefined) page.intro = String(a.p_intro);
    return { ...page, new_count: 0 };
  },
  // the PUBLIC request page (what a customer sees after scanning the QR code)
  get_request_page: (a) => (a && a.p_slug === page.slug ? { slug: page.slug, enabled: page.enabled, intro: page.intro, branded: true, contractor: CONTRACTOR } : undefined),
  submit_quote_request: (a, tables) => {
    if (!a || a.p_slug !== page.slug) return undefined;
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(), user_id: '00000000-0000-4000-8000-000000000001', name: a.p_name, phone: a.p_phone, email: a.p_email, address: a.p_address, details: a.p_details, photo_paths: [],
      source: a.p_source || 'link', status: 'new', stage: 'new', lead_source: 'request_page', budget_min: null, budget_max: null, follow_up_on: null, lost_reason: null, notes: '', attachments: [],
      last_contact_at: null, client_id: null, job_id: null, created_at: now, updated_at: now, stage_changed_at: now,
    };
    table(tables, 'quote_requests').push(row);
    return { request_id: row.id, upload_paths: [] };
  },
  convert_quote_request: (a, tables) => {
    const lead = (tables.get('quote_requests') || []).find((r) => r.id === a.p_request_id);
    if (!lead) return undefined;
    const clients = tables.get('clients');
    const now = new Date().toISOString();
    let client = clients.find((c) => (lead.email && c.email === lead.email) || c.name.toLowerCase() === String(lead.name).toLowerCase());
    if (!client) {
      client = { id: crypto.randomUUID(), user_id: lead.user_id, name: lead.name, email: lead.email || '', phone: lead.phone || '', address: lead.address || '', notes: '', portal_key: 'demo-portal-' + crypto.randomUUID().replace(/-/g, '').slice(0, 24), created_at: now };
      clients.push(client);
    }
    const start = a.p_start_date || now.slice(0, 10);
    const job = { id: crypto.randomUUID(), user_id: lead.user_id, name: a.p_job_name || `${lead.name}: ${lead.details}`.slice(0, 80), client_name: client.name, client_address: lead.address || client.address, client_id: client.id, status: 'active', start_date: start, end_date: null, worker_name: null, created_at: now };
    tables.get('jobs').push(job);
    Object.assign(lead, { status: 'converted', stage: 'won', client_id: client.id, job_id: job.id, converted_at: now, updated_at: now, stage_changed_at: now });
    return { job, client, client_skipped: null, already: false };
  },
};
