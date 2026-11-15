// Demo data for chapter 28 (the app on your phone, and working offline). Only built for chapter 28.
// The phone scenes need nothing special: the baseline demo already has low stock items and a lead follow-up due (the red number on More),
// clients, inventory and the Settings page. The one thing added here: the job "Nair Master Bath" gets a fixed id, so a phone scene can start
// on its page (/jobs/<id>) after a route change (the bottom bar then shows "New doc").
import { pinJobs } from './_helpers-b.mjs';

export default ({ tables, chapter }) => {
  if (chapter !== '28') return;
  pinJobs(tables);
};
