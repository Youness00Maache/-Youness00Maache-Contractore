// Demo data for chapter 12 (the calendar). Only built for chapter 12 (GET /__reset?chapter=12), so no other chapter sees it.
//
// The jobs (spread over the month), the Whitfield tasks (08-send-and-portal.mjs), the lead follow-ups and the two appointments
// (10-leads-requests.mjs) already make the calendar busy. This adds what the narration points at:
//   - open tasks WITH dates on "Nair Master Bath": one LATE (red diamond), two coming up, so the diamond markers show in Month, the
//     chips in Week and the Tasks group in List;
//   - one lead follow-up that is late (red marker): "Mike Dunn" comes from the chapter 10 data (follow-up two days ago).
export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '12') return;
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;
  if (!tables.has('job_tasks')) tables.set('job_tasks', []);
  const tasks = tables.get('job_tasks');
  const T = (title, status, start, due, order, milestone = false) => ({
    id: id(), user_id: uid, job_id: nair.id, title, notes: null, status, due_date: day(due), start_date: start == null ? null : day(start), is_milestone: milestone,
    depends_on: [], sort_order: order, completed_at: null, source: 'manual', created_at: iso(-8), updated_at: iso(-2),
  });
  tasks.push(
    T('Order the shower glass door', 'todo', -6, -3, 0),
    T('Tile delivery', 'todo', 1, 2, 1),
    T('Plumbing inspection', 'todo', null, 5, 2, true),
  );
};
