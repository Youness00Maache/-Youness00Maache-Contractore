// Demo data for chapter 11 (client feedback, reviews, the public profile). Everything here is made up.
//
//  - feedback_responses: one waiting link on "Whitfield Porch Rail Repair" (its client answers it in the REAL feedback page, /feedback/<token>, on a
//    phone), plus 4 answered ones (5, 5, 4 and 2 stars) of other made-up clients; two are already on the public page. A new link made with
//    "Make the link" gets a token like the database does (insertHooks).
//  - The public profile starts EMPTY (the chapter types it in and picks photos from the Okafor job); what is saved shows on the REAL public page
//    /r/northline-remodeling together with the testimonials. Everything goes through the get_/update_ profile answers below.
//  - Three photos on "Okafor Basement Finish" (Before / After) for the gallery picker.

import { randomBytes } from 'node:crypto';

export const FEEDBACK_TOKEN = 'demo-feedback-whitfield-porch-rail-0001';
const GOOGLE_REVIEW_LINK = 'https://g.page/r/northline-demo/review';
const UID = '00000000-0000-4000-8000-000000000001';
const CONTRACTOR = { name: 'Marcus Reed', company_name: 'Northline Remodeling', logo_url: '' };
const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

let profile = { about: '', services: [], service_area: '', license_line: '', years_line: '', gallery: [] };

export default ({ tables, uid, iso, id }) => {
  profile = { about: '', services: [], service_area: '', license_line: '', years_line: '', gallery: [] };
  const clients = tables.get('clients');
  const jobs = tables.get('jobs');
  const sarah = clients.find((c) => c.name === 'Sarah Whitfield');
  const porch = jobs.find((j) => j.name === 'Whitfield Porch Rail Repair');
  const okafor = jobs.find((j) => j.name === 'Okafor Basement Finish');

  // photos on the Okafor job (the gallery picker lists After photos first)
  const photos = table(tables, 'job_photos');
  if (okafor && !photos.some((p) => p.job_id === okafor.id)) {
    [['before', 'Bare basement before framing', -70], ['after', 'Finished basement, new lighting and flooring', -22], ['after', 'Basement walls and trim, painted', -21]].forEach(([tag, caption, off], i) => {
      photos.push({ id: id(), user_id: uid, job_id: okafor.id, storage_path: `${uid}/${okafor.id}/basement-${i + 1}.jpg`, thumb_path: `${uid}/${okafor.id}/basement-${i + 1}-thumb.jpg`, tag, caption, taken_at: iso(off, 11), width: 1600, height: 1200, size_bytes: 290000, shared_in_portal: false, created_at: iso(off, 11) });
    });
  }

  const rows = table(tables, 'feedback_responses');
  const row = (extra) => ({
    id: id(), user_id: uid, job_id: null, client_id: null, job_name: null, client_first_name: null, token: randomBytes(32).toString('base64url'), status: 'submitted',
    requested_at: iso(-30), submitted_at: iso(-28), rating: 5, comment: null, client_name: null, testimonial: false, testimonial_name: null, testimonial_text: null,
    owner_note: null, hidden: false, created_at: iso(-30), updated_at: iso(-28), ...extra,
  });
  rows.push(
    // the waiting link the client answers on the phone (chapter 11, scene 2)
    row({ job_id: porch && porch.id, client_id: sarah && sarah.id, job_name: 'Whitfield Porch Rail Repair', client_first_name: 'Sarah', token: FEEDBACK_TOKEN, status: 'requested', submitted_at: null, rating: null, requested_at: iso(-1, 9), created_at: iso(-1, 9), updated_at: iso(-1, 9) }),
    row({ job_name: 'Okafor Basement Finish', client_first_name: 'Linda', client_name: 'Linda Okafor', rating: 5, comment: 'Marcus and his crew finished the basement a week early and left the house spotless. The new lighting is perfect. We use the room every day.', requested_at: iso(-20), submitted_at: iso(-18), created_at: iso(-20), updated_at: iso(-18) }),
    row({ job_name: 'Bathroom fan replacement', client_first_name: 'Karen', client_name: 'Karen Doyle', rating: 5, comment: 'On time, fast and tidy. I would hire them again.', testimonial: true, testimonial_name: 'Karen D.', testimonial_text: 'On time, fast and tidy. I would hire them again.', requested_at: iso(-45), submitted_at: iso(-44), created_at: iso(-45), updated_at: iso(-44) }),
    row({ job_name: 'Gutter and fascia repair', client_first_name: 'Sam', client_name: 'Sam Whitaker', rating: 4, comment: 'Good work and a fair price. Tile delivery pushed the start back a few days, but they kept me posted.', testimonial: true, testimonial_name: 'Sam W.', testimonial_text: 'Good work and a fair price.', requested_at: iso(-60), submitted_at: iso(-58), created_at: iso(-60), updated_at: iso(-58) }),
    row({ job_name: 'Fence staining', client_first_name: 'Dana', client_name: 'Dana Price', rating: 2, comment: 'The crew was late twice and there was a lot of dust. The staining itself looks fine.', owner_note: 'Called Dana and offered a free touch-up visit.', requested_at: iso(-75), submitted_at: iso(-73), created_at: iso(-75), updated_at: iso(-73) }),
  );
};

