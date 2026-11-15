// Chapter 21: Job costing, T&M bills and the profit calculator. Sources: help guides `job-costing`, `calculator`.
export default {
  id: 'job-costing',
  number: 21,
  title: 'Job costing, time-and-materials bills and the profit calculator',
  summary: 'Compare budget with actual cost, bill unbilled hours and materials in one tap, and price a job with the profit calculator.',
  minutes: 3,
  covers: ['job-costing', 'calculator'],
  demoData: [
    'job "Whitfield Kitchen Remodel" with the accepted estimate EST-1042 (budget), one approved change order, 2 Time Sheets (Jamal, 3 days), a Material Log, an Expense Log and one Sent purchase order, so Budget vs actual shows Labor, Materials, Expenses and Subs and other with a spent amount and an ordered amount',
    'job completion at about 40 percent while the budget used is about 55 percent, so "Costs are ahead of the work" shows in red (otherwise type 40 in Job complete)',
    'the same job has unbilled time sheets and material-log lines (nothing billed yet), so Bill time & materials lists them ticked',
    'default labor rate 65 dollars an hour is already in the profile (seed)',
    'profit calculator with 2 starting lines (Materials, Labor) and one saved calculation',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about job costing: finding out whether a job makes money while you can still do something about it.',
        'Open a job, here the Whitfield Kitchen Remodel, and click Financials.',
        'Under the profit, you will find Budget vs actual.',
      ],
      do: [
        { with: 1, act: 'click', target: 'View Project', nth: 2, unsure: true },
        { with: 1, act: 'click', target: 'Financials' },
        { with: 2, act: 'highlight', target: 'Budget vs actual' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'The budget is the accepted estimate plus approved change orders.',
        'It is split into Labor, Materials, Expenses, and Subs and other, by the kind of each line.',
        'A line that mixes labor and materials stays Not split, unless it is a price book kit with labor and expense rows.',
      ],
      do: [
        { with: 1, act: 'highlight', target: 'Labor' },
        { with: 2, act: 'highlight', target: 'Not split', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Actual uses the same costs as the profit.',
        'That means time sheets times your labor rate, with overtime at one and a half, plus material logs and expense logs.',
        'Sent purchase orders count too. What was delivered or invoiced is Spent, and the rest is Ordered.',
      ],
      do: [
        { with: 1, act: 'highlight', target: 'Actual', unsure: true },
        { with: 2, act: 'highlight', target: 'Ordered', unsure: true },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Tell it how far along the job is. With a progress-billing invoice, percent complete comes from its lines.',
        'Otherwise, you type it yourself in Job complete.',
        'When more of the budget is used than the job is complete, Costs are ahead of the work shows in red.',
        'It also shows the profit you would end with at this pace.',
      ],
      do: [
        { with: 1, act: 'type', target: 'Job complete', text: '40', unsure: true },
        { with: 2, act: 'highlight', target: 'Costs are ahead of the work', unsure: true },
        { with: 3, act: 'zoom', target: 'Costs are ahead of the work', scale: 1.2, unsure: true },
        { with: 3, act: 'zoom', out: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Some jobs are billed by the hour. Click Bill time and materials on the job page. On a phone, it says Bill T and M.',
        'Unbilled time sheets and material log lines are listed and ticked. Tick Bill expense logs too to add those.',
        'Set your Labor dollars per hour and the Materials markup. Items from your price book keep their price.',
        'Choose Per worker or Per day, check the Invoice preview, and click Create draft invoice.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Bill time & materials' },
        { with: 1, act: 'highlight', target: 'Bill expense logs too', unsure: true },
        { with: 2, act: 'highlight', target: 'Materials markup', unsure: true },
        { with: 3, act: 'click', target: 'Per worker', unsure: true },
        { with: 3, act: 'highlight', target: 'Invoice preview', unsure: true },
        { with: 3, act: 'click', target: 'Create draft invoice' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'The draft invoice opens so you can check it and send it.',
        'Those hours and lines are marked billed, so they are never offered twice.',
        'On the Free plan, this invoice counts as one of your 12 new documents per job each month.',
      ],
      do: [
        { with: 0, act: 'wait', s: 2 },
        { with: 2, act: 'caption', text: 'Free plan: 12 new documents per job each month' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Before you quote, try the Profit calculator. Open Tools, then Profit calculator.',
        'Type one line for each part of the job, with your cost and the client price. Add line adds more.',
        'The summary shows profit, margin and markup. The card turns green from a 30 percent margin, amber from 15, and red below.',
        'Margin is profit divided by price, and markup is profit divided by cost. A 50 percent markup is only a 33 percent margin.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Tools' },
        { with: 0, act: 'click', target: 'Profit calculator', role: 'menuitem' },
        { with: 1, act: 'type', target: 'Your cost', nth: 0, text: '4200', unsure: true },
        { with: 1, act: 'type', target: 'Client price', nth: 0, text: '6300', unsure: true },
        { with: 1, act: 'click', target: 'Add line' },
        { with: 2, act: 'highlight', target: 'Margin', unsure: true },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'Click Advanced for the pricing tools. Enter a Target margin and click Calculate pricing.',
        'Every line with a cost gets the price that gives you that margin.',
        'Switch on Tax or VAT to see the total with tax. Tax never changes your profit.',
        'Save keeps the calculation in your account, and Export PDF downloads a profit report.',
        'Next, let us look at subcontractors and comparing quotes.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Advanced' },
        { with: 0, act: 'type', target: 'Target margin (%)', text: '35', unsure: true },
        { with: 0, act: 'click', target: 'Calculate pricing' },
        { with: 2, act: 'click', target: 'Tax / VAT', unsure: true },
        { with: 3, act: 'highlight', target: 'Save' },
        { with: 3, act: 'highlight', target: 'Export PDF' },
      ],
    },
  ],
};
