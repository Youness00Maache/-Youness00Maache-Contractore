// Chapter 20: Inventory, suppliers and purchase orders. Sources: help guides `inventory`, `suppliers`.
export default {
  id: 'inventory-suppliers',
  number: 20,
  title: 'Inventory, suppliers and purchase orders',
  summary: 'Track stock, check it out to jobs, print QR labels, save suppliers, order and reorder, and record deliveries.',
  minutes: 4,
  covers: ['inventory', 'suppliers'],
  demoData: [
    'the 5 seed inventory items; "Interior paint, 1 gal" (9, alert at 10) and "Thinset mortar, 50 lb" (6, alert at 8) are below their alert so Inventory shows low stock',
    'both low items have the Supplier set to "Lakeside Building Supply" and a Reorder quantity (paint 12, thinset 10)',
    'two saved suppliers: "Lakeside Building Supply" (order email, phone, account number, one star preferred, terms Net 30, lead time 2 days) and "Harbor Tile and Stone", each with a small Catalogue (SKU, unit, price) and one price that went up 8 percent',
    'a saved Draft purchase order on "Whitfield Kitchen Remodel" to Lakeside Building Supply with 3 lines (2 of them matching inventory items)',
    'a second purchase order already Sent with part of it delivered, showing Partially delivered, to use for the Record delivery and supplier invoice scenes',
    'a small supplier CSV price list on disk for the supplier Price list import',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about your stock: what you have, what you ordered, and what is running low.',
        'Open Tools, then Inventory, to see every item with its quantity.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools' },
        { with: 1, act: 'click', target: 'Inventory', role: 'menuitem' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click Add item, and pick Stock item, or Kit for a bundle of items.',
        'Fill in the name, unit cost, unit and storage location.',
        'Low-stock alert at tells the app when to warn you, and Starting quantity is what you have today.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Add item' },
        { with: 0, act: 'click', target: 'Stock item' },
        { with: 1, act: 'type', target: 'Name', text: 'Caulk, 10 oz tube', unsure: true },
        { with: 2, act: 'highlight', target: 'Low-stock alert at' },
        { with: 2, act: 'highlight', target: 'Starting quantity' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Use Adjust stock from an item’s menu, and pick a reason: restock, returned from job, count correction, damaged or used.',
        'Every change is listed in History.',
        'To use stock on a job, click Check out, set the quantity, and pick the job. Checking out a kit takes out all its parts.',
        'Items you pick from inventory on invoices and estimates leave your stock for you, once the document is approved, accepted or paid.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 0, act: 'highlight', target: 'Adjust stock' },
        { with: 1, act: 'highlight', target: 'History' },
        { with: 2, act: 'click', target: 'Check out', nth: 0 },
        { with: 2, act: 'select', target: 'Job', option: 'Whitfield Kitchen Remodel', unsure: true },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'On a computer, click Labels to print QR labels on Avery or A4 sheets. Print at 100 percent scale, with no margins.',
        'Scanning a label with the phone camera opens the item, and Scan in the app opens Check out for it.',
        'Items running low also show on your dashboard.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Labels' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'highlight', target: 'Scan' },
        { with: 2, act: 'highlight', target: 'Low stock', unsure: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Now suppliers. Click Suppliers, then Add supplier, and type the name, the email for orders, phone, your account number and notes.',
        'Then click Save supplier.',
        'Open a supplier to add the contact person, payment terms and delivery lead time, and tap the star to mark a preferred supplier.',
        'Archive this supplier hides it instead of deleting it, so older orders keep its details.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Suppliers' },
        { with: 0, act: 'click', target: 'Add supplier' },
        { with: 0, act: 'type', target: 'Name', text: 'Harbor Tile and Stone', unsure: true },
        { with: 1, act: 'click', target: 'Save supplier' },
        { with: 2, act: 'click', target: 'Lakeside Building Supply', unsure: true },
        { with: 3, act: 'highlight', target: 'Archive this supplier' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'With Premium, open a supplier’s Catalogue and add what it sells: SKU, name, unit, price and a product link.',
        'Every price change is remembered, with an up or down badge and the percent. Price changed lists only the big ones.',
        'Or open Price list and pick a CSV file. You review every row first, and nothing changes until you click Apply.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Catalogue' },
        { with: 1, act: 'click', target: 'Price changed' },
        { with: 2, act: 'highlight', target: 'Price list' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'To order, open a job and create a Purchase Order. Next to Vendor, pick a supplier from Saved suppliers.',
        'The name, email, phone and address are filled in for you.',
        'Typed a new vendor? Save as supplier keeps it for next time.',
        'Premium adds Send to supplier. It opens the Share window addressed to the supplier, and Send with Gmail attaches the PDF.',
        'Purchase orders, Share and Record delivery work on every plan.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project', nth: 2, unsure: true },
        { with: 0, act: 'click', target: 'Purchase Order', unsure: true },
        { with: 0, act: 'select', target: 'Saved suppliers…', option: 'Lakeside Building Supply', unsure: true },
        { with: 2, act: 'highlight', target: 'Save as supplier', unsure: true },
        { with: 3, act: 'highlight', target: 'Send to supplier' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop', route: '/inventory',
      say: [
        'On each item, set the Low-stock alert at, the Supplier, and a Reorder quantity if you like.',
        'When items run low, Inventory tells you how many, and what is already on order.',
        'With Premium, click Create reorder POs. It lists them by supplier, with quantity and unit cost.',
        'Untick or change anything, choose the job, and you get one Draft purchase order per supplier.',
      ],
      do: [
        { with: 1, act: 'highlight', target: 'On order', unsure: true },
        { with: 2, act: 'click', target: 'Create reorder POs' },
        { with: 3, act: 'highlight', target: 'Shop stock', unsure: true },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'When the goods arrive, open the order and click Record delivery.',
        'Enter what arrived on each line, plus the date and a note.',
        'Each line from Inventory is added to your stock once per delivery, and shows in the item’s History.',
        'Only part of the order came? It shows Partially delivered, so you can record the rest later.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project', nth: 2, unsure: true },
        { with: 0, act: 'click', target: 'Record delivery' },
        { with: 1, act: 'highlight', target: 'Received', unsure: true },
        { with: 3, act: 'highlight', target: 'Partially delivered', unsure: true },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's10', kind: 'app', device: 'desktop',
      say: [
        'When the supplier bills you, enter their Supplier invoice number and the amount, and attach the invoice. The order becomes Invoiced.',
        'Mark it paid when you pay.',
        'Job costing counts what was delivered or invoiced as spent, and the rest of a sent order as ordered.',
        'Next, let us see what all this does to your job costs.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Supplier invoice #', unsure: true },
        { with: 1, act: 'highlight', target: 'Mark paid', unsure: true },
      ],
    },
  ],
};
