// Demo data for chapter 20 (inventory, suppliers, purchase orders). Only built for chapter 20 (GET /__reset?chapter=20).
//
//  - Inventory: the 5 seed items; "Interior paint, 1 gal" (9, alert at 10) and "Thinset mortar, 50 lb" (6, alert at 8) are below their alert, so
//    Inventory shows low stock. Both have the supplier "Lakeside Building Supply" and a reorder quantity (paint 12, thinset 10); the stock history
//    has a few rows.
//  - Suppliers: "Lakeside Building Supply" (order e-mail, phone, account number, preferred, Net 30, 2 days) and "Pine Ridge Lumber", each with a
//    small catalogue; one Lakeside price went up 8 percent ("Price changed"). (The chapter adds "Harbor Tile and Stone" itself.)
//  - On "Whitfield Kitchen Remodel": a saved DRAFT purchase order to Lakeside with 3 lines and a SENT order that is
//    PARTIALLY delivered (the Record delivery scenes).
//  - adjust_inventory / checkout_inventory behave like the database: change the stock and write a history row.

const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));

let active = false;
export default ({ tables, uid, day, iso, id, chapter }) => {
  active = chapter === '20';
  if (chapter !== '20') return;
  const inventory = tables.get('inventory');
  const byName = (n) => inventory.find((i) => i.name === n);
  const paint = byName('Interior paint, 1 gal');
  const thinset = byName('Thinset mortar, 50 lb');
  const studs = byName('2x4x8 stud');
  const drywall = byName('Drywall sheet 4x8');
  const kitchen = tables.get('jobs').find((j) => j.name === 'Whitfield Kitchen Remodel');
  if (!paint || !thinset || !studs || !drywall || !kitchen) return;
  for (const it of [paint, thinset]) it.supplier = 'Lakeside Building Supply';
  Object.assign(paint, { location: 'Shop shelf A', sku: 'PNT-IW1' });
  Object.assign(thinset, { location: 'Shop shelf C', sku: 'TLE-TM50' });
  Object.assign(studs, { location: 'Yard rack' });

  // reorder quantities
  table(tables, 'user_settings').push({ id: id(), user_id: uid, key: 'inventory.reorder', value: { v: 1, qty: { [paint.id]: 12, [thinset.id]: 10 }, jobId: kitchen.id, updatedAt: iso(-3) }, created_at: iso(-3), updated_at: iso(-3) });

  // suppliers and their catalogues
  const suppliers = table(tables, 'suppliers');
  const lakeside = { id: id(), user_id: uid, name: 'Lakeside Building Supply', contact_name: 'Dana Ruiz', email: 'orders@lakeside-supply.example', phone: '(555) 010-6200', address: '2 Harbor Road, Lakeside, OH', website: 'lakeside-supply.example', account_number: 'NL-20418', payment_terms: 'Net 30', notes: 'Free delivery over $300.', lead_time_days: 2, preferred: true, archived: false, legacy_key: null, created_at: iso(-120), updated_at: iso(-30) };
  const pine = { id: id(), user_id: uid, name: 'Pine Ridge Lumber', contact_name: 'Walt Hayes', email: 'orders@pineridge-lumber.example', phone: '(555) 010-6400', address: '14 Mill Road, Maple Grove, OH', website: '', account_number: '5521', payment_terms: 'Net 15', notes: '', lead_time_days: 3, preferred: false, archived: false, legacy_key: null, created_at: iso(-100), updated_at: iso(-20) };
  suppliers.push(lakeside, pine);
  const cat = table(tables, 'supplier_items');
  const sItem = (supplier, sku, name, unit, price, history, extra = {}) => ({ id: id(), user_id: uid, supplier_id: supplier.id, saved_item_id: null, sku, name, unit, unit_price: price, url: '', notes: '', last_price_at: iso(-10), price_history: history, created_at: iso(-90), updated_at: iso(-10), ...extra });
  cat.push(
    sItem(lakeside, 'TLE-TM50', 'Thinset mortar, 50 lb bag', 'bag', 23.76, [{ price: 22, at: iso(-90) }, { price: 23.76, at: iso(-10) }]), // up 8 percent
    sItem(lakeside, 'PNT-IW1', 'Interior paint, 1 gal', 'gal', 31.5, [{ price: 31.5, at: iso(-90) }]),
    sItem(lakeside, 'DRY-48', 'Drywall sheet 4x8, 1/2 in', 'sheet', 13.2, [{ price: 13.2, at: iso(-90) }]),
    sItem(pine, 'SPF-248', '2x4x8 stud, kiln dried', 'each', 3.7, [{ price: 3.7, at: iso(-60) }]),
  );

  // purchase orders on Whitfield Kitchen Remodel
  const docs = table(tables, 'documents');
  const lines = (list) => list.map(([description, quantity, rate, inv]) => ({ id: id(), description, quantity, rate, unitCost: rate, ...(inv ? { inventoryItemId: inv.id, item_id: inv.id, itemSource: 'inventory', track_inventory: true } : {}) }));
  const po = (number, status, list, extra = {}, created = -6) => ({
    id: id(), user_id: uid, job_id: kitchen.id, type: 'Purchase Order', created_at: iso(created, 10), updated_at: iso(created, 10), public_token: id().replace(/-/g, '').slice(0, 24),
    data: {
      title: '', poNumber: number, date: day(created), deliveryDate: day(created + 5), status, vendorName: lakeside.name, vendorAddress: lakeside.address, vendorPhone: lakeside.phone, vendorEmail: lakeside.email,
      shipToType: 'Job Site', shipToName: kitchen.client_name, shipToAddress: kitchen.client_address, shipToPhone: '', deliveryInstructions: '', lineItems: list, notes: '',
      companyName: 'Northline Remodeling', companyAddress: '418 Cedar Street, Maple Grove, OH 45000', companyPhone: '(555) 010-2000', companyWebsite: 'northline-demo.example', ...extra,
    },
  });
  docs.push(po('PO-1005', 'Draft', lines([['Thinset mortar, 50 lb', 10, 23.76, thinset], ['Backsplash tile, 3x6 subway', 30, 3.2, null], ['Delivery fee', 1, 35, null]]), {}, -1));
  const partLines = lines([['2x4x8 stud', 100, 3.9, studs], ['Drywall sheet 4x8', 20, 13.5, drywall]]);
  docs.push(po('PO-1004', 'Partially delivered', partLines, {
    internalDeliveries: { v: 1, rev: 'r_demo01', list: [{
      id: 'dlv_demo01', date: day(-2), note: 'Packing slip 4471, studs only on the first truck', at: iso(-2, 11), claimedAt: iso(-2, 11), state: 'done',
      lines: [{ lineId: partLines[0].id, index: 0, description: '2x4x8 stud', qty: 60 }], items: [{ itemId: studs.id, name: '2x4x8 stud', unit: 'each', qty: 60 }], applied: [studs.id], doneAt: iso(-2, 11),
    }] },
  }, -7));

  // a few stock history rows
  const hist = table(tables, 'inventory_history');
  const h = (item, change, reason, off, extra = {}) => ({ id: id(), user_id: uid, item_id: item.id, item_name: item.name, quantity_change: change, reason, notes: reason, job_id: null, created_at: iso(off, 15), ...extra });
  hist.push(h(paint, -3, 'Used on Whitfield Kitchen Remodel', -4, { job_id: kitchen.id }), h(paint, 12, 'Restock', -12), h(thinset, -2, 'Used on Whitfield Kitchen Remodel', -3, { job_id: kitchen.id }), h(studs, 60, 'Received from PO-1004 [po:demo] [dlv:dlv_demo01]', -2));
};

