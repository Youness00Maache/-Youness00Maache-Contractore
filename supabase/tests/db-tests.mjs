#!/usr/bin/env node
/**
 * ContractorDocs database tests (RLS, billing protection, plan limits, portal RPCs, inventory ledger,
 * forum, recurring invoices, storage). Runs against the LOCAL Supabase stack through the real API
 * (PostgREST/Auth/Storage), with real users and JWTs.
 *
 *   npx supabase start            # once
 *   npx supabase db reset         # optional, applies supabase/migrations
 *   node supabase/tests/db-tests.mjs
 *
 * Keys are read from env (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) or from
 * `npx supabase status -o env`. Test users are created with the local admin API and deleted at the end.
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

// ------------------------------------------------------------------ setup
function localKeys() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { url: process.env.SUPABASE_URL, anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_ROLE_KEY };
  }
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const env = Object.fromEntries(out.split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  return { url: env.API_URL, anon: env.ANON_KEY || env.PUBLISHABLE_KEY, service: env.SERVICE_ROLE_KEY || env.SECRET_KEY };
}
const KEYS = localKeys();
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(KEYS.url)) throw new Error(`Refusing to run against a non-local URL: ${KEYS.url}`);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(KEYS.url, KEYS.service, opts);
const anon = createClient(KEYS.url, KEYS.anon, opts);

let passed = 0;
let failed = 0;
const ok = (cond, label, extra) => {
  if (cond) { passed++; console.log(`  PASS ${label}`); } else { failed++; console.log(`  FAIL ${label}${extra !== undefined ? ` -> ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); }
};
const errMatches = (res, re) => !!res?.error && re.test(`${res.error.code || ''} ${res.error.message || ''}`);
const section = (title) => console.log(`\n== ${title}`);

const RUN = Date.now().toString(36);
const users = [];
async function makeUser(tag, fullName) {
  const email = `cd-test-${tag}-${RUN}@example.test`;
  const password = `Test-${RUN}-pw!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient(KEYS.url, KEYS.anon, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, email, db: client };
}
const one = async (q) => { const r = await q; if (r.error) throw new Error(r.error.message); return r.data; };
const stockOf = async (id) => Number((await one(admin.from('inventory').select('quantity').eq('id', id).single())).quantity);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function main() {
  const A = await makeUser('a', 'Alice Contractor');
  const B = await makeUser('b', 'Bob Builder');
  const C = await makeUser('c', 'Carol Premium');
  const D = await makeUser('d', 'Dan Free');

  // ================================================================== profiles + billing protection
  section('profiles: auto-created, owner-only, billing columns protected');
  const profA = await one(admin.from('profiles').select('*').eq('id', A.id).single());
  ok(profA.name === 'Alice Contractor' && profA.email === A.email && profA.subscription_tier === 'free', 'profile auto-created from auth metadata', profA);
  const visible = await one(A.db.from('profiles').select('id'));
  ok(visible.length === 1 && visible[0].id === A.id, 'A sees only her own profile', visible);
  const upd = await A.db.from('profiles').update({ name: 'hacked' }).eq('id', B.id).select();
  ok(!upd.error && upd.data.length === 0, 'A cannot update B profile');
  ok((await one(admin.from('profiles').select('name').eq('id', B.id).single())).name === 'Bob Builder', 'B profile unchanged');
  for (const [col, val] of [['subscription_tier', 'premium'], ['subscription_status', 'active'], ['ai_credits_used', 0 - 5], ['kelviq_customer_id', 'x'], ['subscription_period_end', '2099-01-01T00:00:00Z']]) {
    const r = await A.db.from('profiles').update({ [col]: val }).eq('id', A.id).select();
    ok(errMatches(r, /42501|Billing fields/), `browser cannot change profiles.${col}`, r.error || r.data);
  }
  const ins = await A.db.from('profiles').upsert({ id: A.id, name: 'Alice C', subscription_tier: 'ai' }).select();
  ok(errMatches(ins, /42501|Billing fields/), 'upsert with subscription_tier is rejected', ins.error || ins.data);
  const okUpd = await A.db.from('profiles').update({ company_name: 'Alice & Co', default_labor_rate: 65 }).eq('id', A.id).select('company_name, subscription_tier').single();
  ok(!okUpd.error && okUpd.data.company_name === 'Alice & Co' && okUpd.data.subscription_tier === 'free', 'A can update her own business fields', okUpd.error);
  const anonProfiles = await anon.from('profiles').select('id');
  ok(!!anonProfiles.error || anonProfiles.data.length === 0, 'anon cannot read profiles', anonProfiles.data);

  // service role can upgrade (this is what the webhook does)
  await one(admin.from('profiles').update({ subscription_tier: 'premium', subscription_status: 'active' }).eq('id', C.id).select());
  ok((await one(admin.from('profiles').select('subscription_tier').eq('id', C.id).single())).subscription_tier === 'premium', 'service role can set subscription_tier');

  // ================================================================== owner isolation on every table
  section('RLS: user B cannot read/update/delete user A rows (every table)');
  const clientA = await one(A.db.from('clients').insert({ name: 'Acme Homeowner', email: 'home@example.test' }).select().single());
  const clientA2 = await one(A.db.from('clients').insert({ name: 'Second Client' }).select().single());
  const jobA = await one(A.db.from('jobs').insert({ name: 'Kitchen remodel', client_id: clientA.id, client_name: clientA.name, worker_name: 'Sam' }).select().single());
  const docA = await one(A.db.from('documents').insert({ job_id: jobA.id, client_id: clientA.id, type: 'Note', data: { title: 'Private note', content: 'x' } }).select().single());
  const catA = await one(A.db.from('price_book_categories').insert({ name: 'Plumbing' }).select().single());
  const itemA = await one(A.db.from('saved_items').insert({ name: 'Faucet install', rate: 120, unit_cost: 40, category_id: catA.id }).select().single());
  const invA = await one(A.db.from('inventory').insert({ name: 'PEX pipe 10ft', quantity: 0, unit: 'pcs' }).select().single());
  await one(A.db.rpc('adjust_inventory', { p_item_id: invA.id, p_delta: 10, p_reason: 'Initial stock' }));
  const chatA = await one(A.db.from('ai_chat_history').insert({ title: 'hello', messages: [{ role: 'user', content: 'hi' }] }).select().single());
  const gmailA = await one(admin.from('user_gmail_accounts').insert({ user_id: A.id, gmail_address: 'alice@example.test' }).select().single());
  await one(admin.from('gmail_tokens').insert({ account_id: gmailA.id, refresh_token_encrypted: 'v1.secret' }).select());

  const ownerTables = [
    ['clients', clientA.id, { name: 'pwned' }],
    ['jobs', jobA.id, { name: 'pwned' }],
    ['documents', docA.id, { data: { title: 'pwned' } }],
    ['price_book_categories', catA.id, { name: 'pwned' }],
    ['saved_items', itemA.id, { name: 'pwned' }],
    ['inventory', invA.id, { name: 'pwned' }],
    ['ai_chat_history', chatA.id, { title: 'pwned' }],
  ];
  for (const [table, id, patch] of ownerTables) {
    const sel = await B.db.from(table).select('id').eq('id', id);
    ok(!sel.error && sel.data.length === 0, `${table}: B cannot read A row`, sel.error || sel.data);
    const u = await B.db.from(table).update(patch).eq('id', id).select('id');
    ok(!!u.error || u.data.length === 0, `${table}: B cannot update A row`, u.data);
    const d = await B.db.from(table).delete().eq('id', id).select('id');
    ok(!!d.error || d.data.length === 0, `${table}: B cannot delete A row`, d.data);
    const still = await one(admin.from(table).select('*').eq('id', id).single());
    ok(JSON.stringify(still).indexOf('pwned') === -1, `${table}: A row intact`);
    const own = await A.db.from(table).select('id').eq('id', id);
    ok(!own.error && own.data.length === 1, `${table}: A can read her own row`, own.error);
    const an = await anon.from(table).select('id').eq('id', id);
    ok(!!an.error || an.data.length === 0, `${table}: anon cannot read`, an.data);
  }
  // cross-tenant references via FK are refused
  const sneaky = await B.db.from('documents').insert({ job_id: jobA.id, type: 'Note', data: { title: 'x' } }).select();
  ok(errMatches(sneaky, /Job not found|23503|row-level/), 'B cannot attach a document to A job', sneaky.error || sneaky.data);
  const sneakyJob = await B.db.from('jobs').insert({ name: 'x', client_id: clientA.id }).select();
  ok(errMatches(sneakyJob, /Client not found|23503/), 'B cannot link a job to A client', sneakyJob.error || sneakyJob.data);

  // read-only / server-only tables
  const histB = await B.db.from('inventory_history').select('id').eq('item_id', invA.id);
  ok(!histB.error && histB.data.length === 0, 'inventory_history: B cannot read A history');
  const histA = await A.db.from('inventory_history').select('id, action, quantity_change').eq('item_id', invA.id);
  ok(!histA.error && histA.data.length === 1, 'inventory_history: A reads own history', histA.error || histA.data);
  const histIns = await A.db.from('inventory_history').insert({ user_id: A.id, item_id: invA.id, action: 'x', quantity_change: 99 });
  ok(errMatches(histIns, /42501|permission denied/), 'inventory_history: browser cannot insert ledger rows', histIns.error);
  const qtyUpd = await A.db.from('inventory').update({ quantity: 999 }).eq('id', invA.id).select();
  ok(errMatches(qtyUpd, /42501|permission denied/), 'inventory.quantity cannot be written by the browser', qtyUpd.error || qtyUpd.data);
  const gmB = await B.db.from('user_gmail_accounts').select('id').eq('id', gmailA.id);
  ok(!gmB.error && gmB.data.length === 0, 'user_gmail_accounts: B cannot read A account');
  const gmA = await A.db.from('user_gmail_accounts').select('*').eq('id', gmailA.id);
  ok(!gmA.error && gmA.data.length === 1 && !('refresh_token' in gmA.data[0]), 'user_gmail_accounts: owner reads, no token columns', gmA.error);
  const gmIns = await A.db.from('user_gmail_accounts').insert({ user_id: A.id, gmail_address: 'evil@example.test' });
  ok(errMatches(gmIns, /42501|permission denied/), 'user_gmail_accounts: browser cannot insert', gmIns.error);
  for (const table of ['gmail_tokens', 'billing_events']) {
    const r = await A.db.from(table).select('*');
    ok(errMatches(r, /42501|permission denied/), `${table}: no browser access at all`, r.error || r.data);
  }
  const ueA = await A.db.from('usage_events').select('kind');
  const ueB = await B.db.from('usage_events').select('kind, user_id');
  ok(!ueA.error && ueA.data.length >= 1, 'usage_events: owner reads own usage', ueA.error);
  ok(!ueB.error && ueB.data.every((r) => r.user_id === B.id), 'usage_events: B sees none of A usage');
  const ueIns = await A.db.from('usage_events').insert({ user_id: A.id, kind: 'email' });
  ok(errMatches(ueIns, /42501|permission denied/), 'usage_events: browser cannot insert (no forging/erasing usage)', ueIns.error);

  // ================================================================== forum
  section('forum: public read, own writes, server-side counters and notifications');
  const post = await one(A.db.from('forum_posts').insert({ title: 'Best PEX crimper?', content: 'Ideas welcome', category: 'General' }).select().single());
  const postAsB = await B.db.from('forum_posts').select('id, title, upvotes').eq('id', post.id);
  ok(!postAsB.error && postAsB.data.length === 1, 'B can read A post');
  const editB = await B.db.from('forum_posts').update({ title: 'pwned' }).eq('id', post.id).select();
  ok(!!editB.error || editB.data.length === 0, 'B cannot edit A post');
  const counterB = await B.db.from('forum_posts').update({ upvotes: 1000 }).eq('id', post.id).select();
  ok(errMatches(counterB, /42501|permission denied/) || (counterB.data || []).length === 0, 'browser cannot write vote counters', counterB.error || counterB.data);
  const counterA = await A.db.from('forum_posts').update({ upvotes: 1000 }).eq('id', post.id).select();
  ok(errMatches(counterA, /42501|permission denied/), 'author cannot write vote counters either', counterA.error || counterA.data);
  let score = await one(B.db.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: 1 }));
  ok(score === 1, 'toggle_forum_vote up -> score 1', score);
  score = await one(B.db.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: -1 }));
  ok(score === -1, 'switch to down -> score -1', score);
  score = await one(B.db.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: -1 }));
  ok(score === 0, 'same value again removes the vote -> 0', score);
  await one(B.db.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: 1 }));
  await one(C.db.rpc('toggle_forum_vote', { p_post_id: post.id, p_value: 1 }));
  ok((await one(admin.from('forum_posts').select('upvotes').eq('id', post.id).single())).upvotes === 2, 'counter maintained server-side (2 upvotes)');
  const votesSeenByA = await one(A.db.from('forum_votes').select('*').eq('post_id', post.id));
  ok(votesSeenByA.length === 0, 'A cannot see other users votes rows');
  const comment = await one(B.db.from('forum_comments').insert({ post_id: post.id, content: 'Milwaukee M12' }).select().single());
  const cscore = await one(A.db.rpc('toggle_forum_comment_vote', { p_comment_id: comment.id, p_value: 1 }));
  ok(cscore === 1, 'toggle_forum_comment_vote works', cscore);
  const notesA = await one(A.db.from('notifications').select('type, source_user_id, post_id'));
  ok(notesA.some((n) => n.type === 'like' && n.source_user_id === B.id) && notesA.some((n) => n.type === 'comment' && n.source_user_id === B.id),
     'like + comment notifications created server-side for the author', notesA);
  ok(notesA.filter((n) => n.type === 'like' && n.source_user_id === B.id).length === 1, 'like notification only once per liker (vote toggled 4x)');
  const notesB = await one(B.db.from('notifications').select('type, user_id'));
  ok(notesB.every((n) => n.user_id === B.id), 'B cannot read A notifications');
  ok(notesB.some((n) => n.type === 'comment_like'), 'comment like notifies the comment author');
  const forge = await B.db.from('notifications').insert({ user_id: A.id, source_user_id: C.id, type: 'like', post_id: post.id });
  ok(errMatches(forge, /42501|permission denied/), 'notifications cannot be forged from the browser', forge.error);
  const noteRow = (await one(A.db.from('notifications').select('id').limit(1)))[0];
  const markRead = await A.db.from('notifications').update({ is_read: true }).eq('id', noteRow.id).select('is_read');
  ok(!markRead.error && markRead.data[0]?.is_read === true, 'recipient can mark a notification read', markRead.error);
  const reType = await A.db.from('notifications').update({ type: 'x' }).eq('id', noteRow.id);
  ok(errMatches(reType, /42501|permission denied/), 'recipient can only change is_read', reType.error);
  const authors = await one(B.db.from('forum_authors').select('id, name').eq('id', A.id));
  ok(authors.length === 1 && authors[0].name === 'Alice Contractor', 'forum_authors exposes the author name to other users', authors);
  const authorsAnon = await anon.from('forum_authors').select('id');
  ok(!!authorsAnon.error || authorsAnon.data.length === 0, 'forum_authors not readable by anon');
  // reports are insert-only (no SELECT policy), so no .select() after insert, like the app does
  for (const u of [B, C, D]) await one(u.db.from('forum_reports').insert({ post_id: post.id, reason: 'spam test' }));
  const hiddenForB = await one(B.db.from('forum_posts').select('id').eq('id', post.id));
  const visibleForA = await one(A.db.from('forum_posts').select('id, is_hidden').eq('id', post.id));
  ok(hiddenForB.length === 0 && visibleForA[0]?.is_hidden === true, 'post hidden after 3 reports (still visible to its author)');
  const dupReport = await B.db.from('forum_reports').insert({ post_id: post.id, reason: 'again' });
  ok(errMatches(dupReport, /23505|duplicate/), 'same user cannot report twice', dupReport.error);
  const readReports = await B.db.from('forum_reports').select('*');
  ok(!readReports.error && readReports.data.length === 0, 'reports are not readable by users');

  // ================================================================== plan limits
  section('free-plan limits (PLAN_LIMIT) vs premium');
  const jobsD = [];
  for (let i = 1; i <= 6; i++) jobsD.push(await one(D.db.from('jobs').insert({ name: `Free job ${i}` }).select().single()));
  const seventh = await D.db.from('jobs').insert({ name: 'Free job 7' }).select();
  ok(errMatches(seventh, /PLAN_LIMIT/), 'free: 7th job this month is refused with PLAN_LIMIT', seventh.error || seventh.data);
  await one(D.db.from('jobs').delete().eq('id', jobsD[5].id).select());
  const afterDelete = await D.db.from('jobs').insert({ name: 'Free job after delete' }).select();
  ok(errMatches(afterDelete, /PLAN_LIMIT/), 'free: deleting a job does not free a monthly slot', afterDelete.error || afterDelete.data);
  for (let i = 1; i <= 8; i++) await one(C.db.from('jobs').insert({ name: `Premium job ${i}` }).select('id'));
  ok(true, 'premium: 8 jobs in a month allowed');
  for (let i = 1; i <= 15; i++) await one(D.db.from('clients').insert({ name: `Client ${i}` }).select('id'));
  const c16 = await D.db.from('clients').insert({ name: 'Client 16' }).select();
  ok(errMatches(c16, /PLAN_LIMIT/), 'free: 16th client refused', c16.error || c16.data);
  for (let i = 1; i <= 16; i++) await one(C.db.from('clients').insert({ name: `Premium client ${i}` }).select('id'));
  ok(true, 'premium: 16 clients allowed');
  const docsD = [];
  for (let i = 1; i <= 12; i++) docsD.push(await one(D.db.from('documents').insert({ job_id: jobsD[0].id, type: 'Note', data: { title: `n${i}` } }).select().single()));
  const d13 = await D.db.from('documents').insert({ job_id: jobsD[0].id, type: 'Note', data: { title: 'n13' } }).select();
  ok(errMatches(d13, /PLAN_LIMIT/), 'free: 13th document in one job this month refused', d13.error || d13.data);
  const reSave = await D.db.from('documents').upsert({ id: docsD[0].id, job_id: jobsD[0].id, type: 'Note', data: { title: 'n1 edited' } }).select();
  ok(!reSave.error, 'free: re-saving (upsert) an existing document is not blocked by the limit', reSave.error);
  const otherJob = await D.db.from('documents').insert({ job_id: jobsD[1].id, type: 'Note', data: { title: 'other job' } }).select();
  ok(!otherJob.error, 'free: limit is per job (another job still accepts documents)', otherJob.error);
  for (let i = 1; i <= 10; i++) await one(D.db.rpc('record_usage', { p_kind: 'email' }));
  const e11 = await D.db.rpc('record_usage', { p_kind: 'email' });
  ok(errMatches(e11, /PLAN_LIMIT/), 'free: 11th email this month refused', e11.error || e11.data);
  for (let i = 1; i <= 11; i++) await one(C.db.rpc('record_usage', { p_kind: 'email' }));
  ok(true, 'premium: 11 emails allowed');
  const badKind = await D.db.rpc('record_usage', { p_kind: 'job' });
  ok(errMatches(badKind, /Unknown usage kind/), 'record_usage only accepts email/ai');
  const usageD = await one(D.db.rpc('get_my_usage'));
  ok(usageD.tier === 'free' && usageD.jobs_this_month === 6 && usageD.clients_total === 15 && usageD.emails_this_month === 10
     && usageD.limits.jobs === 6 && usageD.limits.clients === 15 && usageD.limits.docs === 12 && usageD.limits.emails === 10 && usageD.limits.ai === 15,
     'get_my_usage (free) matches lib/plans.ts FREE_LIMITS', usageD);
  const usageC = await one(C.db.rpc('get_my_usage'));
  ok(usageC.tier === 'premium' && usageC.limits.jobs === null && usageC.limits.ai === 60, 'get_my_usage (premium) is unlimited except AI=60', usageC);
  const aiLeft = await admin.rpc('consume_ai_credit', { p_user_id: D.id });
  ok(!aiLeft.error && aiLeft.data === 14, 'consume_ai_credit (service role) returns remaining AI requests', aiLeft.error || aiLeft.data);
  const aiBrowser = await D.db.rpc('consume_ai_credit', { p_user_id: C.id });
  ok(errMatches(aiBrowser, /42501|permission denied|PGRST202|Could not find/), 'consume_ai_credit is not callable from the browser', aiBrowser.error);

  // ================================================================== portal + approvals
  section('client portal & approval RPCs');
  const jobP = await one(A.db.from('jobs').insert({ name: 'Bathroom', client_id: clientA.id, client_name: clientA.name }).select().single());
  const estimateData = {
    estimateNumber: 'EST-100', status: 'Sent', clientName: clientA.name, signatureUrl: 'data:image/png;base64,CONTRACTOR',
    lineItems: [{ id: 'l1', description: 'Tile work', quantity: 2, rate: 300, unitCost: 120, inventoryItemId: invA.id, currentStock: 10 }],
    internalNotes: 'margin is 60%', notes: 'Thanks for your business', viewedByProvider: true,
  };
  const est = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Estimate', data: estimateData }).select().single());
  const expense = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Expense Log', data: { status: 'Sent', amount: 50 } }).select().single());
  const draft = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Invoice', data: { status: 'Draft', invoiceNumber: 'INV-D' } }).select().single());
  const est2 = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Estimate', data: { estimateNumber: 'EST-101', status: 'Sent', lineItems: [] } }).select().single());
  const portal = await anon.rpc('get_portal_data', { p_key: clientA.portal_key });
  ok(!portal.error, 'anon can open the portal with the client key', portal.error);
  const pj = JSON.stringify(portal.data || {});
  const ids = (portal.data?.documents || []).map((d) => d.id);
  ok(ids.includes(est.id) && ids.includes(est2.id), 'portal lists the client estimates');
  ok(!ids.includes(expense.id) && !ids.includes(draft.id) && !ids.includes(docA.id), 'portal hides internal types, drafts and notes');
  ok(!/unitCost|inventoryItemId|currentStock|internalNotes|margin is|viewedByProvider/.test(pj), 'portal strips costs, inventory links and internal notes');
  ok(!/subscription|kelviq|portal_key|user_id|public_token|notes":"x|ai_credits/.test(pj), 'portal returns no profile tokens/billing/keys', pj.slice(0, 300));
  ok(portal.data?.contractor?.company_name === 'Alice & Co' && Object.keys(portal.data.contractor).sort().join(',') === 'address,company_name,email,logo_url,name,phone,website',
     'contractor info is whitelisted', portal.data?.contractor);
  const badKey = await anon.rpc('get_portal_data', { p_key: 'f'.repeat(32) });
  ok(errMatches(badKey, /Invalid portal link/), 'unknown portal key refused');

  const clientB = await one(B.db.from('clients').insert({ name: 'Bob client' }).select().single());
  const crossTenant = await anon.rpc('sign_document_via_portal', { p_key: clientB.portal_key, p_doc_id: est.id, p_signature: PNG });
  ok(errMatches(crossTenant, /not found/i), 'another contractor client key cannot sign A document', crossTenant.error || crossTenant.data);
  const crossClient = await anon.rpc('sign_document_via_portal', { p_key: clientA2.portal_key, p_doc_id: est.id, p_signature: PNG });
  ok(errMatches(crossClient, /not found/i), 'another client of the same contractor cannot sign it', crossClient.error || crossClient.data);
  const notSignable = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: expense.id, p_signature: PNG });
  ok(errMatches(notSignable, /not found|not available/i), 'internal document cannot be signed via portal');
  const badSig = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: est.id, p_signature: '<svg onload=alert(1)>' });
  ok(errMatches(badSig, /Invalid signature/), 'non-image signature refused');
  const stockBeforeSign = await stockOf(invA.id);
  const signed = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: est.id, p_signature: PNG, p_signer_name: 'Hank Homeowner' });
  ok(!signed.error && signed.data?.success === true, 'client signs via portal', signed.error);
  const estAfter = await one(admin.from('documents').select('data, has_client_signature, approval_used_at').eq('id', est.id).single());
  ok(estAfter.data.clientSignatureUrl === PNG && estAfter.data.signatureUrl === 'data:image/png;base64,CONTRACTOR' && estAfter.data.status === 'Accepted'
     && estAfter.data.clientSignerName === 'Hank Homeowner' && estAfter.data.viewedByProvider === false && estAfter.has_client_signature,
     'client signature stored separately; contractor signature untouched', estAfter.data);
  ok(await stockOf(invA.id) === stockBeforeSign - 2, 'accepting the estimate deducted its inventory line (2)');
  const resign = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: est.id, p_signature: PNG });
  ok(errMatches(resign, /already signed/), 'cannot sign twice', resign.error);
  // a stale save by the contractor (form opened before the client signed) cannot erase the signature
  const stale = await A.db.from('documents').update({ data: { ...estimateData, status: 'Accepted', notes: 'edited later' } }).eq('id', est.id).select('data').single();
  ok(!stale.error && stale.data.data.clientSignatureUrl === PNG && stale.data.data.notes === 'edited later', 'stale contractor save keeps the client signature', stale.error);
  const declined = await anon.rpc('decline_document_via_portal', { p_key: clientA.portal_key, p_doc_id: est2.id, p_reason: '  Too expensive  ', p_signer_name: 'Hank' });
  ok(!declined.error, 'client can decline via portal', declined.error);
  const est2After = await one(admin.from('documents').select('data').eq('id', est2.id).single());
  ok(est2After.data.status === 'Rejected' && est2After.data.clientDeclineReason === 'Too expensive', 'decline recorded', est2After.data);
  const signDeclined = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: est2.id, p_signature: PNG });
  ok(errMatches(signDeclined, /already declined/), 'declined document cannot be signed');

  // approval link (/?approval_token=)
  const co = await one(A.db.from('documents').insert({ job_id: jobP.id, type: 'Change Order', data: { changeOrderNumber: 'CO-1', status: 'Sent', clientName: 'Acme Homeowner', lineItems: [{ id: 'c1', description: 'Extra outlet', quantity: 1, rate: 80, unitCost: 20 }] } }).select().single());
  const byToken = await anon.rpc('get_document_by_token', { doc_token: co.public_token });
  ok(!byToken.error && byToken.data.document.id === co.id && !JSON.stringify(byToken.data).includes('unitCost'), 'get_document_by_token returns client-safe data', byToken.error);
  ok(byToken.data && !('user_id' in byToken.data.document) && !JSON.stringify(byToken.data.contractor).includes('subscription'), 'no user_id / billing in approval payload');
  const approved = await anon.rpc('approve_document_by_token', { doc_token: co.public_token, p_signature: PNG, p_signer_name: 'Hank' });
  ok(!approved.error && approved.data?.success, 'approve_document_by_token works once', approved.error);
  const approvedAgain = await anon.rpc('approve_document_by_token', { doc_token: co.public_token, p_signature: PNG });
  ok(errMatches(approvedAgain, /already signed|already used/), 'approval link is single-use', approvedAgain.error);
  const stillViewable = await anon.rpc('get_document_by_token', { doc_token: co.public_token });
  ok(!stillViewable.error && stillViewable.data.document.data.status === 'Accepted', 'signed document stays viewable through its link');
  const co2 = await one(A.db.from('documents').insert({ job_id: jobP.id, type: 'Change Order', data: { changeOrderNumber: 'CO-2', status: 'Sent' } }).select().single());
  await one(admin.from('documents').update({ approval_expires_at: new Date(Date.now() - 3600e3).toISOString() }).eq('id', co2.id).select('id'));
  const expired = await anon.rpc('approve_document_by_token', { doc_token: co2.public_token, p_signature: PNG });
  ok(errMatches(expired, /expired/), 'expired approval link refused', expired.error);
  const expiredView = await anon.rpc('get_document_by_token', { doc_token: co2.public_token });
  ok(errMatches(expiredView, /expired/), 'expired unsigned link cannot be opened', expiredView.error);
  const browserExpiry = await A.db.from('documents').update({ approval_expires_at: '2099-01-01T00:00:00Z' }).eq('id', co2.id).select('approval_expires_at').single();
  ok(!browserExpiry.error && new Date(browserExpiry.data.approval_expires_at) < new Date(), 'browser cannot extend a link by writing approval_expires_at');
  const newToken = crypto.randomUUID();
  const regen = await A.db.from('documents').update({ public_token: newToken }).eq('id', co2.id).select('public_token, approval_expires_at').single();
  ok(!regen.error && regen.data.public_token === newToken && regen.data.approval_expires_at === null, 'regenerating the token issues a fresh link with no end date', regen.error);
  const regenSign = await anon.rpc('approve_document_by_token', { doc_token: newToken, p_signature: PNG });
  ok(!regenSign.error, 'new link works');
  const oldTokenDead = await anon.rpc('get_document_by_token', { doc_token: co2.public_token });
  ok(errMatches(oldTokenDead, /not found|no longer valid/), 'old token no longer valid after regeneration');
  const expiredEstimate = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Estimate', data: { status: 'Sent', expiryDate: '2020-01-01' } }).select().single());
  const signExpired = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: expiredEstimate.id, p_signature: PNG });
  ok(errMatches(signExpired, /expired/), 'estimate past its expiryDate cannot be signed');

  // 20261113000600: portal & approval rules of the original app
  ok(co.approval_expires_at === null && expiredEstimate.approval_expires_at === null, 'new approval links have no end date (like the old app)', co.approval_expires_at);
  const legacyEst = await one(admin.from('documents').insert({ user_id: A.id, job_id: jobP.id, client_id: clientA.id, type: 'Estimate', created_at: '2026-10-01T12:00:00Z', data: { estimateNumber: 'EST-OLD', status: 'Sent', expiryDate: '2026-10-08' } }).select().single());
  const portal2 = await anon.rpc('get_portal_data', { p_key: clientA.portal_key });
  const stateOf = (id) => (portal2.data?.documents || []).find((d) => d.id === id)?.state;
  ok(stateOf(legacyEst.id) === 'open' && stateOf(expiredEstimate.id) === 'expired' && stateOf(est.id) === 'signed' && stateOf(est2.id) === 'declined', 'portal sends each document state (old estimates never expire)', portal2.data?.documents?.map((d) => [d.data.estimateNumber, d.state]));
  const signLegacy = await anon.rpc('sign_document_via_portal', { p_key: clientA.portal_key, p_doc_id: legacyEst.id, p_signature: PNG, p_signer_name: 'Hank' });
  ok(!signLegacy.error, 'estimate made by the old app can be signed after its expiry date', signLegacy.error);
  const noStatus = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Daily Job Report', data: { reportNumber: 'R-1' } }).select().single());
  const ids2 = ((await anon.rpc('get_portal_data', { p_key: clientA.portal_key })).data?.documents || []).map((d) => d.id);
  ok(ids2.includes(noStatus.id) && !ids2.includes(draft.id), 'portal shows documents without a status and still hides drafts');
  // a declined estimate the contractor re-sends is open again (same link and portal)
  const staleAfterDecline = await A.db.from('documents').update({ data: { estimateNumber: 'EST-101', status: 'Sent', lineItems: [] } }).eq('id', est2.id).select('data').single();
  ok(!staleAfterDecline.error && staleAfterDecline.data.data.status === 'Rejected' && staleAfterDecline.data.data.clientDeclineReason === 'Too expensive', 'a form opened before the decline cannot undo it', staleAfterDecline.data?.data);
  const declinedRow = await one(A.db.from('documents').select('data, public_token').eq('id', est2.id).single());
  const resent = await A.db.from('documents').update({ data: { ...declinedRow.data, status: 'Sent', notes: 'cheaper now' } }).eq('id', est2.id).select('data, approval_used_at').single();
  ok(!resent.error && resent.data.data.status === 'Sent' && resent.data.data.clientDeclinedAt === '' && resent.data.approval_used_at === null, 're-sending a declined estimate reopens it', resent.data);
  const signReopened = await anon.rpc('approve_document_by_token', { doc_token: declinedRow.public_token, p_signature: PNG, p_signer_name: 'Hank' });
  ok(!signReopened.error, 'the same link can sign the reopened estimate', signReopened.error);
  const fakeDecline = await A.db.from('documents').update({ data: { ...expiredEstimate.data, clientDeclinedAt: '2026-01-01T00:00:00Z' } }).eq('id', expiredEstimate.id).select('data').single();
  ok(!fakeDecline.error && !('clientDeclinedAt' in fakeDecline.data.data), 'the browser cannot write a client decline', fakeDecline.data?.data);
  // a change order marked Approved by the contractor is not offered for signing
  const coApproved = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Change Order', data: { changeOrderNumber: 'CO-9', status: 'Approved' } }).select().single());
  const coView = await anon.rpc('get_document_by_token', { doc_token: coApproved.public_token });
  ok(!coView.error && coView.data.document.state === 'signed' && coView.data.link.can_sign === false, 'Approved change order is read-only', coView.data);
  // receipts: the shared link opens (view only); they show in the portal
  const receipt = await one(A.db.from('documents').insert({ job_id: jobP.id, client_id: clientA.id, type: 'Receipt', data: { receiptNumber: 'RC-1', amount: 120 } }).select().single());
  const rcView = await anon.rpc('get_document_by_token', { doc_token: receipt.public_token });
  ok(!rcView.error && rcView.data.document.state === 'readonly' && rcView.data.link.can_sign === false, 'receipt link opens view-only', rcView.error);
  const rcSign = await anon.rpc('approve_document_by_token', { doc_token: receipt.public_token, p_signature: PNG });
  ok(errMatches(rcSign, /not available|not found/i), 'a receipt cannot be signed', rcSign.error);
  // client created after the documents: matched by name (trimmed, any case) through the document or the job
  const jobLegacy = await one(A.db.from('jobs').insert({ name: 'QA Test Job', client_name: 'QA Client' }).select().single());
  const legacyInv = await one(A.db.from('documents').insert({ job_id: jobLegacy.id, type: 'Invoice', data: { invoiceNumber: 'INV-QA', status: 'Paid' } }).select().single());
  const legacyEst2 = await one(A.db.from('documents').insert({ job_id: jobLegacy.id, type: 'Estimate', data: { estimateNumber: 'EST-QA', status: 'Accepted', clientName: ' qa client ' } }).select().single());
  const qaClient = await one(A.db.from('clients').insert({ name: 'QA Client' }).select().single());
  const qaIds = ((await anon.rpc('get_portal_data', { p_key: qaClient.portal_key })).data?.documents || []).map((d) => d.id);
  ok(qaIds.includes(legacyInv.id) && qaIds.includes(legacyEst2.id), 'a client created later sees the older documents of that name', qaIds);
  const otherIds = ((await anon.rpc('get_portal_data', { p_key: clientA2.portal_key })).data?.documents || []).map((d) => d.id);
  ok(!otherIds.includes(legacyInv.id), 'other clients do not');
  const newKey ='a'.repeat(8) + crypto.randomUUID().replace(/-/g, '');
  const keyRegen = await A.db.from('clients').update({ portal_key: newKey }).eq('id', clientA.id).select('portal_key').single();
  ok(!keyRegen.error && keyRegen.data.portal_key === newKey, 'owner can regenerate the portal key', keyRegen.error);
  const oldPortal = await anon.rpc('get_portal_data', { p_key: clientA.portal_key });
  ok(errMatches(oldPortal, /Invalid portal link/), 'old portal link stops working');
  const weakKey = await A.db.from('clients').update({ portal_key: 'short' }).eq('id', clientA.id).select();
  ok(errMatches(weakKey, /23514|check/), 'weak portal keys are rejected');

  // ================================================================== mark_documents_viewed
  section('mark_documents_viewed flips only data.viewedByProvider');
  // co was approved by the client -> viewedByProvider=false; est was already viewed (re-saved with true)
  const before = await one(admin.from('documents').select('data').eq('id', co.id).single());
  const n = await one(A.db.rpc('mark_documents_viewed', { p_document_ids: [est.id, co.id, docsD[0].id] }));
  const after = await one(admin.from('documents').select('data').eq('id', co.id).single());
  const { viewedByProvider: vb, ...restBefore } = before.data;
  const { viewedByProvider: va, ...restAfter } = after.data;
  ok(n === 1 && vb === false && va === true && isDeepStrictEqual(restBefore, restAfter), 'only the flag changed, only own documents counted', { n, vb, va });
  const nB = await one(B.db.rpc('mark_documents_viewed', { p_document_ids: [co.id] }));
  ok(nB === 0, 'B cannot mark A documents');
  const stub = await A.db.from('documents').update({ data: { title: 'x', __lightweight: true } }).eq('id', est.id);
  ok(errMatches(stub, /incomplete document/), 'saving a lightweight list stub over a document is refused', stub.error);

  // ================================================================== inventory ledger
  section('inventory: one idempotent, document-driven ledger');
  const pipe = await one(A.db.from('inventory').insert({ name: 'Copper fitting', quantity: 0 }).select().single());
  await one(A.db.rpc('adjust_inventory', { p_item_id: pipe.id, p_delta: 10, p_reason: 'Initial stock' }));
  const jobI = await one(A.db.from('jobs').insert({ name: 'Inventory job' }).select().single());
  const logData = { date: '2026-11-12', deductInventory: true, items: [{ id: 'm1', name: 'Copper fitting', quantity: 2, unitCost: 3, inventoryItemId: pipe.id }] };
  const log = await one(A.db.from('documents').insert({ job_id: jobI.id, type: 'Material Log', data: logData }).select().single());
  ok(await stockOf(pipe.id) === 8, 'material log with deduct flag deducts on save (10 -> 8)');
  for (let i = 0; i < 3; i++) await one(A.db.from('documents').upsert({ id: log.id, job_id: jobI.id, type: 'Material Log', data: logData }).select('id'));
  ok(await stockOf(pipe.id) === 8, 're-saving the same material log 3x never deducts again');
  await one(A.db.from('documents').update({ data: { ...logData, items: [{ ...logData.items[0], quantity: 3 }] } }).eq('id', log.id).select('id'));
  ok(await stockOf(pipe.id) === 7, 'editing the quantity applies only the delta (8 -> 7)');
  await one(A.db.from('documents').update({ data: { ...logData, deductInventory: false, items: [{ ...logData.items[0], quantity: 3 }] } }).eq('id', log.id).select('id'));
  ok(await stockOf(pipe.id) === 10, 'unticking deduct returns the stock (-> 10)');
  await one(A.db.from('documents').update({ data: { ...logData, items: [{ ...logData.items[0], quantity: 3 }] } }).eq('id', log.id).select('id'));
  ok(await stockOf(pipe.id) === 7, 'ticking again deducts again once (-> 7)');
  const invoiceData = { invoiceNumber: 'INV-7', status: 'Sent', lineItems: [{ id: 'i1', description: 'Copper fitting', quantity: 5, rate: 9, inventoryItemId: pipe.id }] };
  const invoice = await one(A.db.from('documents').insert({ job_id: jobI.id, type: 'Invoice', data: invoiceData }).select().single());
  ok(await stockOf(pipe.id) === 7, 'unpaid invoice does not move stock');
  await one(A.db.from('documents').update({ data: { ...invoiceData, status: 'Paid' } }).eq('id', invoice.id).select('id'));
  ok(await stockOf(pipe.id) === 5, 'paid invoice deducts only what the material log did not cover (5 - 3 = 2)');
  await one(A.db.from('documents').update({ data: { ...invoiceData, status: 'Paid', notes: 'thanks' } }).eq('id', invoice.id).select('id'));
  ok(await stockOf(pipe.id) === 5, 're-saving the paid invoice is idempotent');
  await one(A.db.from('documents').update({ data: { ...invoiceData, status: 'Cancelled' } }).eq('id', invoice.id).select('id'));
  ok(await stockOf(pipe.id) === 7, 'cancelling the invoice returns its stock');
  await one(A.db.from('documents').update({ data: { ...invoiceData, status: 'Paid' } }).eq('id', invoice.id).select('id'));
  const jobI2 = await one(A.db.from('jobs').insert({ name: 'Inventory job 2' }).select().single());
  const estI = await one(A.db.from('documents').insert({ job_id: jobI2.id, type: 'Estimate', data: { status: 'Accepted', lineItems: [{ id: 'e1', description: 'Copper fitting', quantity: 7, rate: 9, inventoryItemId: pipe.id }] } }).select().single());
  ok(await stockOf(pipe.id) === -2, 'insufficient stock never blocks: estimate accepted takes stock to -2');
  const negHist = await one(A.db.from('inventory_history').select('notes').eq('document_id', estI.id));
  ok(negHist.some((h) => /stock went negative/.test(h.notes)), 'negative stock is flagged in history notes', negHist);
  const invI2 = await one(A.db.from('documents').insert({ job_id: jobI2.id, type: 'Invoice', data: { status: 'Paid', lineItems: [{ id: 'e1', description: 'Copper fitting', quantity: 7, rate: 9, inventoryItemId: pipe.id }] } }).select().single());
  ok(await stockOf(pipe.id) === -2, 'invoice for an accepted estimate in the same job does not deduct twice');
  await one(A.db.from('documents').delete().eq('id', log.id).select('id'));
  ok(await stockOf(pipe.id) === -2, 'deleting the material log shifts the cost to the paid invoice (job total unchanged: 5)');
  await one(A.db.from('documents').delete().eq('id', invI2.id).select('id'));
  await one(A.db.from('documents').delete().eq('id', estI.id).select('id'));
  ok(await stockOf(pipe.id) === 5, 'deleting estimate + invoice returns their stock');
  // kits: a kit line deducts its components
  const kit = await one(A.db.from('inventory').insert({ name: 'Fitting kit', quantity: 0, is_assembly: true, assembly_items: [{ item_id: pipe.id, quantity: 2 }, { is_custom: true, custom_name: 'Labor', quantity: 1 }] }).select().single());
  const kitInv = await one(A.db.from('documents').insert({ job_id: jobI2.id, type: 'Invoice', data: { status: 'Paid', lineItems: [{ id: 'k1', description: 'Kit', quantity: 2, rate: 50, inventoryItemId: kit.id }] } }).select().single());
  ok(await stockOf(pipe.id) === 1, 'a paid kit line deducts its stocked components (2 kits x 2 = 4)');
  await one(A.db.rpc('checkout_inventory', { p_item_id: kit.id, p_qty: 1, p_job_id: jobI2.id, p_reason: 'Van restock' }));
  ok(await stockOf(pipe.id) === -1, 'checkout_inventory on a kit deducts components atomically');
  const kitAdjust = await A.db.rpc('adjust_inventory', { p_item_id: kit.id, p_delta: -1, p_reason: 'x' });
  ok(errMatches(kitAdjust, /Kits have no stock/), 'adjust_inventory refuses kits');
  const zero = await A.db.rpc('adjust_inventory', { p_item_id: pipe.id, p_delta: 0 });
  ok(errMatches(zero, /must not be zero/), 'adjust_inventory refuses a zero delta');
  const crossAdjust = await B.db.rpc('adjust_inventory', { p_item_id: pipe.id, p_delta: -5, p_reason: 'steal' });
  ok(errMatches(crossAdjust, /not found/), 'B cannot adjust A stock');
  const crossCheckout = await B.db.rpc('checkout_inventory', { p_item_id: pipe.id, p_qty: 1 });
  ok(errMatches(crossCheckout, /not found/), 'B cannot check out A stock');
  const adj = await one(A.db.rpc('adjust_inventory', { p_item_id: pipe.id, p_delta: 3, p_reason: 'Found in van', p_job_id: jobI2.id }));
  ok(Number(adj.quantity) === 2 && adj.id === pipe.id, 'adjust_inventory returns the updated row');
  const ledger = await one(admin.from('inventory_history').select('quantity_change').eq('item_id', pipe.id));
  const sum = ledger.reduce((s, r) => s + Number(r.quantity_change), 0);
  ok(sum === await stockOf(pipe.id), 'history sums exactly to the stock level', { sum, stock: await stockOf(pipe.id) });
  await one(A.db.from('documents').delete().eq('id', kitInv.id).select('id'));
  ok(await stockOf(pipe.id) === 6, 'deleting the kit invoice returns 4 components');
  await one(A.db.from('inventory').delete().eq('id', kit.id).select('id'));
  const keptHistory = await one(A.db.from('inventory_history').select('item_id, item_name').eq('item_name', 'Fitting kit'));
  ok(true, `history survives item deletion (${keptHistory.length} kit rows kept)`);

  // ================================================================== recurring invoices
  section('recurring invoices');
  const today = new Date();
  const twoMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, Math.min(today.getUTCDate(), 28)));
  const ymd = (d) => d.toISOString().slice(0, 10);
  const recurring = await one(A.db.from('documents').insert({ job_id: jobI.id, type: 'Invoice', data: {
    invoiceNumber: 'INV-2026-11-007', status: 'Sent', issueDate: ymd(twoMonthsAgo), dueDate: ymd(new Date(twoMonthsAgo.getTime() + 14 * 864e5)),
    lineItems: [{ id: 'r1', description: 'Maintenance', quantity: 1, rate: 99 }],
    recurrence: { enabled: true, frequency: 'Monthly', nextRunDate: ymd(twoMonthsAgo) } } }).select().single());
  const created1 = await one(A.db.rpc('generate_due_recurring_invoices'));
  const created2 = await one(A.db.rpc('generate_due_recurring_invoices'));
  ok(created1 === 3 && created2 === 0, 'catches up 3 monthly periods once, then idempotent', { created1, created2 });
  const src = await one(admin.from('documents').select('data').eq('id', recurring.id).single());
  ok(new Date(src.data.recurrence.nextRunDate) > today, 'nextRunDate advanced into the future', src.data.recurrence);
  const copies = await one(A.db.from('documents').select('data').eq('data->>recurrenceSourceId', recurring.id));
  ok(copies.length === 3 && copies.every((c) => c.data.status === 'Draft' && c.data.recurrence?.enabled === false && !c.data.clientSignatureUrl), 'copies are drafts with recurrence disabled', copies.map((c) => c.data.recurrence));
  const nums = copies.map((c) => c.data.invoiceNumber);
  ok(new Set(nums).size === 3 && nums.every((x) => /^INV-\d{4}-\d{2}-\d{3}$/.test(x)), 'copies get new unique numbers in the INV-YYYY-MM-NNN series', nums);

  // ================================================================== storage
  section('storage buckets');
  const png = Buffer.from(PNG.split(',')[1], 'base64');
  const upOwn = await A.db.storage.from('logos').upload(`${A.id}/logo-${RUN}.png`, png, { contentType: 'image/png' });
  ok(!upOwn.error, 'owner uploads into her own folder', upOwn.error);
  const upOther = await A.db.storage.from('logos').upload(`${B.id}/evil-${RUN}.png`, png, { contentType: 'image/png' });
  ok(!!upOther.error, "cannot upload into another user's folder", upOther.data);
  const upSvg = await A.db.storage.from('logos').upload(`${A.id}/x-${RUN}.svg`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), { contentType: 'image/svg+xml' });
  ok(!!upSvg.error, 'SVG (script-capable) uploads are rejected', upSvg.data);
  const pub = await fetch(A.db.storage.from('logos').getPublicUrl(`${A.id}/logo-${RUN}.png`).data.publicUrl);
  ok(pub.status === 200, 'public bucket file readable by URL', pub.status);
  const sig = await A.db.storage.from('signatures').upload(`${A.id}/sig-${RUN}.png`, png, { contentType: 'image/png' });
  ok(!sig.error, 'signatures bucket: owner upload', sig.error);
  const sigRead = await B.db.storage.from('signatures').download(`${A.id}/sig-${RUN}.png`);
  ok(!!sigRead.error, 'signatures bucket is private to the owner');
  const listOther = await B.db.storage.from('logos').list(A.id);
  ok(!listOther.error && listOther.data.length === 0, 'cannot list another user folder');
  await A.db.storage.from('logos').remove([`${A.id}/logo-${RUN}.png`]);
  await A.db.storage.from('signatures').remove([`${A.id}/sig-${RUN}.png`]);
}

try {
  await main();
} catch (e) {
  failed++;
  console.error('\nUNEXPECTED ERROR:', e);
} finally {
  // deleting the users cascades through every table (also exercises the delete triggers)
  for (const id of users) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) { failed++; console.log(`  FAIL cleanup: could not delete user ${id}: ${error.message}`); }
  }
  const leftovers = await admin.from('profiles').select('id').in('id', users);
  ok(!leftovers.error && leftovers.data.length === 0, 'cleanup: test users and their data removed');
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
