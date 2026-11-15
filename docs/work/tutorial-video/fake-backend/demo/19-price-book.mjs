// Demo data for chapter 19 (price book, kits, price lists). Only built for chapter 19 (GET /__reset?chapter=19).
//
//  - The price book keeps the 6 seed items and gets three more: "Vanity, 36 in with top" and "Faucet, brushed nickel" (materials) and
//    "Porcelain tile, 12x24" (a material with a Preferred supplier and a product link).
//  - One existing kit "Bathroom vanity swap": the vanity, the faucet, 3 hours of labor (with burden and markup) and a Dump fee expense, so the
//    kit breakdown shows materials, labor and expenses. The kit price follows the parts.
//  - Two saved suppliers with a small catalogue each; Lakeside lists the tile at a lower price than your cost (the "Use as my cost" scene).
//  - An estimate "Vanity upgrade" on "Nair Master Bath" with the kit as ONE line (kit contents under it): the "View kit contents" scene.
// (The price-list import needs a CSV file from disk; the recorder cannot pick a file, so that dialog is shown without one.)

const table = (tables, name) => tables.get(name) || (tables.set(name, []), tables.get(name));
const round2 = (n) => Math.round(n * 100) / 100;

export default ({ tables, uid, day, iso, id, chapter }) => {
  if (chapter !== '19') return;
  const items = table(tables, 'saved_items');
  const item = (name, description, category, type, unit, rate, unitCost, extra = {}) => ({
    id: id(), user_id: uid, name, description, sku: null, category, type, unit, taxable: true, rate, unit_cost: unitCost, markup: unitCost ? round2(((rate - unitCost) / unitCost) * 100) : 0, images: [],
    is_assembly: false, assembly_items: [], use_count: 0, is_favorite: false, created_at: iso(-50), ...extra,
  });

  // suppliers + a catalogue
  const suppliers = table(tables, 'suppliers');
  const lakeside = { id: id(), user_id: uid, name: 'Lakeside Building Supply', contact_name: 'Dana Ruiz', email: 'orders@lakeside-supply.example', phone: '(555) 010-6200', address: '2 Harbor Road, Lakeside, OH', website: 'lakeside-supply.example', account_number: 'NL-20418', payment_terms: 'Net 30', notes: '', lead_time_days: 2, preferred: true, archived: false, legacy_key: null, created_at: iso(-120), updated_at: iso(-30) };
  const harbor = { id: id(), user_id: uid, name: 'Harbor Tile and Stone', contact_name: 'Pete Alvarez', email: 'sales@harbor-tile.example', phone: '(555) 010-6300', address: '77 Quarry Hill, Lakeside, OH', website: 'harbor-tile.example', account_number: '88140', payment_terms: 'Net 15', notes: '', lead_time_days: 5, preferred: false, archived: false, legacy_key: null, created_at: iso(-100), updated_at: iso(-20) };
  suppliers.push(lakeside, harbor);

  const vanity = item('Vanity, 36 in with top', 'Shaker style, white, cultured marble top', 'Bath', 'material', 'each', 780, 520);
  const faucet = item('Faucet, brushed nickel', 'Single-handle bathroom faucet', 'Bath', 'material', 'each', 260, 165);
  const tile = item('Porcelain tile, 12x24', 'Matte grey porcelain floor tile', 'Tile', 'material', 'sq ft', 6.5, 4.2, { sku: 'PT-1224', url: 'https://lakeside-supply.example/porcelain-tile-12x24', specs: { Size: '12 x 24 in', Finish: 'Matte', 'Coverage per box': '16 sq ft' }, supplier_id: lakeside.id });
  items.push(vanity, faucet, tile);

  // the kit: vanity + faucet + 3 hours of labor (burden 25 %, markup 40 %) + a dump fee (markup 20 %)
  const laborCost = 65 * 1.25;               // 81.25 an hour
  const laborPrice = round2(laborCost * 1.4); // 113.75 an hour
  const dumpCost = 60, dumpPrice = round2(60 * 1.2);
  const parts = [
    { item_id: vanity.id, quantity: 1 },
    { item_id: faucet.id, quantity: 1 },
    { item_id: id(), quantity: 3, kind: 'labor', is_custom: true, custom_name: 'Labor', labor_rate: 65, burden_pct: 25, markup_pct: 40, custom_cost: laborCost, override_price: laborPrice },
    { item_id: id(), quantity: 1, kind: 'expense', is_custom: true, custom_name: 'Dump fee', custom_cost: dumpCost, markup_pct: 20, override_price: dumpPrice },
  ];
  const kitPrice = round2(780 + 260 + 3 * laborPrice + dumpPrice);
  const kitCost = round2(520 + 165 + 3 * laborCost + dumpCost);
  items.push(item('Bathroom vanity swap', 'Remove the old vanity and set a new one with the faucet', 'Bath', 'bundle', 'each', kitPrice, kitCost, { is_assembly: true, assembly_items: parts }));
  const kit = items[items.length - 1];

  // supplier catalogue: Lakeside lists the tile cheaper than your cost
  const catalogue = table(tables, 'supplier_items');
  const sItem = (supplier, sku, name, unit, price, history) => ({ id: id(), user_id: uid, supplier_id: supplier.id, saved_item_id: null, sku, name, unit, unit_price: price, url: '', notes: '', last_price_at: iso(-12), price_history: history, created_at: iso(-90), updated_at: iso(-12) });
  catalogue.push(
    { ...sItem(lakeside, 'PT-1224', 'Porcelain tile 12x24', 'sq ft', 3.85, [{ price: 3.6, at: iso(-90) }, { price: 3.85, at: iso(-12) }]), saved_item_id: tile.id },
    sItem(lakeside, 'LV-36', 'Vanity 36 in, white shaker', 'each', 505, [{ price: 505, at: iso(-90) }]),
    sItem(harbor, 'PT-1224H', 'Porcelain tile 12x24, matte grey', 'sq ft', 4.1, [{ price: 4.1, at: iso(-60) }]),
  );

  // an estimate on Nair Master Bath with the kit as one line
  const nair = tables.get('jobs').find((j) => j.name === 'Nair Master Bath');
  if (nair) {
    const nairClient = tables.get('clients').find((c) => c.id === nair.client_id);
    tables.get('documents').push({
      id: id(), user_id: uid, job_id: nair.id, client_id: nair.client_id, type: 'Estimate', created_at: iso(-2), updated_at: iso(-2), public_token: id().replace(/-/g, '').slice(0, 24),
      data: {
        estimateNumber: 'EST-1046', title: 'Vanity upgrade', issueDate: day(-2), expiryDate: day(28), status: 'Draft', taxRate: 7.5, clientName: nair.client_name, clientAddress: nair.client_address, companyName: 'Northline Remodeling',
        lineItems: [{
          id: id(), description: 'Bathroom vanity swap - Remove the old vanity and set a new one with the faucet', quantity: 1, rate: kitPrice, unitCost: kitCost, itemSource: 'pricebook', isAssembly: true, hideComponentsOnPdf: true, isExpanded: false,
          assemblyComponents: [
            { item_id: vanity.id, name: vanity.name, quantity: 1, rate: 780 },
            { item_id: faucet.id, name: faucet.name, quantity: 1, rate: 260 },
            { item_id: parts[2].item_id, name: 'Labor', quantity: 3, rate: laborPrice, kind: 'labor' },
            { item_id: parts[3].item_id, name: 'Dump fee', quantity: 1, rate: dumpPrice, kind: 'expense' },
          ],
        }],
        terms: '50% deposit to schedule. Balance on completion.', notes: '', clientEmail: nairClient && nairClient.email,
      },
    });
  }
  void kit; void day;
};
