// Demo data for chapter 7 (good / better / best, proposals, estimate review). Everything here is made up.
//
// Adds ONE estimate to the job "Nair Master Bath": EST-1044 "Master bath, three packages":
//   - three options (Good / Better / Best) + one line in every option, Better is Recommended;
//   - the contractor recorded that the client chose Better (so "Apply chosen option" is visible), status Accepted, not signed (editable);
//   - Better holds a line without a price, a line priced below its cost (the "Review estimate" checks), and the estimate has no tax;
//   - a short Scope / Inclusions / Exclusions proposal; no payment schedule yet;
//   - 3 job photos on the job (picker "From job photos"); one saved proposal template.
// The seeded estimate EST-1043 is NOT touched (chapter 7 turns on "Good / better / best" there).
// Also: the public approval page of EST-1044 (/?approval_token=...) via the get_document_by_token answer, and the AI estimate check.

export const APPROVAL_TOKEN = 'demo-est-1044-approval-link';

let snapshot = null; // what the client's approval page gets (no private fields, no contractor-recorded choice)

export default ({ tables, uid, day, iso, id }) => {
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (!nair) return;
  const L = (key, description, quantity, rate, unitCost, unit) => ({ id: `ln-${key}`, description, quantity, rate, ...(unit ? { unit } : {}), ...(unitCost != null ? { unitCost } : {}) });

  const shared = [L('permit', 'Permit and inspection', 1, 250, 200)];
  const good = [
    L('g1', 'Remove tub and vanity, haul away', 1, 950, 400),
    L('g2', 'Fiberglass shower insert, installed', 1, 2900, 1700),
    L('g3', 'Vanity, 36 in with top', 1, 980, 620),
    L('g4', 'Plumbing fixtures, standard', 1, 650, 380),
  ];
  const better = [
    L('b1', 'Remove tub and vanity, haul away', 1, 950, 400),
    L('b2', 'Walk-in shower, tiled', 1, 5400, 3100),
    L('b3', 'Vanity, 48 in with top', 1, 1650, 1050),
    L('b4', 'Plumbing fixtures, brushed nickel', 1, 1200, 700),
    L('b5', 'Porcelain floor tile', 45, 6, 7.5, 'sq ft'),         // priced below its cost
    L('b6', 'Frameless glass shower door', 1, 0, 640),             // no price yet
  ];
  const best = [
    L('e1', 'Remove tub and vanity, haul away', 1, 950, 400),
    L('e2', 'Walk-in shower, tiled, with bench and niche', 1, 6900, 4000),
    L('e3', 'Double vanity, 60 in with top', 1, 2400, 1500),
    L('e4', 'Plumbing fixtures, rain shower set', 1, 1700, 980),
    L('e5', 'Porcelain floor tile', 45, 9, 7.5, 'sq ft'),
    L('e6', 'Frameless glass shower door', 1, 1150, 640),
  ];
  const strip = (lines) => lines.map(({ unitCost, ...safe }) => safe);
  const internal = {};
  for (const li of [...shared, ...good, ...better, ...best]) if (li.unitCost != null) internal[li.id] = { unitCost: li.unitCost };

  const options = [
    { id: 'opt-good', name: 'Good', description: 'Fiberglass shower and a standard vanity', lineItems: strip(good) },
    { id: 'opt-better', name: 'Better', description: 'Tiled walk-in shower and brushed nickel fixtures', lineItems: strip(better) },
    { id: 'opt-best', name: 'Best', description: 'Tiled shower with bench, double vanity, rain shower', lineItems: strip(best) },
  ];
  const estimateOptions = {
    version: 1, kind: 'estimate', options, sharedLineItems: strip(shared), recommendedId: 'opt-better',
    choice: { optionId: 'opt-better', optionName: 'Better', by: 'contractor', at: iso(-1, 16) },
  };

  const data = {
    estimateNumber: 'EST-1044', title: 'Master bath, three packages', issueDate: day(-3), expiryDate: day(27), status: 'Accepted', taxRate: 0, discount: 0,
    clientName: nair.client_name, clientAddress: nair.client_address, companyName: 'Northline Remodeling',
    companyAddress: '418 Cedar Street, Maple Grove, OH 45000', companyPhone: '(555) 010-2000', companyWebsite: 'northline-demo.example',
    lineItems: strip([...better, ...shared]),
    estimateOptions, estimateOptionsInternal: internal,
    terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.',
    notes: 'Fixtures and tile are chosen with the homeowners before work starts.',
    proposal: {
      sections: [
        { id: 's-scope', kind: 'scope', title: 'Scope of work', style: 'text', text: 'Remove the old tub, vanity and flooring. Build the new shower, set the vanity and fixtures, tile the floor, then patch and paint the walls.' },
        { id: 's-incl', kind: 'inclusions', title: 'Inclusions', style: 'bullets', text: 'All demolition and haul-away\nWaterproofing behind the tile\nGrout and sealer\nCleanup at the end of each day' },
        { id: 's-excl', kind: 'exclusions', title: 'Exclusions', style: 'bullets', text: 'Moving or replacing walls\nRepairs if mold or rot is found behind the walls\nPainting outside the bathroom' },
      ],
      milestones: [], images: [],
    },
  };
  const token = APPROVAL_TOKEN;
  tables.get('documents').push({ id: id(), user_id: uid, job_id: nair.id, type: 'Estimate', data, created_at: iso(-3), updated_at: iso(-1), public_token: token });

  // what the client's approval link shows: no private fields, no recorded choice, still open
  const { choice: _c, ...openSet } = estimateOptions;
  snapshot = {
    document: { id: 'doc-est-1044', type: 'Estimate', job_id: nair.id, created_at: iso(-3), state: 'open', data: { ...data, status: 'Sent', estimateOptions: openSet, estimateOptionsInternal: undefined } },
    contractor: { name: 'Marcus Reed', company_name: 'Northline Remodeling', phone: '(555) 010-2000', email: 'marcus@northline-demo.example', website: 'northline-demo.example', address: '418 Cedar Street, Maple Grove, OH 45000', logo_url: '' },
    link: { can_sign: true },
  };

  // job photos for "From job photos" (the demo storage answers with a generated picture for any file)
  const photos = tables.get('job_photos');
  if (!photos.some((p) => p.job_id === nair.id)) {
    [['before', 'Old tub and vanity', -9], ['during', 'Shower pan and waterproofing', -5], ['during', 'Tile going up on the shower wall', -3]].forEach(([tag, caption, off], i) => {
      photos.push({ id: id(), user_id: uid, job_id: nair.id, storage_path: `${uid}/${nair.id}/bath-${i + 1}.jpg`, thumb_path: `${uid}/${nair.id}/bath-${i + 1}-thumb.jpg`, tag, caption, taken_at: iso(off, 10), width: 1600, height: 1200, size_bytes: 280000, shared_in_portal: false, created_at: iso(off, 10) });
    });
  }

  // one saved proposal template ("Use a template")
  const settings = tables.get('user_settings') || (tables.set('user_settings', []), tables.get('user_settings'));
  if (!settings.some((s) => s.key === 'proposals.templates')) {
    settings.push({ id: id(), user_id: uid, key: 'proposals.templates', created_at: iso(-30), value: { version: 1, templates: [{
      id: 't-bath', name: 'Bathroom remodel', terms: 'This estimate is valid for 30 days. Payment schedule: 50% deposit, 50% upon completion.', updatedAt: iso(-30),
      sections: [{ id: 'ts1', kind: 'scope', title: 'Scope of work', style: 'text', text: 'Remove the old fixtures, rebuild the shower, set the new vanity and fixtures, tile, and paint.' }],
      milestones: [{ id: 'tm1', label: 'Deposit', kind: 'deposit', mode: 'percent', value: 50, due: 'On signing' }, { id: 'tm2', label: 'Final payment', kind: 'final', mode: 'percent', value: 50, due: 'On completion' }],
    }] } });
  }
};

export const rpc = {
  get_document_by_token: (args) => (args && args.doc_token === APPROVAL_TOKEN && snapshot ? snapshot : undefined),
};

// "Review estimate" on Premium + AI: things the contractor may have forgotten (only for the estimate review task)
export const functions = {
  'ai-assistant': async (args) => {
    if (!args || args.task !== 'estimate_review') return undefined;
    return { ok: true, review: { findings: [
      { severity: 'medium', kind: 'missing_item', message: 'A tile job usually needs grout and sealer. It is not on this estimate.', line: { description: 'Grout and sealer', quantity: 1, unit: 'each' } },
      { severity: 'medium', kind: 'missing_expense', message: 'No dump fee or dumpster rental, but this job removes a tub, a vanity and a floor.', line: { description: 'Dump fee and haul-away', quantity: 1 } },
    ] } };
  },
};
