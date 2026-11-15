// Chapter 18: Service plans. Source: help guide `service-plans`.
export default {
  id: 'service-plans',
  number: 18,
  title: 'Service plans (repeat maintenance visits)',
  summary: 'Set up a plan like a twice-a-year maintenance visit and let each visit make its own work order, invoice and reminder.',
  minutes: 2,
  covers: ['service-plans'],
  demoData: [
    'two service plans: "Spring and fall home check" (Linda Okafor, Twice a year, Invoice each visit, one visit coming with a Work Order and a Draft invoice, one old visit done) and "Quarterly gutter cleaning" (Tom Alvarez, Quarterly invoice)',
    'client Sarah Whitfield exists without a plan (the new plan typed in the chapter); saving it creates its job and the visits that are due',
    'the REAL client portal /?portal=demo-portal-linda shows the plan through get_portal_service_plans',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about service plans, for work that comes back again and again, like a twice-a-year maintenance visit.',
        'Open Tools, then Service plans. On a phone, it is under More.',
        'Service plans are part of Premium, so you need that plan to follow along.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools', patience: 25000 },
        { with: 1, act: 'click', target: 'Service plans', role: 'menuitem' },
        { with: 1, act: 'wait', s: 2, delay: 1.1 },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click New plan. Pick the client, name the plan, and say what you do at each visit.',
        'That text prints on every work order, so your crew knows the job.',
        'Choose how often, for example Twice a year, and the date of the first visit.',
        'Set the price and how it is billed, then click Save plan.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New plan', patience: 20000 },
        { with: 0, act: 'select', target: 'Client', option: 'Sarah Whitfield' },
        { with: 0, act: 'type', target: 'Plan name', text: 'Gutter and deck check', delay: 2.3 },
        { with: 1, act: 'type', target: 'What is done at each visit', text: 'Clean gutters, check deck boards and railings, reseal if needed.' },
        { with: 2, act: 'click', target: 'Twice a year' },
        { with: 2, act: 'highlight', target: 'First visit' },
        { with: 3, act: 'scroll', to: 'Billing' },
        { with: 3, act: 'select', target: 'Billing', option: 'Invoice each visit' },
        { with: 3, act: 'type', target: '129.00', text: '180' },
        { with: 3, act: 'click', target: 'Save plan', delay: 0.1 },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Now ContractorDocs does the rest. It makes a job for the plan and creates each visit ahead of time, 14 days by default.',
        'Every visit gets a work order, and if you chose Invoice each visit, a draft invoice too.',
        'The job moves to the visit date, so it shows on your calendar, and the client gets your reminder the day before.',
        'This happens every hour, even when you do not open the app.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Next visits' },
        { with: 1, act: 'click', target: 'Visit actions', nth: 0 },
        { with: 1, act: 'highlight', target: 'Open work order' },
        { with: 1, act: 'highlight', target: 'Open invoice' },
        { with: 1, act: 'key', key: 'Escape', delay: 4 },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Prefer one bill? Choose Monthly, Quarterly, Invoice every 6 months, or Yearly invoice.',
        'One recurring invoice is added to the plan’s job, and it repeats by itself.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More for Quarterly gutter cleaning' },
        { with: 0, act: 'click', target: 'Edit', role: 'menuitem' },
        { with: 0, act: 'highlight', target: 'Billing' },
        { with: 1, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Under Next visits, tap Done when a visit is finished. The work order becomes Completed.',
        'The three-dot menu lets you Skip this visit, Open work order, or Open invoice.',
        'To change a plan, use its menu: Edit, Pause, Resume, End plan or Delete. Delete keeps the job and its documents.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Done', nth: 0 },
        { with: 1, act: 'click', target: 'Visit actions', nth: 0 },
        { with: 1, act: 'highlight', target: 'Skip this visit' },
        { with: 1, act: 'key', key: 'Escape', delay: 2.2 },
        { with: 2, act: 'click', target: 'More for Spring and fall home check' },
        { with: 2, act: 'highlight', target: 'End plan' },
        { with: 2, act: 'key', key: 'Escape', delay: 3.5 },
      ],
    },
    {
      id: 's06', route: '/?portal=demo-portal-linda', kind: 'app', device: 'phone',
      say: [
        'Your client sees the plan too, with the next visit and the last one, in their portal.',
        'Next, let us build your price book, so quoting is faster.',
      ],
      visual: 'A phone frame slides in with the client portal. A card titled "Spring and fall home check" appears with two rows: "Next visit" with a date and a small calendar icon, and "Last visit" with a green check mark and a date. A soft reminder bubble "Visit reminder: tomorrow" pops in beside the phone. Calm dark background matching the app theme.',
      do: [
        { with: 0, act: 'caption', text: 'What your client sees' },
        { with: 0, act: 'scroll', to: 'Your service plan', patience: 25000, delay: 0.9 },
        { with: 0, act: 'highlight', target: 'Next visit' },
        { with: 0, act: 'highlight', target: 'Last visit' },
      ],
    },
  ],
};
