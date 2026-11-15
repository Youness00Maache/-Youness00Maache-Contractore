// Demo data for chapter 24 (measuring from plans, Quick measure). Everything here is made up. Only built for chapter 24.
//
//  - Job "Nair Master Bath" (pinned id, so /jobs/<id> works) has ONE plan in its Plans tab: "Master bath floor plan" (an image, drawn by
//    fake-backend/make-plan-assets.mjs into assets/), with its measurements already saved next to it (scale set from the 8' 6" dimension line,
//    a Drywall area with a cut-out, a Baseboard line and 6 Outlets), so Totals is filled. The plan listing comes from storageList below;
//    the files themselves are served by the fake server from assets/ (by file name).
//  - The estimate EST-1043 stays editable (Sent, not signed) for Quick measure; the seed already has the price book items.

import { NAIR_ID, pinJobs } from './_helpers-b.mjs';

const MINE = new Set(['24']);
const PLAN = 'plan24bath-Master-bath-floor-plan';
const UID = '00000000-0000-4000-8000-000000000001';

export default ({ tables, chapter }) => {
  if (!MINE.has(chapter)) return;
  pinJobs(tables);
};

export const storageList = (bucket, prefix) => {
  if (bucket !== 'document-assets' || prefix !== `${UID}/plans/${NAIR_ID}`) return undefined;
  const at = new Date(Date.now() - 2 * 86400000).toISOString();
  return [
    { name: `${PLAN}.png`, created_at: at, updated_at: at, metadata: { size: 52245, mimetype: 'image/png' } },
    { name: `${PLAN}.measure.json`, created_at: at, updated_at: at, metadata: { size: 1086, mimetype: 'application/json' } },
  ];
};
