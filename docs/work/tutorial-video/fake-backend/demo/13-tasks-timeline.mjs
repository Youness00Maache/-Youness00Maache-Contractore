// Demo data for chapter 13 (job tasks and the job timeline). Only built for chapter 13 (GET /__reset?chapter=13).
//
// Builds on "Whitfield Kitchen Remodel" (08-send-and-portal.mjs gives it 12 tasks, 4 photos, 3 sent emails; 02 gives it a signed change order):
//   - crew members Jamal and Eli (so "@Jamal" on a quick-added task is understood, and "Who" has names);
//   - the tasks get what the narration talks about: a chain of tasks that wait for each other (Template countertops -> Countertops installed
//     -> Tile backsplash -> Under-cabinet lighting), one Blocked task, one late task, an Electrical inspection milestone;
//   - a rich timeline: a daily report with hours, a note, a reminder e-mail, two days of clock-in punches for Jamal;
//   - the canned AI answer for "Note to tasks" (3 tasks).
// The profile is already Premium + AI (seed.mjs), so Tasks, templates and Note to tasks are all unlocked.

const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '13') return;
  const kitchen = tables.get('jobs').find((j) => j.name === 'Whitfield Kitchen Remodel');
  if (!kitchen) return;

  // ---- crew
  const crew = table(tables, 'crew_members');
  const member = (name, phone, rate) => ({ id: id(), user_id: uid, name, phone, email: null, cost_rate: rate, active: true, link_nonce: 'n-' + name.toLowerCase(), link_created_at: iso(-20), last_seen_at: iso(-1, 16), created_at: iso(-60) });
  const jamal = member('Jamal Wright', '(555) 010-5101', 32);
  const eli = member('Eli Brooks', '(555) 010-5102', 28);
  crew.push(jamal, eli);
  table(tables, 'crew_assignments').push(
    { id: id(), user_id: uid, member_id: jamal.id, job_id: kitchen.id, starts_on: null, ends_on: null },
    { id: id(), user_id: uid, member_id: eli.id, job_id: kitchen.id, starts_on: null, ends_on: null },
  );

  // ---- tasks
  const tasks = table(tables, 'job_tasks');
  const of = (title) => tasks.find((t) => t.job_id === kitchen.id && t.title === title);
  const template = of('Template countertops');
  const counters = of('Countertops installed');
  const backsplash = of('Tile backsplash');
  const lights = of('Under-cabinet lighting');
  const paint = of('Paint and touch-up');
  if (template) { template.crew_member_id = jamal.id; template.status = 'doing'; template.due_date = day(1); template.start_date = day(-1); }
  if (counters) { counters.depends_on = template ? [template.id] : []; counters.due_date = day(4); counters.start_date = day(4); }
  if (backsplash) { backsplash.depends_on = counters ? [counters.id] : []; backsplash.crew_member_id = eli.id; backsplash.start_date = day(5); backsplash.due_date = day(7); }
  if (lights) { lights.depends_on = backsplash ? [backsplash.id] : []; lights.start_date = day(8); lights.due_date = day(9); lights.crew_member_id = jamal.id; }
  if (paint) { paint.status = 'blocked'; paint.start_date = day(10); paint.due_date = day(11); }
  const T = (title, status, start, due, milestone, extra = {}) => ({
    id: id(), user_id: uid, job_id: kitchen.id, title, notes: null, status, due_date: due == null ? null : day(due), start_date: start == null ? null : day(start), is_milestone: !!milestone,
    depends_on: [], sort_order: 20 + tasks.length, completed_at: null, source: 'manual', crew_member_id: null, created_at: iso(-12), updated_at: iso(-2), ...extra,
  });
  tasks.push(
    T('Order backsplash tile', 'todo', -8, -4, false, { crew_member_id: eli.id }),
    T('Electrical inspection', 'todo', null, 5, true),
  );

  // ---- the timeline: a day on site (daily report with hours), a note, a reminder, two days of punches
  const docs = tables.get('documents');
  const sarah = tables.get('clients').find((c) => c.name === 'Sarah Whitfield');
  const doc = (type, data, created, extra = {}) => ({ id: id(), user_id: uid, job_id: kitchen.id, client_id: sarah && sarah.id, type, data, created_at: iso(created, 17), updated_at: iso(created, 17), public_token: id().replace(/-/g, '').slice(0, 24), ...extra });
  docs.push(
    doc('Daily Job Report', {
      reportNumber: 'DR-1007', date: day(-2), title: 'Cabinets set, countertop template', projectName: kitchen.name, weather: 'Sunny', temperature: '58°F', crewSize: 3, laborHours: 24,
      content: '<p>Set the last two wall cabinets and checked every door. Templated the countertops with the fabricator. Cleaned up and covered the floor.</p>', tags: [],
    }, -2),
    doc('Note', { title: 'Sarah asked to move the plumber to Thursday', content: '<p>Sarah called. She would like the plumber to come on Thursday instead of Wednesday, because she is home that day.</p>', noteAt: iso(-1, 11), conversationNote: true, tags: ['Conversation'] }, -1),
  );
  const inv = docs.find((d) => d.type === 'Invoice' && d.data.invoiceNumber === 'INV-2081');
  table(tables, 'reminders').push({
    id: id(), user_id: uid, kind: 'invoice', document_id: inv && inv.id, job_id: kitchen.id, client_id: sarah && sarah.id, step_key: 'due_today', scheduled_for: day(0), dedupe_key: 'demo-' + id(),
    status: 'sent', reason: null, attempts: 1, to_email: 'sarah.whitfield@example.com', subject: 'Invoice INV-2081 is due today', sent_at: iso(0, 8), created_at: iso(0, 8), updated_at: iso(0, 8),
  });
  const at = (offsetDays, h, m) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const punches = table(tables, 'time_punches');
  const punch = (kind, when) => ({ id: id(), client_id: id().replace(/-/g, ''), user_id: uid, member_id: jamal.id, job_id: kitchen.id, kind, at: when, original_at: when, lat: null, lng: null, accuracy_m: null, location_status: 'skipped', distance_m: null, note: null, photo_path: null, source: 'crew', edited_at: null, approved_at: null, timesheet_id: null });
  for (const off of [-1, -2]) punches.push(punch('in', at(off, 7, 12)), punch('break_start', at(off, 12, 0)), punch('break_end', at(off, 12, 30)), punch('out', at(off, 16, 8)));
};

