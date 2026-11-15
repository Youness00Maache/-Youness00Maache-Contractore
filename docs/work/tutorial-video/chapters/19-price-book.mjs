// Chapter 19: Price book, kits and price lists. Sources: help guides `pricebook`, `import-price-list`.
export default {
  id: 'price-book',
  number: 19,
  title: 'Price book, kits and price lists',
  summary: 'Save your services, labor and materials once, build kits with labor and expenses, start from trade kits, and import a price list.',
  minutes: 3.5,
  covers: ['pricebook', 'import-price-list'],
  demoData: [
    'price book with the 6 seed items plus Vanity, Faucet and "Porcelain tile, 12x24" (Preferred supplier, product link and specs); one kit "Bathroom vanity swap" with 2 materials, 3 hours of labor and a Dump fee expense',
    'two saved suppliers with a small catalogue; Lakeside lists the tile cheaper than your cost (Use as my cost)',
    'an estimate "Vanity upgrade" on Nair Master Bath with the kit as one line (View kit contents); the price-list import needs a CSV file the recorder cannot pick, so that dialog is shown without one',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about your price book: your saved services, labor, materials and kits, ready to drop into any document.',
        'Open Tools, then Price book.',
        'You price each thing once, and quote faster every time after that.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools', patience: 25000 },
        { with: 1, act: 'click', target: 'Price book', role: 'menuitem' },
        { with: 1, act: 'wait', s: 2, delay: 1.7 },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click New item. Give it a name, and choose a type: Service, Labor, Material or Bundle.',
        'Pick a unit, add a description that prints under the name, and say whether it is taxable.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New item', patience: 20000 },
        { with: 0, act: 'type', target: 'Name *', text: 'Interior door install, prehung', delay: 1.1 },
        { with: 0, act: 'select', target: 'Type', option: 'Service', nth: 1 },
        { with: 1, act: 'type', target: 'Unit', text: 'each' },
        { with: 1, act: 'type', target: 'Description', text: 'Labor, shims and trim nails' },
        { with: 1, act: 'highlight', target: 'Taxable' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Now price it. Enter Your cost and a Markup percent, or simply type the Client price.',
        'The margin and markup update as you type, so you see what you really earn.',
        'Click Add to price book to save it.',
      ],
      do: [
        { with: 0, act: 'type', target: 'Your cost ($)', text: '90' },
        { with: 0, act: 'type', target: 'Markup (%)', text: '50' },
        { with: 1, act: 'highlight', target: 'Margin', nth: 0 },
        { with: 2, act: 'click', target: 'Add to price book' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Filter by category or type, and switch between Grid and List.',
        'To use an item, open any document, and click the tag button on a line to pick from your Price book or Inventory.',
        'The save button on a line does the opposite: it adds that line to your price book.',
        'In an item, Product holds the supplier’s link and a few specs. They are for you, and never print.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Grid', role: 'tab' },
        { with: 0, act: 'click', target: 'List', role: 'tab', delay: 0.3 },
        { with: 1, act: 'click', target: 'Grid', role: 'tab', delay: 0.3 },
        { with: 3, act: 'click', target: 'Edit Porcelain tile, 12x24' },
        { with: 3, act: 'highlight', target: 'Product', nth: 0, delay: 0.5 },
        { with: 3, act: 'key', key: 'Escape', delay: 1.3 },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'A kit bundles items into one price. Click New kit, and add the components, their quantities, and any price override.',
        'Click Add labor to add the hours of work for one kit. The rate starts at your labor rate.',
        'Burden percent is what labor costs you on top of wages, like payroll taxes and insurance.',
        'Markup percent is the profit you add when you price the labor.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New kit' },
        { with: 0, act: 'type', target: 'Search components', text: 'Vanity', delay: 3.6 },
        { with: 0, act: 'click', target: 'Vanity, 36 in with top' },
        { with: 1, act: 'click', target: 'Add labor' },
        { with: 2, act: 'highlight', target: 'Burden (%)' },
        { with: 3, act: 'highlight', target: 'Markup (%)', nth: 0 },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Costs that are not stock go in as expenses: Equipment rental, Dump fee, Permit fee, Subcontract, or Other.',
        'Under the parts, the breakdown shows materials, labor and expenses, your cost and the price of each.',
        'The kit price follows the parts until you type your own.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Dump fee' },
        { with: 1, act: 'highlight', target: 'Cost breakdown' },
        { with: 2, act: 'highlight', target: 'Client price ($)' },
        { with: 2, act: 'key', key: 'Escape', delay: 0.4 },
      ],
    },
    {
      id: 's07', route: '/dashboard', kind: 'app', device: 'desktop',
      say: [
        'On an estimate or invoice, a kit is still one line at the kit price.',
        'View kit contents lists the materials, labor and expenses inside it. Hide contents on PDF keeps them off the printed page.',
        'Only names and prices appear on the document, never your costs.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project: Nair Master Bath', patience: 25000 },
        { with: 0, act: 'wait', s: 2.5 },
        { with: 0, act: 'click', target: 'Open Estimate: Vanity upgrade', delay: 0.2 },
        { with: 0, act: 'wait', s: 2.5, delay: 3.2 },
        { with: 1, act: 'click', target: 'View kit contents', delay: 1.5 },
        { with: 1, act: 'highlight', target: 'Hide contents on PDF' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop', route: '/pricebook',
      say: [
        'Starting from zero? Click Starter kits for a small library in each trade: bathroom, kitchen, painting, electrical, plumbing, roofing and flooring.',
        'Pick the kits you want, look at Details, then click Import. They land in your price book as normal kits.',
        'The prices are placeholders. Check every material, the labor hours and the markup before you quote with a kit.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Starter kits' },
        { with: 1, act: 'click', target: 'Details', nth: 0 },
        { with: 1, act: 'highlight', target: 'Import', nth: 0 },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'With Premium, you can pick a Preferred supplier on an item, and add up to six photos.',
        'When your supplier catalogues list the item, you see the cheapest known price, and Use as my cost copies it.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Edit Porcelain tile, 12x24' },
        { with: 0, act: 'highlight', target: 'Preferred supplier' },
        { with: 1, act: 'highlight', target: 'Use as my cost' },
        { with: 1, act: 'key', key: 'Escape', delay: 5.5 },
      ],
    },
    {
      id: 's10', kind: 'app', device: 'desktop', route: '/settings#integrations',
      say: [
        'To change many prices at once, open Settings, then Integrations and data, and click Import price list. This is a Premium feature.',
        'Choose What I charge for selling prices, or What I pay for costs, like a supplier’s list.',
        'Pick a CSV file with columns like SKU, Description, Unit and Price. Save an Excel sheet as CSV first.',
        'You review every row first: old price, new price, the percent, new items, and rows that cannot be used.',
        'Tick what you want, then click Apply. Nothing is saved until you do.',
        'There is no undo, so click Save the old prices first to keep a copy.',
        'Next, let us look at inventory and suppliers.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Import price list', patience: 25000 },
        { with: 1, act: 'highlight', target: 'What I charge' },
        { with: 1, act: 'highlight', target: 'What I pay' },
        { with: 2, act: 'highlight', target: 'Choose a CSV file' },
      ],
    },
  ],
};
