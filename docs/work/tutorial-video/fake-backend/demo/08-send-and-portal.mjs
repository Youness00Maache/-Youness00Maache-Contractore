// Demo data for chapter 8 (sending documents, the client portal) and the pieces chapters 9 and 11 reuse. Everything is made up.
//
//  - Gmail: a fake `gmail` edge function. Not connected at first (the Communication page shows "Connect Gmail"); the callback page
//    /gmail-callback?code=...&state=... (the real last step of connecting) "connects" it; sending answers success.
//  - Sarah Whitfield's job "Whitfield Kitchen Remodel": 12 tasks (5 done, 5 milestones), shared photos, sent-email log (3 rows).
//  - The REAL client portal (/?portal=<key>) through the get_portal_* answers: documents, project dashboard, a question, a drawing to approve,
//    a selection with 3 tile options, a shared ideas board. The answers the client sends (answer_portal_question, choose_portal_selection) are kept.
//  - Sarah's portal key is made 32 characters long (the project dashboard needs >= 32).

export const SARAH_PORTAL_KEY = 'demo-portal-sarah-whitfield-0001';
export const GMAIL_ADDRESS = 'marcus.reed@northline-demo.example';
const CONTRACTOR = { name: 'Marcus Reed', company_name: 'Northline Remodeling', logo_url: '', phone: '(555) 010-2000', email: 'marcus@northline-demo.example', website: 'northline-demo.example', address: '418 Cedar Street, Maple Grove, OH 45000' };

let gmailConnected = false;
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