export const functions = {
  // "Note to tasks" (Premium + AI): the assistant reads the note and proposes three tasks; nothing is saved until the owner presses Add
  'ai-assistant': async (args, tables) => {
    if (!args || args.task !== 'extract_tasks') return undefined;
    const crew = (args.context && args.context.crew) || [];
    const eli = crew.find((m) => /^eli/i.test(m.name));
    const ymd = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); };
    const nextMonday = (() => { const d = new Date(); const add = (8 - d.getDay()) % 7 || 7; return ymd(add); })();
    const friday = (() => { const d = new Date(); const add = (5 - d.getDay() + 7) % 7 || 7; return ymd(add); })();
    return {
      ok: true, task: 'extract_tasks',
      reply_text: 'I found 3 tasks in your note. Check the names and dates, then add them.',
      tasks: [
        { title: 'Pour the footings', due_date: nextMonday, is_milestone: false, notes: null, crew_member_id: null, assignee_name: null, depends_on: [] },
        { title: 'Order the windows', due_date: friday, is_milestone: false, notes: null, crew_member_id: eli ? eli.id : null, assignee_name: eli ? eli.name : 'Eli', depends_on: [] },
        { title: 'Inspection', due_date: ymd(5), is_milestone: true, notes: null, crew_member_id: null, assignee_name: null, depends_on: [0] },
      ],
    };
  },
};
