// Demo data for chapter 16 (punch lists). Only built for chapter 16 (GET /__reset?chapter=16).
//
// "Nair Master Bath" gets a punch list of 8 items in two rooms (Bathroom, Hallway): 3 verified, 1 done but not yet verified (the one the
// client answers on the phone), 4 still open. "Show in client portal" is OFF at the start (punch_lists row with shared_in_portal false);
// the chapter switches it on, and the REAL client portal (/?portal=demo-portal-nair) then shows the list through get_portal_punch_list.
// "Looks good" / "Needs work" go through punch_item_feedback_via_portal (like the database function: Needs work reopens the item with the note).
// Crew member Eli exists, so "@Eli" is understood as an assignee.

const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));
const NAIR_KEY = 'demo-portal-nair';
const CONTRACTOR = { name: 'Marcus Reed', company_name: 'Northline Remodeling', logo_url: '', phone: '(555) 010-2000', email: 'marcus@northline-demo.example', website: 'northline-demo.example', address: '418 Cedar Street, Maple Grove, OH 45000' };

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '16') return;
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;
  const crew = table(tables, 'crew_members');
  if (!crew.some((m) => /^eli/i.test(m.name))) crew.push({ id: id(), user_id: uid, name: 'Eli Brooks', phone: '(555) 010-5102', email: null, cost_rate: 28, active: true, link_nonce: 'n-eli', link_created_at: iso(-20), last_seen_at: iso(-1, 16), created_at: iso(-60) });

  table(tables, 'punch_lists').push({ id: id(), job_id: nair.id, user_id: uid, shared_in_portal: false, created_at: iso(-6) });
  const photos = tables.get('job_photos').filter((p) => p.job_id === nair.id);
  const before = photos.find((p) => p.tag === 'before');
  const during = photos.find((p) => p.tag === 'during');
  const items = table(tables, 'punch_items');
  const item = (position, area, title, status, extra = {}) => ({
    id: id(), user_id: uid, job_id: nair.id, title, area, assignee: null, due_on: null, status, position, notes: null, before_photo_id: null, after_photo_id: null,
    done_at: status === 'open' ? null : iso(-2, 15), verified_at: status === 'verified' ? iso(-1, 9) : null, verified_by: status === 'verified' ? 'contractor' : null,
    client_note: null, client_note_at: null, created_at: iso(-5, 10), updated_at: iso(-1, 9), ...extra,
  });
  items.push(
    item(0, 'Bathroom', 'Re-caulk the tub edge', 'verified', { before_photo_id: before && before.id, after_photo_id: during && during.id }),
    item(1, 'Bathroom', 'Replace the cracked outlet cover', 'verified'),
    item(2, 'Bathroom', 'Touch up paint at the door frame', 'done'),
    item(3, 'Bathroom', 'Fix the squeaky door hinge', 'open', { assignee: 'Eli', due_on: day(2) }),
    item(4, 'Bathroom', 'Level the towel bar', 'open'),
    item(5, 'Hallway', 'Install the door stop', 'verified'),
    item(6, 'Hallway', 'Patch the drywall by the thermostat', 'open', { assignee: 'Eli' }),
    item(7, 'Hallway', 'Wipe the grout haze off the floor', 'open'),
  );
};

// ---- the client's phone: the portal punch list ----------------------------------------------------------------
const portalJobs = (key, tables) => {
  const client = tables.get('clients').find((c) => c.portal_key === key);
  if (!client) return [];
  const shared = new Set((tables.get('punch_lists') || []).filter((l) => l.shared_in_portal).map((l) => l.job_id));
  return tables.get('jobs').filter((j) => j.client_id === client.id && shared.has(j.id));
};

export const rpc = {
  get_portal_punch_list: ({ p_key }, tables) => {
    const jobs = portalJobs(p_key, tables);
    if (!jobs.length) return undefined;
    return jobs.map((j) => ({
      job_id: j.id, job_name: j.name,
      items: (tables.get('punch_items') || []).filter((i) => i.job_id === j.id).sort((a, b) => a.position - b.position).map((i) => ({
        id: i.id, title: i.title, area: i.area, status: i.status, due_on: i.due_on, verified_by: i.verified_by, verified_at: i.verified_at, client_note: i.client_note, before_path: null, after_path: null,
      })),
    })).filter((j) => j.items.length);
  },
  punch_item_feedback_via_portal: ({ p_key, p_item_id, p_ok, p_note }, tables) => {
    const jobIds = new Set(portalJobs(p_key, tables).map((j) => j.id));
    const it = (tables.get('punch_items') || []).find((i) => i.id === p_item_id && jobIds.has(i.job_id));
    if (!it) return undefined;
    const now = new Date().toISOString();
    if (p_ok) Object.assign(it, { status: 'verified', verified_by: 'client', verified_at: now, updated_at: now });
    else Object.assign(it, { status: 'open', done_at: null, verified_by: null, verified_at: null, client_note: p_note || null, client_note_at: now, updated_at: now });
    return { ok: true };
  },
};
