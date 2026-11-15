/**
 * Starter kits per trade (roadmap N5): a small built-in library of assemblies the user can import into the price book
 * ("Starter kits" in the price book) and then edit. Pure data, no network. lib/assemblies/starterImport.ts turns a kit
 * into a normal price-book assembly; scripts/assemblies-check.ts checks the shape of every kit below.
 *
 * STARTER PRICES: SET YOUR OWN. Every cost here is a neutral placeholder, not a market price: prices differ by
 * region, supplier and year. Quantities, units and labor hours are typical amounts for the stated unit. No brand names.
 * Labor is not priced here: it takes the user's own labor rate when imported (hours only).
 *
 * Costs are per unit (per sheet, per gallon, per sq ft); a kit's quantities are for ONE unit of the kit (one room, one
 * fixture, one square, one sq ft). Markup is a % added on top of cost, per kind of row.
 */

export type StarterTrade = 'bathroom' | 'kitchen' | 'painting' | 'electrical' | 'plumbing' | 'roofing' | 'flooring';

export const STARTER_TRADES: ReadonlyArray<{ id: StarterTrade; label: string }> = [
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'painting', label: 'Painting' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'plumbing', label: 'Plumbing' },
  { id: 'roofing', label: 'Roofing' },
  { id: 'flooring', label: 'Flooring' },
];

export interface StarterMaterial {
  name: string;
  /** unit of the quantity: "each", "sq ft", "gal", "sheet", "lf", "lb", "set", "lot" */
  unit: string;
  quantity: number;
  /** placeholder cost per unit */
  cost: number;
}

export interface StarterExpense {
  /** equipment rental, dump fee, permit fee, subcontract */
  name: string;
  /** placeholder cost per unit */
  cost: number;
  /** default 1 */
  quantity?: number;
}

export interface StarterKit {
  /** stable id (never shown) */
  id: string;
  trade: StarterTrade;
  /** the price-book name */
  name: string;
  /** one client-friendly line: becomes the item's description, so it prints under the name on documents */
  summary: string;
  /** what one kit covers: "job", "room", "each", "square", "sq ft" */
  unit: string;
  materials: StarterMaterial[];
  /** hours of labor for ONE kit (the rate is the user's labor rate) */
  laborHours: number;
  expenses: StarterExpense[];
  /** % added on cost */
  markup: { materials: number; labor: number; expenses: number };
}

export const STARTER_PRICES_NOTE = 'Starter prices: set your own. They are placeholders, not market prices.';