export default ({ tables, uid, day, iso, id }) => {
  gmailConnected = false;
  const clients = tables.get('clients');
  const jobs = tables.get('jobs');
  const sarah = clients.find((c) => c.name === 'Sarah Whitfield');
  const kitchen = jobs.find((j) => j.name === 'Whitfield Kitchen Remodel');
  const porch = jobs.find((j) => j.name === 'Whitfield Porch Rail Repair');
  if (!sarah || !kitchen) return;
  sarah.portal_key = SARAH_PORTAL_KEY;

  // ---- tasks: 5 of 12 done, 5 milestones, the next milestone is "Countertops installed"
  const T = (title, status, due, milestone) => ({ id: id(), user_id: uid, job_id: kitchen.id, title, notes: null, status, due_date: day(due), start_date: day(due - 2), is_milestone: !!milestone, depends_on: [], sort_order: 0, completed_at: status === 'done' ? iso(due, 15) : null, source: 'manual', created_at: iso(-22), updated_at: iso(Math.min(due, 0)) });
  const tasks = [
    T('Protect floors and set up dust walls', 'done', -19), T('Demolition and haul-away', 'done', -17, true), T('Rough plumbing and electrical', 'done', -13),
    T('Inspection passed', 'done', -11, true), T('Install cabinets', 'done', -7, true), T('Template countertops', 'doing', -1),
    T('Countertops installed', 'todo', 3, true), T('Tile backsplash', 'todo', 6), T('Under-cabinet lighting', 'todo', 7),
    T('Paint and touch-up', 'todo', 9), T('Final cleaning', 'todo', 11), T('Final walkthrough with Sarah', 'todo', 13, true),
  ];
  tasks.forEach((t, i) => { t.sort_order = i; });
  const jt = table(tables, 'job_tasks');
  if (!jt.some((t) => t.job_id === kitchen.id)) jt.push(...tasks);

  // ---- photos on the kitchen job; three are shared with the client (portal copy)
  const photos = table(tables, 'job_photos');
  if (!photos.some((p) => p.job_id === kitchen.id)) {
    [['before', 'Old cabinets before demolition', -21, true], ['during', 'New cabinets going in', -7, true], ['during', 'Rough-in behind the sink wall', -13, false], ['during', 'Cabinet boxes set, doors next', -6, true]].forEach(([tag, caption, off, shared], i) => {
      photos.push({ id: id(), user_id: uid, job_id: kitchen.id, storage_path: `${uid}/${kitchen.id}/kitchen-${i + 1}.jpg`, thumb_path: `${uid}/${kitchen.id}/kitchen-${i + 1}-thumb.jpg`, tag, caption, taken_at: iso(off, 11), width: 1600, height: 1200, size_bytes: 300000, shared_in_portal: shared, portal_path: shared ? `${uid}/${kitchen.id}/portal-kitchen-${i + 1}.jpg` : null, created_at: iso(off, 11) });
    });
  }

  // ---- sent-email log for Sarah (the app only reads and removes rows; the gmail function writes them)
  const log = table(tables, 'email_log');
  const inv = tables.get('documents').find((d) => d.type === 'Invoice' && d.data.invoiceNumber === 'INV-2081');
  const est = tables.get('documents').find((d) => d.type === 'Estimate' && d.data.estimateNumber === 'EST-1042');
  if (!log.some((r) => r.client_id === sarah.id)) {
    log.push(
      { id: id(), user_id: uid, client_id: sarah.id, job_id: kitchen.id, document_id: inv && inv.id, kind: 'document', to_email: sarah.email, subject: 'Invoice INV-2081 from Northline Remodeling', status: 'sent', error: null, sent_at: iso(-14, 10) },
      { id: id(), user_id: uid, client_id: sarah.id, job_id: kitchen.id, document_id: est && est.id, kind: 'document', to_email: sarah.email, subject: 'Estimate EST-1042 for your kitchen remodel', status: 'sent', error: null, sent_at: iso(-24, 9) },
      { id: id(), user_id: uid, client_id: sarah.id, job_id: porch && porch.id, document_id: null, kind: 'review_request', to_email: 'sarah.whitfield@example.co', subject: 'How did we do on your porch rail repair?', status: 'failed', error: 'Recipient address rejected', sent_at: iso(-105, 14) },
    );
  }

  // ---- what the client's portal asks and offers (rows are in the shape the portal functions answer with)
  const history = (when, note) => [{ at: when, by: 'owner', action: 'sent', note: note || null }];
  const qs = table(tables, 'demo_portal_questions');
  qs.push(
    { id: id(), job_id: kitchen.id, job_name: kitchen.name, kind: 'question', title: 'Which grout color do you prefer?', body: 'We set the backsplash tile next week. Warm gray, bright white or charcoal?', due_date: day(2), sent_at: iso(-1, 9), status: 'sent', decision: null, answer: null, answered_by: null, answered_at: null, attachments: [], history: history(iso(-1, 9)) },
    { id: id(), job_id: kitchen.id, job_name: kitchen.name, kind: 'submittal', title: 'Approve the cabinet layout drawing', body: 'Please check the door style and the layout before we order the last two cabinets.', due_date: day(3), sent_at: iso(-1, 9), status: 'sent', decision: null, answer: null, answered_by: null, answered_at: null, attachments: [{ kind: 'link', title: 'Cabinet layout (PDF)', url: 'https://files.example.com/whitfield-cabinet-layout.pdf', path: null }], history: history(iso(-1, 9)) },
  );
  const opt = (key, name, description, unitPrice, allowance) => ({ id: key, name, description, path: `${uid}/${kitchen.id}/tile-${key}.jpg`, url: null, unit: 'sq ft', qty: 30, unit_price: unitPrice, total: unitPrice * 30, difference: allowance == null ? null : unitPrice * 30 - allowance });
  const sels = table(tables, 'demo_portal_selections');
  sels.push({
    id: id(), job_id: kitchen.id, job_name: kitchen.name, title: 'Backsplash tile', category: 'Tile', room: 'Kitchen', body: 'Pick the tile for the wall behind the stove and the counters. 30 sq ft.', due_date: day(3), sent_at: iso(-1, 9), status: 'sent', allowance: 600,
    chosen_option_id: null, client_comment: null, chosen_by: null, chosen_at: null, approved_at: null, history: history(iso(-1, 9)),
    options: [opt('subway', 'White subway tile, 3 x 6', 'Classic gloss white', 16, 600), opt('mosaic', 'Glass mosaic, soft gray', 'Small glass pieces on a mesh sheet', 22, 600), opt('zellige', 'Handmade zellige, sage', 'Uneven handmade glaze, one of a kind', 28, 600)],
  });
  const boards = table(tables, 'demo_portal_boards');
  boards.push({
    id: id(), job_id: kitchen.id, job_name: kitchen.name, title: 'Kitchen ideas',
    items: [
      { id: 'b1', kind: 'image', title: 'Open shelves', caption: 'Light oak, no upper cabinets on this wall', path: `${uid}/${kitchen.id}/board-1.jpg`, url: null, color: null },
      { id: 'b2', kind: 'color', title: 'Cabinet color', caption: 'Soft sage', path: null, url: null, color: '#8a9a8b' },
      { id: 'b3', kind: 'color', title: 'Wall color', caption: 'Warm white', path: null, url: null, color: '#e8e1d3' },
      { id: 'b4', kind: 'note', title: 'Handles', caption: 'Brushed brass, 5 inch pulls', path: null, url: null, color: null },
      { id: 'b5', kind: 'image', title: 'Pendant lights', caption: 'Over the island', path: `${uid}/${kitchen.id}/board-2.jpg`, url: null, color: null },
    ],
  });
};

// ============================================================================================ answers of the portal functions
const clientOf = (key, tables) => tables.get('clients').find((c) => c.portal_key === key) || null;
const jobsOf = (client, tables) => tables.get('jobs').filter((j) => j.client_id === client.id);
const docsOf = (jobIds, tables) => tables.get('documents').filter((d) => jobIds.has(d.job_id));
const ymd = (v) => (v ? String(v).slice(0, 10) : null);
const pickJob = (jobs, jobId) => (jobId && jobs.find((j) => j.id === jobId)) || jobs.find((j) => j.status === 'active') || jobs[0] || null;

