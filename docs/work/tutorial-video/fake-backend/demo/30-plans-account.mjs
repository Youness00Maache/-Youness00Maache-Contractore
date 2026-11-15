// Demo data for chapter 30 (plans, pricing and your account). Everything here is made up. Only built for chapter 30.
//
// The demo account is Premium + AI everywhere else; in this chapter it is on the FREE plan, so Settings > Plan & billing shows the
// usage meters with their limits (new jobs, new clients, emails, AI requests) and the Upgrade button, and the Upgrade window offers
// Monthly / Yearly. The recording never goes on to the payment page, and never types DELETE.

const MINE = new Set(['30']);
let free = false;

export default ({ tables, chapter }) => {
  free = MINE.has(chapter);
  if (!free) return;
  const profile = tables.get('profiles')[0];
  Object.assign(profile, { subscription_tier: 'free', subscription_status: null });
};

export const rpc = {
  get_my_usage: () => (free ? {
    tier: 'free', status: 'free', jobs_this_month: 4, clients_total: 6, clients_this_month: 7, emails_this_month: 3, ai_this_month: 9,
    limits: { jobs: 6, clients: 15, docs: 12, emails: 10, ai: 15 }, month_start: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString(),
  } : undefined),
};
