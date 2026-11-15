// Chapter 18: Service plans. Source: help guide `service-plans`.
export default {
  id: 'service-plans',
  number: 18,
  title: 'Service plans (repeat maintenance visits)',
  summary: 'Set up a plan like a twice-a-year maintenance visit and let each visit make its own work order, invoice and reminder.',
  minutes: 2,
  covers: ['service-plans'],
  demoData: [
    'one existing service plan "Spring and fall home check" for client Linda Okafor, Twice a year, billed "Invoice each visit", with 2 upcoming visits under Next visits (one with a Draft invoice and a Work Order)',
    'the plan job shows on the calendar on the next visit date',
    'client Sarah Whitfield exists without a plan (used for the new plan typed in the scene)',
    'portal view of the plan for the motion scene: plan name, next visit date, last visit date',
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
        { with: 1, act: 'click', target: 'Tools' },
        { with: 1, act: 'click', target: 'Service plans', role: 'menuitem' },
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
        { with: 0, act: 'click', target: 'New plan' },
        { with: 0, act: 'type', target: 'Client name', text: 'Sarah Whitfield', unsure: true },
        { with: 0, act: 'type', target: 'Plan name', text: 'Gutter and deck check' },
        { with: 1, act: 'type', target: 'What is done at each visit', text: 'Clean gutters, check deck boards and railings, reseal if needed.' },
        { with: 2, act: 'click', target: 'Twice a year' },
        { with: 3, act: 'select', target: 'Billing', option: 'Invoice each visit', unsure: true },
        { with: 3, act: 'type', target: 'Price', text: '180', unsure: true },
        { with: 3, act: 'click', target: 'Save plan' },
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
        { with: 1, act: 'highlight', target: 'Done', label: 'Work order and draft invoice', unsure: true },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Prefer one bill? Choose Monthly, Quarterly, Invoice every 6 months, or Yearly invoice.',
        'One recurring invoice is added to the plan’s job, and it repeats by itself.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Billing', unsure: true },
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
        { with: 1, act: 'click', target: 'Visit actions', nth: 0, unsure: true },
        { with: 1, act: 'highlight', target: 'Skip this visit' },
        { with: 1, act: 'key', key: 'Escape' },
        { with: 2, act: 'click', target: 'More for Spring and fall home check', unsure: true },
        { with: 2, act: 'highlight', target: 'End plan' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's06', kind: 'motion',
      say: [
        'Your client sees the plan too, with the next visit and the last one, in their portal.',
        'Next, let us build your price book, so quoting is faster.',
      ],
      visual: 'A phone frame slides in with the client portal. A card titled "Spring and fall home check" appears with two rows: "Next visit" with a date and a small calendar icon, and "Last visit" with a green check mark and a date. A soft reminder bubble "Visit reminder: tomorrow" pops in beside the phone. Calm dark background matching the app theme.',
      do: [{ with: 0, act: 'caption', text: 'What your client sees' }],
    },
  ],
};
