// Demo data, chapter 1 (welcome and setup) AND the baseline for every other chapter (this file runs first).
//
// Baseline (all chapters): the demo account has already seen the first-run tour and switched the setup reminder off, so no tour
// card or setup sheet pops up on top of a chapter.
//
// Chapter 1 ("01") shows both on purpose, on a BRAND-NEW account: the business is empty (no jobs, clients, documents, price book,
// no company name, tax, labor rate or payment link; only the phone and the address are filled in, as from sign-up), the plan is
// Premium + AI (so the "Your team" step shows), and the tour and the setup sheet open by themselves. The recorder asks for this
// state with GET /__reset?chapter=01 (chapters/01-welcome-setup.mjs does it when the recorder loads it).
export default ({ tables, uid, iso, id }) => {
  if (!tables.has('user_settings')) tables.set('user_settings', []);
  const settings = tables.get('user_settings');
  const put = (key, value) => {
    const row = settings.find((r) => r.key === key);
    if (row) row.value = value;
    else settings.push({ id: id(), user_id: uid, key, value, created_at: iso(-60), updated_at: iso(-30) });
  };
  put('help.tour', { seen: true, at: iso(-60) });
  put('setup.state', { v: 1, dismissed: true, skipped: [], last: null, trades: [], sheetShown: true, updatedAt: iso(-30) });
};

/** After every other module has added its data: the brand-new account of chapter 1. */
export const finalize = ({ tables, chapter }) => {
  if (chapter !== '01') return;
  for (const [name, rows] of tables) if (name !== 'profiles') rows.length = 0; // nothing but the account itself
  const p = tables.get('profiles')[0];
  Object.assign(p, {
    company_name: '', website: '', default_labor_rate: null, default_pay_link: '', default_pay_link_label: '', google_review_link: '',
    logo_url: null, created_at: new Date().toISOString(),
  });
};

// "Add and get link" on the Your team step reads the new worker's link token back from this function
export const rpc = {
  crew_links: (args, tables) => (tables.get('crew_members') || []).map((m) => ({ member_id: m.id, token: `demo-clock-in-${String(m.id).slice(0, 8)}` })),
};
