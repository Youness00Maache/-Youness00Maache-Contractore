// Demo data for chapter 25 (the AI tools). Everything here is made up. Only built for chapter 25. NO real model is ever called: the
// `ai-assistant` edge function is answered below with canned, realistic results (the answers are matched by the request, never invented).
//
//  - AI Command (the router, no `task` in the body): "draft an estimate for a 12 x 14 deck for Greg Halvorsen" -> a GENERATE_DOCUMENT proposal:
//    a Draft estimate with 5 lines; the three lines that match the price book carry the price book prices, the other two have no price
//    (the narration: "it never makes up prices for other lines"). The price book gets 3 deck items for that.
//  - extract_tasks ("Note to tasks"): 3 tasks with who / when. business_summary ("Summarize with AI"): a short summary.
//  - estimate_review is answered by 07-options-proposals.mjs (grout, dump fee), read_document / photo walkthrough are not triggered by the script.
//  - The profile is already Premium + AI (seed), so every AI button is on.

import { pinJobs } from './_helpers-b.mjs';

const MINE = new Set(['25']);
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export default ({ tables, uid, iso, id, chapter }) => {
  if (!MINE.has(chapter)) return;
  pinJobs(tables);
  // price book items for the deck (the AI uses them for the lines it can match)
  const pb = tables.get('saved_items');
  const add = (name, description, rate, unit_cost, unit, category) => pb.push({ id: id(), user_id: uid, name, description, rate, unit_cost, unit, category, type: 'service', taxable: true, use_count: 3, is_favorite: false, created_at: iso(-50) });
  add('Deck framing, pressure-treated', 'Footings, joists and ledger', 11, 6, 'sq ft', 'Decks');
  add('Composite decking install', 'Boards, screws, labor', 14, 8, 'sq ft', 'Decks');
  add('Deck railing, per linear foot', 'Posts, rails and balusters', 42, 24, 'ft', 'Decks');
};

const router = (args, tables) => {
  const msg = String(args.message || '');
  const clients = tables.get('clients') || [];
  const jobs = tables.get('jobs') || [];
  if (/deck/i.test(msg) && /estimate/i.test(msg)) {
    const greg = clients.find((c) => c.name === 'Greg Halvorsen');
    const job = jobs.find((j) => j.name === 'Halvorsen Deck Estimate');
    const lines = [
      { id: 'ai-1', description: 'Deck framing, pressure-treated', quantity: 168, rate: 11, unit: 'sq ft' },
      { id: 'ai-2', description: 'Composite decking install', quantity: 168, rate: 14, unit: 'sq ft' },
      { id: 'ai-3', description: 'Deck railing, per linear foot', quantity: 38, rate: 42, unit: 'ft' },
      { id: 'ai-4', description: 'Stairs, 3 steps', quantity: 1, rate: 0 },
      { id: 'ai-5', description: 'Permit and inspection', quantity: 1, rate: 0 },
    ];
    return {
      ok: true,
      proposal: {
        action_type: 'GENERATE_DOCUMENT', document_type: 'ESTIMATE', job_id: job ? job.id : null, client_ids: greg ? [greg.id] : [],
        reply_text: 'Here is a draft estimate for Greg Halvorsen: a 12 x 14 deck. Three lines use the prices from your price book. I left the stairs and the permit without a price, so you can fill them in.',
        prefill: {
          title: 'Deck, 12 x 14', clientName: 'Greg Halvorsen', clientAddress: greg ? greg.address : '8 Quarry Hill, Lakeside, OH', lineItems: lines, taxRate: 7.5,
          notes: 'Deck size 12 ft x 14 ft. Prices not in your price book are left empty for you to set.', terms: '50% deposit to schedule. Balance on completion.', status: 'Draft',
        },
        missing_fields: [],
      },
      meta: { provider: 'mock', usage: { used: 8, limit: 600, tier: 'ai' } },
    };
  }
  return { ok: true, proposal: { action_type: 'CHAT', reply_text: 'I can draft documents, clients, jobs and emails for you to approve. Tell me what you need, for example "draft an invoice for the Whitfield kitchen".' }, meta: { provider: 'mock', usage: { used: 8, limit: 600, tier: 'ai' } } };
};

export const functions = {
  'ai-assistant': async (args, tables) => {
    if (!args) return undefined;
    if (args.task === 'extract_tasks') {
      return {
        ok: true, task: 'extract_tasks', reply_text: 'I found 3 tasks in your note.',
        tasks: [
          { title: 'Pour the footings', notes: null, due_date: (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); })(), is_milestone: false, assignee_name: null },
          { title: 'Order the windows', notes: 'Mike orders them.', due_date: day(5), is_milestone: false, assignee_name: 'Mike' },
          { title: 'Inspection', notes: 'The inspector comes on the 20th.', due_date: day(5), is_milestone: true, assignee_name: null },
        ],
      };
    }
    if (args.task === 'business_summary') {
      return {
        ok: true, task: 'business_summary',
        summary: {
          headline: 'You billed work this month, but none of it is paid yet, and two estimates are still waiting for a yes.',
          bullets: [
            { kind: 'good', text: 'Your last finished job, the Okafor basement, closed with a healthy margin.' },
            { kind: 'money', text: 'What you billed this month is still waiting to be paid. A reminder can speed it up.' },
            { kind: 'attention', text: 'The master bath estimate has had no answer for over a week. A quick call could close it.' },
          ],
          actions: [{ text: 'Follow up on the master bath estimate' }, { text: 'Remind the client with the overdue invoice' }],
        },
      };
    }
    if (!args.task && typeof args.message === 'string') return router(args, tables);
    return undefined;
  },
};
