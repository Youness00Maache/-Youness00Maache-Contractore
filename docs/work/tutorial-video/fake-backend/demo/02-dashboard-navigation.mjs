// Demo data, chapter 2 (dashboard and finding your way). Everything that "happened while you were busy": a client reported a
// payment, two quote requests are waiting (one with a follow-up due today), and a few older client decisions were already read,
// so the dashboard cards, the Tools count and the bell (Today / Earlier) all have something to show.
export default ({ tables, uid, day, iso, id }) => {
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const docs = tables.get('documents');
  const jobs = tables.get('jobs');
  const clients = tables.get('clients');
  const byNumber = (key, value) => docs.find((d) => d.data && d.data[key] === value);

  // Sarah says she paid the deposit invoice (card "Payments reported by clients" + a bell item)
  const inv2081 = byNumber('invoiceNumber', 'INV-2081');
  if (inv2081) {
    const note = 'Mailed a check on Friday.';
    inv2081.payment_reported_at = ago(95);
    inv2081.payment_report_note = note;
    inv2081.payment_report_amount = 7740;
    Object.assign(inv2081.data, { paymentReportedAt: ago(95), paymentReportNote: note, paymentReportAmount: 7740 });
  }

  // the next job starts in a few days: the side column's "Next start" card (the seed's jobs all started in the past)
  const deck = jobs.find((j) => j.name === 'Halvorsen Deck Estimate');
  if (deck) deck.start_date = day(3);

  // two older client decisions the owner already looked at: they sit under "Earlier", read
  const lines = (list) => list.map(([description, quantity, rate, unitCost]) => ({ id: id(), description, quantity, rate, unitCost: unitCost || 0 }));
  const whitfieldJob = jobs.find((j) => j.name === 'Whitfield Kitchen Remodel');
  const okaforJob = jobs.find((j) => j.name === 'Okafor Basement Finish');
  const sarah = clients.find((c) => c.name === 'Sarah Whitfield');
  const linda = clients.find((c) => c.name === 'Linda Okafor');
  const company = 'Northline Remodeling';
  const mk = (job, client, type, data, created) => ({ id: id(), user_id: uid, job_id: job.id, client_id: client.id, type, data: { companyName: company, clientName: client.name, clientAddress: client.address, ...data }, created_at: iso(created), updated_at: iso(created), public_token: id().replace(/-/g, '').slice(0, 24) });
  if (whitfieldJob && sarah) {
    docs.push(mk(whitfieldJob, sarah, 'Change Order', {
      changeOrderNumber: 'CO-1001', title: 'Add pot filler at the range', issueDate: day(-10), status: 'Accepted', taxRate: 7.5,
      lineItems: lines([['Pot filler faucet and supply line', 1, 640, 310], ['Plumber, rough-in and tie-in', 1, 380, 0]]),
      clientSignedAt: ago(9 * 24 * 60), clientSignedBy: 'Sarah Whitfield', clientSignatureUrl: SIGNATURE_A, viewedByProvider: true, notes: 'Approved by text first, signed online.',
    }, -10));
  }
  if (okaforJob && linda) {
    docs.push(mk(okaforJob, linda, 'Estimate', {
      estimateNumber: 'EST-1031', title: 'Basement finish', issueDate: day(-84), expiryDate: day(-54), status: 'Accepted', taxRate: 7.5,
      lineItems: lines([['Framing and drywall, 640 sq ft', 1, 9800, 6100], ['Luxury vinyl plank, 640 sq ft', 640, 4.5, 2.6], ['Recessed lighting, 8 fixtures', 8, 165, 85]]),
      clientSignedAt: ago(52 * 24 * 60), clientSignedBy: 'Linda Okafor', clientSignatureUrl: SIGNATURE_B, viewedByProvider: true, terms: '50% deposit to start. Balance on completion.',
    }, -84));
  }

  // quote requests from the request-a-quote link (leads live in the same table): two waiting, one follow-up due today
  if (!tables.has('quote_requests')) tables.set('quote_requests', []);
  const requests = tables.get('quote_requests');
  const req = (name, phone, email, address, details, source, createdMinutes, extra) => ({
    id: id(), user_id: uid, name, phone, email, address, details, photo_paths: [], source, status: 'seen', stage: 'new', lead_source: 'request_page',
    budget_min: null, budget_max: null, follow_up_on: null, lost_reason: null, notes: '', attachments: [], last_contact_at: null, client_id: null, job_id: null,
    created_at: ago(createdMinutes), updated_at: ago(createdMinutes), stage_changed_at: ago(createdMinutes), ...extra,
  });
  requests.push(
    req('Hannah Brooks', '(555) 010-4401', 'hannah.brooks@example.com', '73 Alder Street, Maple Grove, OH', 'Front porch steps are rotting. Need new steps and a railing before winter.', 'qr', 2 * 24 * 60 + 300,
      { stage: 'contacted', follow_up_on: day(0), budget_min: 3000, budget_max: 4500, last_contact_at: ago(24 * 60) }),
    req('Marcus Webb', '(555) 010-4402', 'marcus.webb@example.com', '14 Pine Ridge Road, Lakeside, OH', 'Looking for a quote to repaint the interior of a two-bedroom rental between tenants.', 'google', 26 * 60),
  );
};

// small hand-drawn style signatures (SVG), used as the "signature image" of a client who signed online
export const SIGNATURE_A = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70" width="240" height="70"><path d="M8 48 C22 8 34 10 30 38 C28 54 44 20 56 28 C64 34 52 50 66 40 C80 30 92 26 100 38 C106 46 112 30 124 26 C140 22 150 44 170 34 C182 28 196 32 232 24" fill="none" stroke="#1d3b8b" stroke-width="3" stroke-linecap="round"/></svg>');
export const SIGNATURE_B = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 70" width="240" height="70"><path d="M10 40 C20 14 40 12 42 34 C44 50 36 56 30 46 M52 44 C60 30 70 22 76 36 C80 46 90 24 104 28 C118 32 106 50 124 44 C142 38 150 30 168 34 C186 38 200 30 228 26" fill="none" stroke="#14532d" stroke-width="3" stroke-linecap="round"/></svg>');
