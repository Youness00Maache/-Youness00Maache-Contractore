// Demo data for the tutorial video. Everything here is made up: a fictional contractor ("Northline Remodeling"),
// fictional clients, 555 phone numbers, example.com e-mail addresses. Dates are relative to "today" so the app always
// looks current. Extend per chapter as the storyboards need more screens (tasks, leads, subs, ...).
import { randomUUID } from 'node:crypto';

export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'marcus@northline-demo.example',
  email_confirmed_at: '2026-01-05T10:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { name: 'Marcus Reed' },
  created_at: '2026-01-05T10:00:00Z',
};

const uid = DEMO_USER.id;
const day = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const iso = (offsetDays = 0, hour = 9) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const id = () => randomUUID();

export function seed() {
  const profile = {
    id: uid, email: DEMO_USER.email, name: 'Marcus Reed', company_name: 'Northline Remodeling', job_title: 'Owner',
    address: '418 Cedar Street, Maple Grove, OH 45000', phone: '(555) 010-2000', website: 'northline-demo.example',
    subscription_tier: 'ai', subscription_status: 'active', language: 'English', theme: 'dark',
    default_labor_rate: 65, default_pay_link: 'https://pay.example/northline', default_pay_link_label: 'PayPal',
    google_review_link: 'https://g.page/r/northline-demo/review', created_at: '2026-01-05T10:00:00Z',
  };

  const clients = [
    { id: id(), user_id: uid, name: 'Sarah Whitfield', email: 'sarah.whitfield@example.com', phone: '(555) 010-3101', address: '27 Maple Lane, Maple Grove, OH', notes: 'Prefers text messages. Dog at the house.', portal_key: 'demo-portal-sarah', created_at: iso(-90) },
    { id: id(), user_id: uid, name: 'David & Priya Nair', email: 'nair.family@example.com', phone: '(555) 010-3102', address: '905 Birch Court, Maple Grove, OH', notes: '', portal_key: 'demo-portal-nair', created_at: iso(-70) },
    { id: id(), user_id: uid, name: 'Tom Alvarez', email: 'tom.alvarez@example.com', phone: '(555) 010-3103', address: '112 Harbor Road, Lakeside, OH', notes: 'Rental property. Tenant: Jo.', portal_key: 'demo-portal-tom', created_at: iso(-50) },
    { id: id(), user_id: uid, name: 'Linda Okafor', email: 'linda.okafor@example.com', phone: '(555) 010-3104', address: '60 Willow Way, Maple Grove, OH', notes: '', portal_key: 'demo-portal-linda', created_at: iso(-30) },
    { id: id(), user_id: uid, name: 'Greg Halvorsen', email: 'greg.halvorsen@example.com', phone: '(555) 010-3105', address: '8 Quarry Hill, Lakeside, OH', notes: 'Wants a deck next spring.', portal_key: 'demo-portal-greg', created_at: iso(-12) },
  ];
  const [sarah, nair, tom, linda, greg] = clients;

  const job = (name, client, status, start, end, worker) => ({
    id: id(), user_id: uid, name, client_name: client.name, client_address: client.address, client_id: client.id,
    status, start_date: day(start), end_date: end == null ? null : day(end), worker_name: worker || null, created_at: iso(start - 1),
  });
  const jobs = [
    job('Whitfield Kitchen Remodel', sarah, 'active', -21, 14, 'Jamal'),
    job('Nair Master Bath', nair, 'active', -9, 12, 'Eli'),
    job('Alvarez Rental Repaint', tom, 'paused', -30, 5),
    job('Okafor Basement Finish', linda, 'completed', -75, -20, 'Jamal'),
    job('Halvorsen Deck Estimate', greg, 'active', -2, null),
    job('Whitfield Porch Rail Repair', sarah, 'completed', -120, -110),
  ];

  const lines = (list) => list.map(([description, quantity, rate, unitCost]) => ({ id: id(), description, quantity, rate, unitCost }));
  const doc = (jobRow, type, data, createdOffset) => ({
    id: id(), user_id: uid, job_id: jobRow.id, type, data, created_at: iso(createdOffset), updated_at: iso(createdOffset), public_token: id().replace(/-/g, '').slice(0, 24),
  });
  const documents = [
    doc(jobs[0], 'Estimate', {
      estimateNumber: 'EST-1042', title: 'Kitchen remodel', issueDate: day(-24), expiryDate: day(6), status: 'Accepted', taxRate: 7.5,
      clientName: sarah.name, clientAddress: sarah.address, companyName: profile.company_name,
      lineItems: lines([['Demolition and haul-away', 1, 1800, 900], ['Custom shaker cabinets (installed)', 1, 9600, 6400], ['Quartz countertop, 38 sq ft', 38, 95, 62], ['Tile backsplash, labor and material', 1, 1450, 800], ['Electrical: under-cabinet lighting', 1, 780, 380]]),
      terms: '50% deposit to schedule. Balance on completion.', notes: 'Appliances supplied by the homeowner.',
    }, -24),
    doc(jobs[0], 'Invoice', {
      invoiceNumber: 'INV-2081', issueDate: day(-14), dueDate: day(0), status: 'Sent', taxRate: 7.5, amountPaid: 0,
      clientName: sarah.name, clientAddress: sarah.address, companyName: profile.company_name,
      lineItems: lines([['Deposit: kitchen remodel (50%)', 1, 7200, 0]]), notes: 'Thank you, Sarah!', terms: 'Due on receipt.',
    }, -14),
    doc(jobs[1], 'Estimate', {
      estimateNumber: 'EST-1043', title: 'Master bath renovation', issueDate: day(-12), expiryDate: day(18), status: 'Sent', taxRate: 7.5,
      clientName: nair.name, clientAddress: nair.address, companyName: profile.company_name,
      lineItems: lines([['Remove tub and vanity', 1, 950, 400], ['Walk-in shower, tiled', 1, 5400, 3100], ['Vanity, 48 in with top', 1, 1650, 1050], ['Plumbing fixtures', 1, 1200, 700]]),
      terms: '40% deposit. Balance on completion.', notes: '',
    }, -12),
    doc(jobs[3], 'Invoice', {
      invoiceNumber: 'INV-2064', issueDate: day(-22), dueDate: day(-8), status: 'Paid', paidAt: day(-6), taxRate: 7.5, amountPaid: 14200,
      clientName: linda.name, clientAddress: linda.address, companyName: profile.company_name,
      lineItems: lines([['Basement finish: framing, drywall, paint', 1, 9800, 6100], ['Luxury vinyl plank flooring, 640 sq ft', 640, 4.5, 2.6], ['Recessed lighting, 8 fixtures', 8, 165, 85]]), notes: '', terms: 'Net 14',
    }, -22),
    doc(jobs[2], 'Invoice', {
      invoiceNumber: 'INV-2072', issueDate: day(-40), dueDate: day(-26), status: 'Overdue', taxRate: 0, amountPaid: 0,
      clientName: tom.name, clientAddress: tom.address, companyName: profile.company_name,
      lineItems: lines([['Interior repaint, 3 units (first half)', 1, 3400, 1500]]), notes: '', terms: 'Net 14',
    }, -40),
  ];

  const savedItems = [
    ['Drywall patch, up to 2 ft', 'Labor and material', 85, 30, 'each', 'Drywall'],
    ['Interior paint, walls and ceiling', 'Per square foot of floor area', 3.2, 1.1, 'sq ft', 'Painting'],
    ['Ceramic tile install', 'Labor and thinset', 12, 5, 'sq ft', 'Tile'],
    ['Faucet install', 'Labor only', 120, 0, 'each', 'Plumbing'],
    ['Recessed light install', 'Labor and trim kit', 165, 85, 'each', 'Electrical'],
    ['Laminate flooring install', 'Labor only', 2.75, 0, 'sq ft', 'Flooring'],
  ].map(([name, description, rate, unit_cost, unit, category]) => ({ id: id(), user_id: uid, name, description, rate, unit_cost, unit, category, type: 'service', taxable: true, use_count: 0, is_favorite: false, created_at: iso(-60) }));

  const inventory = [
    ['2x4x8 stud', 142, 'Lumber', 'each', 3.9, 40], ['Drywall sheet 4x8', 36, 'Drywall', 'each', 13.5, 20], ['Interior paint, 1 gal', 9, 'Paint', 'gal', 32, 10],
    ['Thinset mortar, 50 lb', 6, 'Tile', 'bag', 22, 8], ['Wood screws 2.5 in, box', 14, 'Fasteners', 'box', 9, 6],
  ].map(([name, quantity, category, unit, cost_price, low_stock_threshold]) => ({ id: id(), user_id: uid, name, quantity, category, unit, cost_price, low_stock_threshold, created_at: iso(-80) }));

  return {
    profiles: [profile], clients, jobs, documents, saved_items: savedItems, inventory,
    notifications: [], job_photos: [], user_settings: [], reminder_settings: [],
  };
}

// RPCs the app calls on start (everything else answers null and the app falls back to its own counts)
export const rpcHandlers = {
  get_my_usage: () => null,
};

// Edge functions: canned answers per task keep AI scenes repeatable (filled in per chapter).
export const functionHandlers = {
  'ai-assistant': async () => ({}),
};
