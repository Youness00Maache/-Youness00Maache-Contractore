// Demo data for chapter 15 (crew clock-in links and time sheets). Only built for chapter 15 (GET /__reset?chapter=15).
//
//  - crew members Jamal Wright (Whitfield Kitchen Remodel) and Eli Brooks (Nair Master Bath), each with a clock-in link that is ON;
//  - a week of punches (Monday up to yesterday, New York time): Jamal works long days, so he has overtime; Eli forgot to clock out one day
//    (the shift is flagged "Add clock-out") and has one punch far from the job (Nair has a pin on the map); Whitfield has NO pin yet, the
//    chapter sets it;
//  - a task given to Jamal ("Under-cabinet lighting"), so the worker's phone page shows "My tasks" with Start and Done;
//  - no time sheet yet this week, so "Create time sheet" shows;
//  - the REAL worker page /clock/<token> (what the worker sees on a phone): crew_portal_get / crew_punch / crew_tasks_get / crew_task_update.
//  The profile is already Premium + AI (seed.mjs).

export const WORKER_TOKEN = ('jamal-clock-link-' + 'a'.repeat(40)).slice(0, 40);
const UID = '00000000-0000-4000-8000-000000000001';
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

let ctxRef = null;
const workerPunches = []; // punches made on the worker page during the recording