export const STARTER_KITS: ReadonlyArray<StarterKit> = [
  // ------------------------------------------------------------------------------------------------ bathroom
  {
    id: 'bath-remodel', trade: 'bathroom', name: 'Bathroom remodel (standard 5x8)', unit: 'job',
    summary: 'Tear-out and rebuild of a standard bathroom: tub or shower surround, tile, vanity, toilet and fixtures.',
    materials: [
      { name: 'Vanity cabinet with top, 30 in', unit: 'each', quantity: 1, cost: 380 },
      { name: 'Toilet, standard', unit: 'each', quantity: 1, cost: 190 },
      { name: 'Vanity faucet', unit: 'each', quantity: 1, cost: 85 },
      { name: 'Tub or shower surround kit', unit: 'each', quantity: 1, cost: 520 },
      { name: 'Tub / shower valve and trim', unit: 'set', quantity: 1, cost: 140 },
      { name: 'Cement board', unit: 'sheet', quantity: 6, cost: 14 },
      { name: 'Wall tile', unit: 'sq ft', quantity: 60, cost: 4.5 },
      { name: 'Floor tile', unit: 'sq ft', quantity: 42, cost: 4 },
      { name: 'Thinset, grout and sealer', unit: 'set', quantity: 1, cost: 75 },
      { name: 'Exhaust fan', unit: 'each', quantity: 1, cost: 70 },
      { name: 'Drywall, patch and finish supplies', unit: 'lot', quantity: 1, cost: 60 },
      { name: 'Paint, bathroom grade', unit: 'gal', quantity: 1, cost: 45 },
      { name: 'Plumbing and electrical fittings', unit: 'lot', quantity: 1, cost: 90 },
    ],
    laborHours: 64,
    expenses: [
      { name: 'Dumpster / debris haul-away', cost: 350 },
      { name: 'Permit allowance', cost: 150 },
    ],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  {
    id: 'bath-vanity-toilet', trade: 'bathroom', name: 'Bathroom vanity and toilet swap', unit: 'job',
    summary: 'Remove and replace the vanity, faucet and toilet; connect, seal and test.',
    materials: [
      { name: 'Vanity cabinet with top, 30 in', unit: 'each', quantity: 1, cost: 380 },
      { name: 'Vanity faucet', unit: 'each', quantity: 1, cost: 85 },
      { name: 'Toilet, standard', unit: 'each', quantity: 1, cost: 190 },
      { name: 'Supply lines', unit: 'each', quantity: 2, cost: 12 },
      { name: 'Wax ring and bolts', unit: 'set', quantity: 1, cost: 10 },
      { name: 'Silicone caulk', unit: 'each', quantity: 1, cost: 8 },
    ],
    laborHours: 6,
    expenses: [{ name: 'Disposal of old fixtures', cost: 40 }],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  // ------------------------------------------------------------------------------------------------ kitchen
  {
    id: 'kitchen-refresh', trade: 'kitchen', name: 'Kitchen refresh (paint, hardware, faucet, backsplash)', unit: 'job',
    summary: 'Cabinets painted and fitted with new hardware, new kitchen faucet, tile backsplash and under-cabinet lighting.',
    materials: [
      { name: 'Cabinet primer and paint', unit: 'gal', quantity: 3, cost: 55 },
      { name: 'Cabinet pulls or knobs', unit: 'each', quantity: 28, cost: 3.5 },
      { name: 'Kitchen faucet', unit: 'each', quantity: 1, cost: 150 },
      { name: 'Backsplash tile', unit: 'sq ft', quantity: 30, cost: 5 },
      { name: 'Thinset and grout', unit: 'set', quantity: 1, cost: 55 },
      { name: 'Under-cabinet lighting kit', unit: 'set', quantity: 1, cost: 90 },
      { name: 'Caulk, sandpaper and masking', unit: 'lot', quantity: 1, cost: 40 },
    ],
    laborHours: 40,
    expenses: [{ name: 'Debris disposal', cost: 120 }],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  {
    id: 'kitchen-backsplash', trade: 'kitchen', name: 'Kitchen backsplash, per sq ft', unit: 'sq ft',
    summary: 'Tile backsplash installed and grouted, priced per square foot.',
    materials: [
      { name: 'Backsplash tile', unit: 'sq ft', quantity: 1.1, cost: 5 },
      { name: 'Thinset and grout', unit: 'sq ft', quantity: 1, cost: 0.9 },
      { name: 'Caulk and spacers', unit: 'sq ft', quantity: 1, cost: 0.15 },
    ],
    laborHours: 0.22,
    expenses: [],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  // ------------------------------------------------------------------------------------------------ painting
  {
    id: 'paint-room-full', trade: 'painting', name: 'Interior painting, per room (walls and ceiling)', unit: 'room',
    summary: 'One average room: patch, prime where needed, two coats on walls and one on the ceiling.',
    materials: [
      { name: 'Wall paint', unit: 'gal', quantity: 2, cost: 32 },
      { name: 'Ceiling paint', unit: 'gal', quantity: 1, cost: 28 },
      { name: 'Primer', unit: 'gal', quantity: 1, cost: 30 },
      { name: 'Masking tape and plastic', unit: 'set', quantity: 1, cost: 18 },
      { name: 'Rollers, brushes and tray', unit: 'set', quantity: 1, cost: 22 },
      { name: 'Patch compound and sandpaper', unit: 'set', quantity: 1, cost: 12 },
    ],
    laborHours: 8,
    expenses: [],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  {
    id: 'paint-room-walls', trade: 'painting', name: 'Interior painting, per room (walls only)', unit: 'room',
    summary: 'One average room: patch and two coats on the walls. Ceiling and trim not included.',
    materials: [
      { name: 'Wall paint', unit: 'gal', quantity: 2, cost: 32 },
      { name: 'Primer', unit: 'gal', quantity: 0.5, cost: 30 },
      { name: 'Masking tape and plastic', unit: 'set', quantity: 1, cost: 14 },
      { name: 'Rollers, brushes and tray', unit: 'set', quantity: 1, cost: 22 },
      { name: 'Patch compound and sandpaper', unit: 'set', quantity: 1, cost: 10 },
    ],
    laborHours: 5.5,
    expenses: [],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  // ------------------------------------------------------------------------------------------------ electrical
  {
    id: 'elec-outlet-switch', trade: 'electrical', name: 'Outlet or switch replacement', unit: 'each',
    summary: 'Replace one outlet or switch with a new device and cover plate; test.',
    materials: [
      { name: 'Outlet or switch', unit: 'each', quantity: 1, cost: 3 },
      { name: 'Cover plate', unit: 'each', quantity: 1, cost: 1.5 },
      { name: 'Wire connectors', unit: 'each', quantity: 3, cost: 0.4 },
    ],
    laborHours: 0.4,
    expenses: [],
    markup: { materials: 60, labor: 35, expenses: 10 },
  },
  {
    id: 'elec-light-fixture', trade: 'electrical', name: 'Light fixture replacement', unit: 'each',
    summary: 'Remove the old fixture and install a new one on the existing box; test.',
    materials: [
      { name: 'Light fixture, standard', unit: 'each', quantity: 1, cost: 55 },
      { name: 'Mounting hardware and connectors', unit: 'set', quantity: 1, cost: 4 },
    ],
    laborHours: 1,
    expenses: [],
    markup: { materials: 40, labor: 35, expenses: 10 },
  },
  {
    id: 'elec-panel', trade: 'electrical', name: 'Electrical panel replacement (200 A)', unit: 'job',
    summary: 'Replace the main service panel with a new 200 A panel and breakers; label every circuit; inspection included.',
    materials: [
      { name: 'Main panel, 200 A', unit: 'each', quantity: 1, cost: 280 },
      { name: 'Breakers, 15 and 20 A', unit: 'each', quantity: 12, cost: 9 },
      { name: 'Ground and bonding kit', unit: 'set', quantity: 1, cost: 35 },
      { name: 'Service conductors', unit: 'lot', quantity: 1, cost: 120 },
      { name: 'Conduit, fittings and connectors', unit: 'lot', quantity: 1, cost: 60 },
      { name: 'Circuit labels and small parts', unit: 'lot', quantity: 1, cost: 20 },
    ],
    laborHours: 16,
    expenses: [{ name: 'Permit and inspection fee', cost: 200 }],
    markup: { materials: 35, labor: 35, expenses: 0 },
  },
  // ------------------------------------------------------------------------------------------------ plumbing
  {
    id: 'plumb-fixture-swap', trade: 'plumbing', name: 'Fixture swap (faucet or toilet)', unit: 'each',
    summary: 'Remove one faucet or toilet and install a new one; connect, seal and test.',
    materials: [
      { name: 'Fixture (faucet or toilet)', unit: 'each', quantity: 1, cost: 120 },
      { name: 'Supply lines', unit: 'each', quantity: 2, cost: 12 },
      { name: 'Sealant and putty', unit: 'set', quantity: 1, cost: 8 },
    ],
    laborHours: 1.5,
    expenses: [],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  {
    id: 'plumb-water-heater', trade: 'plumbing', name: 'Water heater replacement (tank, 40 to 50 gal)', unit: 'each',
    summary: 'Drain and remove the old tank, install a new one with new connectors and relief piping; test.',
    materials: [
      { name: 'Water heater, 40 to 50 gal', unit: 'each', quantity: 1, cost: 650 },
      { name: 'Flexible water connectors', unit: 'each', quantity: 2, cost: 16 },
      { name: 'Expansion tank', unit: 'each', quantity: 1, cost: 45 },
      { name: 'Fuel and drain fittings', unit: 'lot', quantity: 1, cost: 40 },
      { name: 'Vent and relief piping', unit: 'lot', quantity: 1, cost: 35 },
    ],
    laborHours: 4,
    expenses: [
      { name: 'Old unit disposal', cost: 40 },
      { name: 'Permit fee', cost: 75 },
    ],
    markup: { materials: 30, labor: 35, expenses: 5 },
  },
  // ------------------------------------------------------------------------------------------------ roofing
  {
    id: 'roof-shingle-repair', trade: 'roofing', name: 'Shingle repair, per square', unit: 'square',
    summary: 'Tear off and replace damaged asphalt shingles, per square (100 sq ft), with underlayment and flashing.',
    materials: [
      { name: 'Shingles', unit: 'bundle', quantity: 3, cost: 38 },
      { name: 'Underlayment', unit: 'roll', quantity: 0.3, cost: 95 },
      { name: 'Roofing nails', unit: 'lb', quantity: 2, cost: 3.5 },
      { name: 'Drip edge and flashing', unit: 'lf', quantity: 10, cost: 1.6 },
      { name: 'Roofing sealant', unit: 'each', quantity: 1, cost: 9 },
    ],
    laborHours: 2.5,
    expenses: [{ name: 'Debris haul-away', cost: 40 }],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  // ------------------------------------------------------------------------------------------------ flooring
  {
    id: 'floor-lvp', trade: 'flooring', name: 'LVP flooring, per sq ft', unit: 'sq ft',
    summary: 'Luxury vinyl plank floor installed over a prepared subfloor, per square foot, with underlayment and trim.',
    materials: [
      { name: 'Vinyl plank flooring', unit: 'sq ft', quantity: 1.1, cost: 2.6 },
      { name: 'Underlayment', unit: 'sq ft', quantity: 1, cost: 0.5 },
      { name: 'Quarter round and transitions', unit: 'lf', quantity: 0.15, cost: 1.2 },
      { name: 'Fasteners and adhesive', unit: 'sq ft', quantity: 1, cost: 0.1 },
    ],
    laborHours: 0.06,
    expenses: [{ name: 'Old floor disposal', cost: 0.35 }],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
  {
    id: 'floor-tile', trade: 'flooring', name: 'Tile flooring, per sq ft', unit: 'sq ft',
    summary: 'Ceramic or porcelain tile set in thinset and grouted, per square foot.',
    materials: [
      { name: 'Floor tile', unit: 'sq ft', quantity: 1.12, cost: 3.5 },
      { name: 'Thinset mortar', unit: 'lb', quantity: 1.5, cost: 0.6 },
      { name: 'Grout', unit: 'lb', quantity: 0.5, cost: 1.4 },
      { name: 'Spacers and sealer', unit: 'sq ft', quantity: 1, cost: 0.25 },
    ],
    laborHours: 0.18,
    expenses: [{ name: 'Floor prep and old floor disposal', cost: 0.5 }],
    markup: { materials: 35, labor: 35, expenses: 10 },
  },
];

export const starterKitById = (id: string): StarterKit | undefined => STARTER_KITS.find((k) => k.id === id);
export const starterKitsOf = (trade: StarterTrade): StarterKit[] => STARTER_KITS.filter((k) => k.trade === trade);
export const starterTradeLabel = (trade: StarterTrade): string => STARTER_TRADES.find((t) => t.id === trade)?.label ?? trade;