export const rpc = {
  get_portal_data: ({ p_key }, tables) => {
    const client = clientOf(p_key, tables);
    if (!client) return undefined;
    const jobIds = new Set(jobsOf(client, tables).map((j) => j.id));
    return {
      client: { name: client.name },
      contractor: CONTRACTOR,
      documents: docsOf(jobIds, tables).map((d) => ({ id: d.id, type: d.type, job_id: d.job_id, created_at: d.created_at, state: null, data: d.data })),
    };
  },
  get_portal_project_dashboard: ({ p_key, p_job_id }, tables) => {
    const client = clientOf(p_key, tables);
    if (!client) return undefined;
    const jobs = jobsOf(client, tables);
    const summaries = jobs.map((j) => ({ id: j.id, name: j.name, status: j.status, start_date: j.start_date, end_date: j.end_date }));
    if (!p_job_id) return { jobs: summaries };
    const job = pickJob(jobs, p_job_id);
    if (!job) return { jobs: summaries };
    const tasks = tables.get('job_tasks').filter((t) => t.job_id === job.id);
    const milestones = tasks.filter((t) => t.is_milestone).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
      .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, status: t.status, completed_at: t.completed_at }));
    return {
      jobs: summaries,
      job: { id: job.id, name: job.name, address: job.client_address, status: job.status, start_date: job.start_date, end_date: job.end_date },
      contractor: CONTRACTOR,
      progress: tasks.length ? { done: tasks.filter((t) => t.status === 'done').length, total: tasks.length } : null,
      milestones,
      next_milestone: milestones.find((m) => m.status !== 'done') || null,
      documents: docsOf(new Set([job.id]), tables).map((d) => ({ id: d.id, type: d.type, created_at: d.created_at, state: null, data: d.data })),
      photos: tables.get('job_photos').filter((p) => p.job_id === job.id && p.shared_in_portal && p.portal_path)
        .map((p) => ({ id: p.id, tag: p.tag, caption: p.caption, taken_at: p.taken_at, path: p.portal_path })),
      punch: null,
      selections: [],
    };
  },
  get_portal_questions: ({ p_key, p_job_id }, tables) => {
    const client = clientOf(p_key, tables);
    if (!client) return undefined;
    const jobIds = new Set(jobsOf(client, tables).map((j) => j.id));
    const list = (tables.get('demo_portal_questions') || []).filter((q) => jobIds.has(q.job_id) && (!p_job_id || q.job_id === p_job_id));
    return list.length ? list : undefined;
  },
  answer_portal_question: (a, tables) => {
    const q = (tables.get('demo_portal_questions') || []).find((x) => x.id === a.p_question_id);
    if (!q) return undefined;
    const decision = a.p_decision === 'approved' || a.p_decision === 'rejected' ? a.p_decision : null;
    const now = new Date().toISOString();
    Object.assign(q, { status: decision || 'answered', decision, answer: a.p_answer || null, answered_by: a.p_name || null, answered_at: now });
    q.history = [...q.history, { at: now, by: 'client', action: decision || 'answered', note: a.p_answer || null }];
    return q;
  },
  get_portal_selections: ({ p_key, p_job_id }, tables) => {
    const client = clientOf(p_key, tables);
    if (!client) return undefined;
    const jobIds = new Set(jobsOf(client, tables).map((j) => j.id));
    const list = (tables.get('demo_portal_selections') || []).filter((s) => jobIds.has(s.job_id) && (!p_job_id || s.job_id === p_job_id));
    return list.length ? list : undefined;
  },
  choose_portal_selection: (a, tables) => {
    const s = (tables.get('demo_portal_selections') || []).find((x) => x.id === a.p_selection_id);
    if (!s) return undefined;
    const now = new Date().toISOString();
    Object.assign(s, { status: 'chosen', chosen_option_id: a.p_option_id, client_comment: a.p_comment || null, chosen_by: a.p_name || null, chosen_at: now });
    s.history = [...s.history, { at: now, by: 'client', action: 'chosen', note: a.p_comment || null }];
    return s;
  },
  get_portal_boards: ({ p_key, p_job_id }, tables) => {
    const client = clientOf(p_key, tables);
    if (!client) return undefined;
    const jobIds = new Set(jobsOf(client, tables).map((j) => j.id));
    const list = (tables.get('demo_portal_boards') || []).filter((b) => jobIds.has(b.job_id) && (!p_job_id || b.job_id === p_job_id));
    return list.length ? list : undefined;
  },
};

// ============================================================================================ the fake `gmail` edge function
export const functions = {
  gmail: async (args) => {
    switch (args && args.action) {
      case 'list':
        return { accounts: gmailConnected ? [{ id: 'gm-demo-1', gmail_address: GMAIL_ADDRESS, display_name: 'Marcus Reed', is_default: true, status: 'active', needs_reconnect: false }] : [], usage: { tier: 'ai', paid: true, emails_this_month: 14, limit: null } };
      case 'exchange':
        gmailConnected = true;
        return { email: GMAIL_ADDRESS, account_id: 'gm-demo-1', return_to: '/communication' };
      case 'send':
        return { id: 'demo-message-1', thread_id: 'demo-thread-1', from: GMAIL_ADDRESS };
      case 'set_default': case 'disconnect':
        return { ok: true };
      default:
        return undefined;
    }
  },
};