/** The instant at which the wall clock in New York (the recording browser's time zone) shows `ymd hh:mm`. */
const nyInstant = (ymd, hh, mm) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (asUtc - guess)).toISOString();
};
const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const addDaysYmd = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default ({ tables, uid, iso, id, chapter }) => {
  ctxRef = null;
  if (chapter !== '15') return;
  ctxRef = { tables };
  workerPunches.length = 0;
  const jobs = tables.get('jobs');
  const kitchen = jobs.find((j) => j.name === 'Whitfield Kitchen Remodel');
  const nair = jobs.find((j) => j.name === 'Nair Master Bath');
  if (!kitchen || !nair) return;

  const crew = table(tables, 'crew_members');
  const member = (name, phone, rate) => ({ id: id(), user_id: uid, name, phone, email: null, cost_rate: rate, active: true, link_nonce: 'n-' + name.split(' ')[0].toLowerCase(), link_created_at: iso(-20), last_seen_at: iso(-1, 16), created_at: iso(-60) });
  const jamal = member('Jamal Wright', '(555) 010-5101', 32);
  const eli = member('Eli Brooks', '(555) 010-5102', 28);
  crew.push(jamal, eli);
  table(tables, 'crew_assignments').push(
    { id: id(), user_id: uid, member_id: jamal.id, job_id: kitchen.id, starts_on: null, ends_on: null },
    { id: id(), user_id: uid, member_id: eli.id, job_id: nair.id, starts_on: null, ends_on: null },
  );
  ctxRef.jamal = jamal; ctxRef.kitchen = kitchen; ctxRef.nair = nair;
  ctxRef.deck = jobs.find((j) => j.name === 'Halvorsen Deck Estimate') || null; // a second job for "Switch here"

  // a pin on Nair Master Bath (Whitfield has none: the chapter sets it)
  const NAIR_PIN = { lat: 39.9612, lng: -82.9988 };
  table(tables, 'crew_job_sites').push({ id: id(), user_id: uid, job_id: nair.id, lat: NAIR_PIN.lat, lng: NAIR_PIN.lng, radius_m: 300, label: 'Pinned at the site' });

  // a task for Jamal (the worker page shows it under "My tasks")
  const tasks = table(tables, 'job_tasks');
  const lights = tasks.find((t) => t.job_id === kitchen.id && t.title === 'Under-cabinet lighting');
  if (lights) lights.crew_member_id = jamal.id;

  // the week's punches: Monday .. yesterday
  const today = nyToday();
  const dow = new Date(today + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
  const mondayOff = -((dow + 6) % 7);
  const days = [];
  for (let off = mondayOff; off <= -1; off++) days.push(off);
  const punches = table(tables, 'time_punches');
  const P = (member_, job, kind, ymd, hh, mm, extra = {}) => {
    const at = nyInstant(ymd, hh, mm);
    return { id: id(), client_id: id().replace(/-/g, ''), user_id: uid, member_id: member_.id, job_id: job.id, kind, at, original_at: at, lat: null, lng: null, accuracy_m: null, location_status: 'skipped', distance_m: null, note: null, photo_path: null, source: 'crew', edited_at: null, approved_at: null, timesheet_id: null, ...extra };
  };
  const near = (pin) => ({ lat: pin.lat + 0.0006, lng: pin.lng + 0.0004, accuracy_m: 18, location_status: 'ok', distance_m: 70 });
  days.forEach((off, i) => {
    const ymd = addDaysYmd(today, off);
    const wd = new Date(ymd + 'T12:00:00Z').getUTCDay();
    if (wd === 0) return; // Sunday: nobody works
    if (wd === 6) { // Saturday: a half day for Jamal
      punches.push(P(jamal, kitchen, 'in', ymd, 8, 0), P(jamal, kitchen, 'out', ymd, 13, 0));
      return;
    }
    // Jamal: 7:00 to 17:00 with a half-hour break (9.5 h a day)
    punches.push(P(jamal, kitchen, 'in', ymd, 7, 0), P(jamal, kitchen, 'break_start', ymd, 12, 0), P(jamal, kitchen, 'break_end', ymd, 12, 30), P(jamal, kitchen, 'out', ymd, 17, 0));
    // Eli: 7:30 to 15:30; one day he forgets to clock out; one day his phone says he was far away
    const forgot = i === Math.min(1, days.length - 1);
    const far = i === Math.min(2, days.length - 1) && !forgot;
    punches.push(P(eli, nair, 'in', ymd, 7, 30, near(NAIR_PIN)));
    if (!forgot) punches.push(P(eli, nair, 'out', ymd, 15, 30, far ? { lat: NAIR_PIN.lat + 0.03, lng: NAIR_PIN.lng + 0.04, accuracy_m: 25, location_status: 'ok', distance_m: 5100 } : near(NAIR_PIN)));
  });
};

// ---- the worker's own page (/clock/<token>): the answers of the public functions ---------------------------------
const isMe = (t) => t === WORKER_TOKEN;

export const rpc = {
  crew_portal_get: ({ p_token }, tables) => {
    if (!isMe(p_token) || !ctxRef || !ctxRef.jamal) return undefined;
    const { kitchen } = ctxRef;
    const mine = (tables.get('time_punches') || []).filter((p) => p.member_id === ctxRef.jamal.id && new Date(p.at).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === nyToday());
    return {
      member: { name: ctxRef.jamal.name }, company: { name: 'Northline Remodeling', logo_url: '', phone: '(555) 010-2000' }, paused: false, server_now: new Date().toISOString(),
      jobs: [{ id: kitchen.id, name: kitchen.name, address: kitchen.client_address, status: 'active', from: kitchen.start_date, to: kitchen.end_date, assigned: true, site: null }, ...(ctxRef.deck ? [{ id: ctxRef.deck.id, name: ctxRef.deck.name, address: ctxRef.deck.client_address, status: 'active', from: new Date(Date.now() - 86400000).toISOString().slice(0, 10), to: null, assigned: true, site: null }] : [])],
      punches: [...mine, ...workerPunches].map((p) => ({ id: p.id, client_id: p.client_id, job_id: p.job_id, kind: p.kind, at: p.at, location: p.location_status, distance_m: p.distance_m, note: p.note })),
    };
  },
  crew_punch: (a, tables) => {
    if (!isMe(a.p_token) || !ctxRef || !ctxRef.jamal) return undefined;
    const row = { id: crypto.randomUUID(), client_id: a.p_client_id, user_id: UID, member_id: ctxRef.jamal.id, job_id: a.p_job_id || ctxRef.kitchen.id, kind: a.p_kind, at: a.p_at, original_at: a.p_at, lat: a.p_lat, lng: a.p_lng, accuracy_m: a.p_accuracy, location_status: a.p_location || 'skipped', distance_m: null, note: a.p_note || null, photo_path: null, source: 'crew', edited_at: null, approved_at: null, timesheet_id: null };
    workerPunches.push(row);
    table(tables, 'time_punches').push(row);
    return { punch: { id: row.id }, upload_path: null, duplicate: false };
  },
  crew_tasks_get: ({ p_token }, tables) => {
    if (!isMe(p_token) || !ctxRef || !ctxRef.jamal) return undefined;
    const mine = (tables.get('job_tasks') || []).filter((t) => t.crew_member_id === ctxRef.jamal.id && t.status !== 'done');
    return {
      server_now: new Date().toISOString(),
      tasks: mine.map((t) => ({ id: t.id, job_id: t.job_id, job_name: ctxRef.kitchen.name, job_address: ctxRef.kitchen.client_address, job_status: 'active', title: t.title, notes: t.notes, status: t.status, start_date: t.start_date, due_date: t.due_date, is_milestone: !!t.is_milestone, completed_at: t.completed_at, has_photo: false, waiting_on: 0, comments: [] })),
    };
  },
  crew_task_update: (a, tables) => {
    if (!isMe(a.p_token)) return undefined;
    const t = (tables.get('job_tasks') || []).find((x) => x.id === a.p_task_id);
    if (!t) return undefined;
    if (a.p_status) { t.status = a.p_status; t.completed_at = a.p_status === 'done' ? new Date().toISOString() : null; }
    return { task: { id: t.id, status: t.status, completed_at: t.completed_at, has_photo: false }, upload_path: null };
  },
  // the owner's "New link" / "Turn off link" buttons
  crew_member_link: (a, tables) => {
    if (!ctxRef) return undefined; // only while chapter 15 is built
    const m = (tables.get('crew_members') || []).find((x) => x.id === a.p_member_id);
    if (!m) return undefined;
    if (a.p_action === 'off') { m.link_nonce = null; return { ok: true, token: null }; }
    m.link_nonce = 'n-' + Math.random().toString(36).slice(2, 8);
    return { ok: true, token: `demo-clock-in-${String(m.id).slice(0, 8)}` };
  },
};

// a new crew member gets a link (what the database does when the row is inserted)
export const insertHooks = {
  crew_members: (row) => ({ active: true, link_nonce: 'n-' + Math.random().toString(36).slice(2, 8), link_created_at: row.created_at, last_seen_at: null, ...row }),
};