// a new "Make the link": what the database fills in (token, snapshots) when the app inserts the request
export const insertHooks = {
  feedback_responses: (row, tables) => {
    const client = row.client_id && tables.get('clients').find((c) => c.id === row.client_id);
    const job = row.job_id && tables.get('jobs').find((j) => j.id === row.job_id);
    return {
      token: randomBytes(32).toString('base64url'), status: 'requested', requested_at: row.created_at, submitted_at: null, rating: null, comment: null, client_name: null,
      testimonial: false, testimonial_name: null, testimonial_text: null, owner_note: null, hidden: false, updated_at: row.created_at,
      ...row, job_name: (job && job.name) || row.job_name || null, client_first_name: client ? String(client.name).split(/\s+/)[0] : null,
    };
  },
};

const answered = (tables) => (tables.get('feedback_responses') || []).filter((r) => r.status === 'submitted' && !r.hidden);

export const rpc = {
  // ---- the client's feedback page (/feedback/<token>)
  get_feedback_request: ({ p_token }, tables) => {
    const r = (tables.get('feedback_responses') || []).find((x) => x.token === p_token);
    if (!r) return undefined;
    return { status: r.status, submitted: r.status === 'submitted', rating: r.rating, submitted_at: r.submitted_at, job_name: r.job_name, client_first_name: r.client_first_name, contractor: CONTRACTOR };
  },
  submit_feedback: ({ p_token, p_rating, p_comment, p_name }, tables) => {
    const r = (tables.get('feedback_responses') || []).find((x) => x.token === p_token);
    if (!r) return undefined;
    const now = new Date().toISOString();
    Object.assign(r, { status: 'submitted', rating: p_rating, comment: p_comment || null, client_name: p_name || null, submitted_at: now, updated_at: now });
    return { ok: true, rating: p_rating, review_url: GOOGLE_REVIEW_LINK };
  },

  // ---- the public profile (Settings > Request-a-quote link > Public profile)
  get_my_request_profile: () => ({ slug: 'northline-remodeling', ...profile }),
  update_request_profile: (a) => {
    if (a.p_about !== null && a.p_about !== undefined) profile.about = a.p_about;
    if (a.p_services !== null && a.p_services !== undefined) profile.services = a.p_services;
    if (a.p_service_area !== null && a.p_service_area !== undefined) profile.service_area = a.p_service_area;
    if (a.p_license_line !== null && a.p_license_line !== undefined) profile.license_line = a.p_license_line;
    if (a.p_years_line !== null && a.p_years_line !== undefined) profile.years_line = a.p_years_line;
    return { slug: 'northline-remodeling', ...profile };
  },
  set_request_profile_gallery: (a) => {
    profile.gallery = Array.isArray(a.p_items) ? a.p_items.map((i) => ({ path: i.path, caption: i.caption || null, photo_id: i.photo_id || null })) : [];
    return { slug: 'northline-remodeling', ...profile };
  },
  // what a visitor of /r/northline-remodeling sees below the request form
  get_public_profile_extras: ({ p_slug }, tables) => {
    if (p_slug !== 'northline-remodeling') return undefined;
    const list = answered(tables);
    const shown = list.filter((r) => r.testimonial).sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at)));
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null;
    return {
      about: profile.about, services: profile.services, service_area: profile.service_area, license_line: profile.license_line, years_line: profile.years_line, gallery: profile.gallery,
      testimonials: shown.map((r) => ({ rating: r.rating, name: r.testimonial_name || r.client_first_name, text: r.testimonial_text || r.comment, date: String(r.submitted_at).slice(0, 10) })),
      rating_average: avg === null ? null : Math.round(avg * 10) / 10, rating_count: list.length,
    };
  },
};
