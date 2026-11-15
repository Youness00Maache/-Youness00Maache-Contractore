// Demo data for chapter 23 (selections, mood boards, job files, client questions). Everything here is made up. Only built for chapter 23.
//
// Job "Nair Master Bath" (client David & Priya Nair):
//  - Selections: "Shower floor tile" is already CHOSEN by the client (3 options with photos, $600 allowance, the chosen one $40 over) so
//    Approve and Create purchase order can be shown; "Vanity paint colour" is a DRAFT with 2 options.
//  - Boards: "Bathroom ideas" with 5 items (2 images, a link, a colour, a note), private, plus a private board note.
//  - Files: 7 files and links across the categories, a floor plan with a v2 (v1 folds under "Older versions"), tags, one image shown in the portal.
//  - Questions: one question waiting for the client ("Which grout colour?") and one answered submittal ("Vanity product data sheet", Approved by David Nair).
//  - A saved supplier "Harbor Tile and Stone" for the purchase order draft.
// Hooks make approve / ordered / sent behave like the database (timestamps, history).

import { pinJobs, table } from './_helpers-b.mjs';

const MINE = new Set(['23']);
export const NAIR_PORTAL_KEY = 'demo-portal-nair-bath-0000000001'; // the client portal needs a key of at least 32 characters

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (!MINE.has(chapter)) return;
  pinJobs(tables);
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;
  const img = (name) => `${uid}/${nair.id}/${name}.jpg`;

  // ---- what the CLIENT sees on the real portal page (/?portal=<key>): a tile choice waiting for David (answers are kept by 08-send-and-portal.mjs)
  const nairClient = tables.get('clients').find((c) => c.id === nair.client_id);
  if (nairClient) nairClient.portal_key = NAIR_PORTAL_KEY;
  const popt = (key, name, description, unitPrice) => ({ id: key, name, description, path: img('portal-wall-' + key), url: null, unit: 'sq ft', qty: 60, unit_price: unitPrice, total: unitPrice * 60, difference: unitPrice * 60 - 900 });
  table(tables, 'demo_portal_selections').push({
    id: id(), job_id: nair.id, job_name: nair.name, title: 'Shower wall tile', category: 'Tile', room: 'Master bath', body: 'Pick the tile for the shower walls. 60 sq ft.', due_date: day(3), sent_at: iso(-1, 9), status: 'sent', allowance: 900,
    chosen_option_id: null, client_comment: null, chosen_by: null, chosen_at: null, approved_at: null, history: [{ at: iso(-1, 9), by: 'owner', action: 'sent', note: null }],
    options: [popt('subway', 'White subway tile, 3 x 6', 'Classic gloss white', 15), popt('stone', 'Gray stone-look porcelain, 12 x 24', 'Large format, fewer grout lines', 17), popt('zellige', 'Blue zellige, handmade', 'Uneven handmade glaze, one of a kind', 21)],
  });

  // ---- a saved supplier
  const suppliers = table(tables, 'suppliers');
  const harbor = { id: id(), user_id: uid, name: 'Harbor Tile and Stone', contact_name: 'Pat Moreno', email: 'orders@harbor-tile.example', phone: '(555) 010-7711', address: '2200 Industrial Way, Maple Grove, OH', notes: '', archived: false, created_at: iso(-60), updated_at: iso(-60) };
  suppliers.push(harbor);

  // ---- selections
  const opt = (key, name, description, unit_price, unit_cost, sku) => ({ id: 'o_' + key, name, description, image_path: img('sel-' + key), portal_path: img('portal-sel-' + key), url: null, sku, supplier_id: harbor.id, unit: 'sq ft', qty: 40, unit_price, unit_cost });
  const sels = table(tables, 'job_selections');
  const hist = (...e) => e.map(([by, action, note, off]) => ({ at: iso(off, 10), by, action, note: note || null }));
  sels.push({
    id: id(), user_id: uid, job_id: nair.id, title: 'Shower floor tile', category: 'tile', room: 'Master bath', body: 'Pick the tile for the shower floor. Prices are for 40 sq ft.', due_date: day(2), allowance: 600,
    options: [
      opt('white', 'Matte white hex, 2 in', 'Small hex mosaic, matte finish', 14, 9, 'HT-HEX-W2'),
      opt('slate', 'Gray slate-look porcelain', 'Textured, non-slip, 12 x 24', 16, 10.5, 'HT-SLT-G12'),
      opt('zellige', 'Blue zellige, handmade', 'Uneven handmade glaze, one of a kind', 22, 15, 'HT-ZEL-B4'),
    ],
    status: 'chosen', chosen_option_id: 'o_slate', client_comment: 'We like the gray, it hides water spots.', chosen_by: 'David Nair', chosen_at: iso(-1, 18), po_document_id: null,
    history: hist(['owner', 'sent', null, -3], ['client', 'chosen', 'We like the gray, it hides water spots.', -1]), sent_at: iso(-3, 10), approved_at: null, ordered_at: null, closed_at: null, created_at: iso(-4), updated_at: iso(-1, 18),
  });
  const paintOpt = (key, name, description, unit_price, unit_cost, sku) => ({ id: 'o_' + key, name, description, image_path: img('sel-' + key), portal_path: null, url: null, sku, supplier_id: null, unit: 'gal', qty: 2, unit_price, unit_cost });
  sels.push({
    id: id(), user_id: uid, job_id: nair.id, title: 'Vanity paint colour', category: 'paint', room: 'Master bath', body: 'Which colour for the vanity cabinet?', due_date: null, allowance: 120,
    options: [paintOpt('sage', 'Soft sage, satin', 'Calm green-gray', 58, 32, 'PN-SAGE-1'), paintOpt('navy', 'Deep navy, satin', 'Bold and dark', 62, 34, 'PN-NAVY-2')],
    status: 'draft', chosen_option_id: null, client_comment: null, chosen_by: null, chosen_at: null, po_document_id: null, history: [], sent_at: null, approved_at: null, ordered_at: null, closed_at: null, created_at: iso(-2), updated_at: iso(-2),
  });

  // ---- a mood board
  table(tables, 'job_boards').push({
    id: id(), user_id: uid, job_id: nair.id, title: 'Bathroom ideas', notes: 'Keep it calm. They like natural light and warm metals. Budget for fixtures is flexible.',
    items: [
      { id: 'bi1', kind: 'image', title: 'Walk-in shower', caption: 'Glass panel, no door', url: null, image_path: img('board-1'), portal_path: null, color: null },
      { id: 'bi2', kind: 'image', title: 'Floating vanity', caption: 'Wood tone, matte black pulls', url: null, image_path: img('board-2'), portal_path: null, color: null },
      { id: 'bi3', kind: 'link', title: 'Rain shower head', caption: 'Brushed brass', url: 'https://shop.example.com/rain-shower-brass', image_path: null, portal_path: null, color: null },
      { id: 'bi4', kind: 'color', title: 'Wall colour', caption: 'Warm white', url: null, image_path: null, portal_path: null, color: '#e9e2d4' },
      { id: 'bi5', kind: 'note', title: 'Storage', caption: 'A niche in the shower and a tall cabinet by the door', url: null, image_path: null, portal_path: null, color: null },
    ],
    shared_in_portal: false, created_at: iso(-5), updated_at: iso(-5),
  });

  // ---- files (and links)
  const files = table(tables, 'job_files');
  const planGroup = id();
  const file = (extra) => ({
    id: id(), user_id: uid, job_id: nair.id, kind: 'file', category: 'other', title: '', notes: null, tags: [], storage_path: null, file_name: null, mime: null, size_bytes: null, url: null,
    version: 1, version_group: null, shared_in_portal: false, portal_path: null, created_at: iso(-10), updated_at: iso(-10), ...extra,
  });
  const f = (extra) => { const row = file(extra); row.version_group = row.version_group || row.id; return row; };
  files.push(
    f({ category: 'plans', title: 'Master bath floor plan', notes: 'Revised after the walls were opened.', tags: ['floor plan', 'rev B'], storage_path: `${uid}/${nair.id}/floor-plan-v1.pdf`, file_name: 'master-bath-floor-plan-v1.pdf', mime: 'application/pdf', size_bytes: 820000, version: 1, version_group: planGroup, created_at: iso(-14) }),
    f({ category: 'plans', title: 'Master bath floor plan', notes: 'Shower moved 6 inches toward the window.', tags: ['floor plan', 'rev B'], storage_path: `${uid}/${nair.id}/floor-plan-v2.pdf`, file_name: 'master-bath-floor-plan-v2.pdf', mime: 'application/pdf', size_bytes: 860000, version: 2, version_group: planGroup, created_at: iso(-6) }),
    f({ category: 'permits', title: 'Plumbing and electrical permit', tags: ['city'], storage_path: `${uid}/${nair.id}/permit.pdf`, file_name: 'permit-2026-0417.pdf', mime: 'application/pdf', size_bytes: 310000, created_at: iso(-12) }),
    f({ category: 'contracts', title: 'Signed contract', storage_path: `${uid}/${nair.id}/contract.pdf`, file_name: 'nair-contract-signed.pdf', mime: 'application/pdf', size_bytes: 540000, created_at: iso(-13) }),
    f({ category: 'specs', title: 'Shower valve spec sheet', tags: ['plumbing'], storage_path: `${uid}/${nair.id}/valve-spec.pdf`, file_name: 'valve-spec.pdf', mime: 'application/pdf', size_bytes: 190000, created_at: iso(-9) }),
    f({ category: 'receipts', title: 'Tile order receipt', notes: 'Paid in full.', storage_path: `${uid}/${nair.id}/tile-receipt.jpg`, file_name: 'tile-receipt.jpg', mime: 'image/jpeg', size_bytes: 240000, created_at: iso(-5) }),
    f({ category: 'visuals', title: 'Shower render, view from the door', tags: ['render'], storage_path: `${uid}/${nair.id}/render-1.jpg`, file_name: 'shower-render.jpg', mime: 'image/jpeg', size_bytes: 410000, shared_in_portal: true, portal_path: `${uid}/${nair.id}/portal-render-1.jpg`, created_at: iso(-4) }),
    f({ kind: 'link', category: 'visuals', title: '3D walkthrough of the bathroom', url: 'https://drive.example.com/nair-bath-walkthrough', created_at: iso(-3) }),
  );

  // ---- questions and submittals
  const qs = table(tables, 'job_questions');
  const qh = (...e) => e.map(([by, action, note, off]) => ({ at: iso(off, 11), by, action, note: note || null }));
  qs.push(
    { id: id(), user_id: uid, job_id: nair.id, kind: 'question', title: 'Which grout colour?', body: 'The tile goes up next week. Warm gray, bright white or charcoal for the grout?', due_date: day(3), status: 'sent', attachments: [], answer: null, answered_by: null, answered_at: null, decision: null, history: qh(['owner', 'sent', null, -1]), shared_in_portal: true, sent_at: iso(-1, 11), closed_at: null, created_at: iso(-1), updated_at: iso(-1) },
    { id: id(), user_id: uid, job_id: nair.id, kind: 'submittal', title: 'Vanity product data sheet', body: 'Please look at the size and finish of the vanity before we order it.', due_date: day(-2), status: 'approved', attachments: [{ url: 'https://files.example.com/vanity-48-data-sheet.pdf', title: 'Vanity 48 in data sheet' }], answer: 'Looks right. Go ahead.', answered_by: 'David Nair', answered_at: iso(-3, 16), decision: 'approved', history: qh(['owner', 'sent', null, -5], ['client', 'approved', 'Looks right. Go ahead.', -3]), shared_in_portal: true, sent_at: iso(-5, 11), closed_at: null, created_at: iso(-5), updated_at: iso(-3) },
  );
};

