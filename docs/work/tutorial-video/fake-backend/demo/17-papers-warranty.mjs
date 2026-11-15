// Demo data for chapter 17 (papers vault, lien waiver, warranty tracking, after-job e-mails). Only built for chapter 17 (GET /__reset?chapter=17).
//
//  - Papers vault: 5 papers: a certificate of insurance (COI) that expires in 25 days and is shown in the client portal, a contractor License valid
//    for most of a year, a Permit linked to "Nair Master Bath" with a next inspection date, a W-9 with no expiry, and one paper that is already
//    expired (red). The COI, the License and the expired one have a file attached (so "Send" shows).
//  - "Okafor Basement Finish" (completed) keeps its PAID invoice INV-2064 (02/seed): the lien waiver picks the amount and the dates from it.
//    It has NO warranty yet: the chapter creates one.
//  - A second, already saved Warranty on "Whitfield Porch Rail Repair" (completed) with one open claim, so the job's Warranties list shows an
//    "open claims" badge.
//  - Gmail stays NOT connected (the demo's start state): the after-job e-mails are off, and the chapter ends with "Connect Gmail first".

const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '17') return;
  const jobs = tables.get('jobs');
  const nair = jobs.find((j) => j.name === 'Nair Master Bath');
  const porch = jobs.find((j) => j.name === 'Whitfield Porch Rail Repair');
  const sarah = tables.get('clients').find((c) => c.name === 'Sarah Whitfield');

  const papers = table(tables, 'company_papers');
  const paper = (kind, title, number, issuer, issuedOn, expiresOn, extra = {}) => ({
    id: id(), user_id: uid, kind, title, number, issuer, issued_on: issuedOn, expires_on: expiresOn, job_id: null, inspection_on: null, coverage_amount: null, file_path: null, file_name: null, file_type: null,
    file_size: null, notes: null, remind: kind !== 'w9', reminder_offsets: [30, 7, 1], show_in_portal: false, last_sent_at: null, last_sent_to: null, created_at: iso(-200), ...extra,
  });
  const file = (name) => ({ file_path: `${uid}/papers/${name}`, file_name: name, file_type: 'application/pdf', file_size: 182000 });
  papers.push(
    paper('coi', 'General liability insurance', 'GL-4471209', 'Summit Mutual Insurance', day(-340), day(25), { coverage_amount: 1000000, show_in_portal: true, ...file('COI-2026.pdf') }),
    paper('license', 'Contractor license', 'OH-CC-88421', 'State Construction Board', day(-65), day(300), { show_in_portal: true, ...file('license-2026.pdf') }),
    paper('permit', 'Building permit', 'BP-2026-0311', 'City of Maple Grove', day(-14), day(75), { job_id: nair && nair.id, inspection_on: day(6) }),
    paper('w9', 'W-9', '', '', null, null, {}),
    paper('coi', 'Workers’ comp certificate', 'WC-220871', 'Summit Mutual Insurance', day(-380), day(-12), { coverage_amount: 500000, ...file('workers-comp.pdf') }),
  );

  // a saved warranty (with one open claim) on the finished porch job
  if (porch && sarah) {
    table(tables, 'documents').push({
      id: id(), user_id: uid, job_id: porch.id, client_id: sarah.id, type: 'Warranty', created_at: iso(-108), updated_at: iso(-20), public_token: id().replace(/-/g, '').slice(0, 24),
      data: {
        warrantyNumber: 'WTY-1003', title: 'Porch rail repair warranty', completedDate: day(-110), duration: '2 Years', clientName: sarah.name, clientAddress: sarah.address, companyName: 'Northline Remodeling',
        coverage: 'Labor and materials for the repaired rail posts and brackets.', conditions: 'Does not cover damage from impact or from removal of the rail.',
        warrantyTracking: {
          v: 1, startDate: day(-110), termValue: 2, termUnit: 'years', lifetime: false, voidedAt: null,
          claims: [{ id: id(), date: day(-20), description: 'One bracket on the left rail feels loose.', status: 'open', resolution: '', resolvedOn: null, photos: [], createdAt: Date.now() - 20 * 86400000, updatedAt: Date.now() - 20 * 86400000 }],
        },
      },
    });
  }
};