export const rpc = {
  adjust_inventory: ({ p_item_id, p_delta, p_reason, p_job_id }, tables) => {
    if (!active) return undefined;
    const item = (tables.get('inventory') || []).find((i) => i.id === p_item_id);
    if (!item) return undefined;
    item.quantity = Number(item.quantity) + Number(p_delta);
    table(tables, 'inventory_history').push({ id: crypto.randomUUID(), user_id: item.user_id, item_id: item.id, item_name: item.name, quantity_change: Number(p_delta), reason: p_reason || null, notes: p_reason || null, job_id: p_job_id || null, created_at: new Date().toISOString() });
    return item;
  },
  checkout_inventory: ({ p_item_id, p_qty, p_job_id, p_reason }, tables) => {
    if (!active) return undefined;
    const item = (tables.get('inventory') || []).find((i) => i.id === p_item_id);
    if (!item) return undefined;
    item.quantity = Number(item.quantity) - Number(p_qty);
    table(tables, 'inventory_history').push({ id: crypto.randomUUID(), user_id: item.user_id, item_id: item.id, item_name: item.name, quantity_change: -Number(p_qty), reason: p_reason || 'Checked out', notes: p_reason || 'Checked out', job_id: p_job_id || null, created_at: new Date().toISOString() });
    return { ok: true };
  },
};