// ---- what the database does on its own
const stamp = (row, status) => {
  const now = new Date().toISOString();
  const by = 'owner';
  const hist = (action, note) => { row.history = [...(row.history || []), { at: now, by, action, note: note || null }]; };
  if (status === 'sent') { row.sent_at = row.sent_at || now; hist('sent'); }
  if (status === 'approved') { row.approved_at = now; hist('approved'); }
  if (status === 'changes_requested') hist('changes_requested');
  if (status === 'ordered') { row.ordered_at = now; hist('ordered'); }
  if (status === 'closed') { row.closed_at = now; hist('closed'); }
  if (status === 'draft') { hist('draft'); }
};
export const insertHooks = {
  job_selections: (row) => ({ status: 'draft', history: [], chosen_option_id: null, client_comment: null, chosen_by: null, chosen_at: null, po_document_id: null, sent_at: null, approved_at: null, ordered_at: null, closed_at: null, ...row }),
  job_questions: (row) => ({ status: 'draft', history: [], attachments: [], answer: null, answered_by: null, answered_at: null, decision: null, shared_in_portal: false, sent_at: null, closed_at: null, ...row }),
  job_boards: (row) => ({ shared_in_portal: false, notes: null, ...row }),
  job_files: (row) => ({ version: 1, kind: 'file', tags: [], notes: null, shared_in_portal: false, portal_path: null, version_group: row.version_group || row.id, ...row }),
};
export const patchHooks = {
  job_selections: (row, patch) => { if (patch.status) stamp(row, patch.status); },
  job_questions: (row, patch) => {
    if (patch.status === 'sent') { row.sent_at = row.sent_at || new Date().toISOString(); row.shared_in_portal = true; }
    if (patch.status === 'closed') row.closed_at = new Date().toISOString();
  },
};
