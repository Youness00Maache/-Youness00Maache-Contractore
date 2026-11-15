// Demo data for chapter 14 (job photos and daily reports). Only built for chapter 14 (GET /__reset?chapter=14).
//
// "Nair Master Bath" (client David & Priya Nair, a saved client) gets 8 photos: Before (3), During (3), After (1), Issue (1), most with a
// caption, two shown in the client portal. (07-options-proposals.mjs already put 3 on this job; this adds 5 more.) The profile is Premium +
// AI (seed.mjs), so "Write client update" and "AI walkthrough" work, with canned AI answers below. The three forms (Daily Job Report, Work
// Order, Material Log) are opened empty from "New Document", as the narration says.

let active = false;
export default ({ tables, uid, iso, id, chapter }) => {
  active = chapter === '14';
  if (chapter !== '14') return;
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;
  if (!tables.has('job_photos')) tables.set('job_photos', []);
  const photos = tables.get('job_photos');
  const have = photos.filter((p) => p.job_id === nair.id).length;
  const more = [
    ['before', 'Water stain behind the vanity', -9, true], ['before', 'Cracked floor tile by the door', -9, false], ['during', 'Wall opened up for the new shower valve', -7, false],
    ['issue', 'Leak found at the old drain', -7, false], ['after', 'New vanity wall, ready for paint', -1, true],
  ];
  more.forEach(([tag, caption, off, shared], i) => {
    const n = have + i + 1;
    photos.push({
      id: id(), user_id: uid, job_id: nair.id, storage_path: `${uid}/${nair.id}/bath-${n}.jpg`, thumb_path: `${uid}/${nair.id}/bath-${n}-thumb.jpg`, tag, caption,
      taken_at: iso(off, 14), width: 1600, height: 1200, size_bytes: 290000, shared_in_portal: shared, portal_path: shared ? `${uid}/${nair.id}/portal-bath-${n}.jpg` : null, created_at: iso(off, 14),
    });
  });
  // one of the first three is shown in the portal too
  const first = photos.find((p) => p.job_id === nair.id && p.tag === 'during');
  if (first && !first.shared_in_portal) { first.shared_in_portal = true; first.portal_path = `${uid}/${nair.id}/portal-bath-during.jpg`; }
  // crew member Eli, for the Work Order "Assigned to" suggestions
  if (!tables.has('crew_members')) tables.set('crew_members', []);
  const crew = tables.get('crew_members');
  if (!crew.some((m) => /^eli/i.test(m.name))) crew.push({ id: id(), user_id: uid, name: 'Eli Brooks', phone: '(555) 010-5102', email: null, cost_rate: 28, active: true, link_nonce: 'n-eli', link_created_at: iso(-20), last_seen_at: iso(-1, 16), created_at: iso(-60) });
};

export const functions = {
  'ai-assistant': async (args) => {
    if (!args) return undefined;
    if (args.task === 'photo_update') {
      return { ok: true, update: {
        subject: 'Nair Master Bath: where we are this week',
        message: 'The old shower and vanity are out, and the new shower valve and drain are in. We found a small leak at the old drain, and it is fixed. Tile goes on the shower wall next, and the new vanity wall is ready for paint.',
        decision: 'Please confirm the grout color, grey or white, by Friday so we can order it.',
      } };
    }
    if (args.task === 'photo_walkthrough') {
      return { ok: true, proposal: {
        action_type: 'GENERATE_DOCUMENT', document_type: 'DAILY_REPORT', reply_text: 'I drafted your daily report from the photos.',
        prefill: { title: 'Shower valve set, wall opened up', crewSize: 2, laborHours: 16, content: '<p><strong>Work completed</strong></p><p>Opened the wall for the new shower valve and set the valve. Replaced the old drain after finding a leak. Vanity wall is ready for paint.</p>' },
      } };
    }
    return undefined;
  },
};

// "x MB of 10 GB photo storage used" under the stage picker (get_photo_usage; Premium + AI has no per-job limit)
export const rpc = {
  get_photo_usage: ({ p_job_id }, tables) => {
    if (!active) return undefined;
    const mine = (tables.get('job_photos') || []).filter((p) => p.job_id === p_job_id);
    const all = tables.get('job_photos') || [];
    const sum = (list) => list.reduce((n, p) => n + Number(p.size_bytes || 0), 0);
    return { tier: 'ai', total_bytes: sum(all), total_count: all.length, job_count: mine.length, limits: { per_job: null, total_bytes: 10 * 1024 * 1024 * 1024 } };
  },
};
