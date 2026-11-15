// Chapter 3: Jobs. This is the reference example for the format (see STORYBOARD_FORMAT.md).
export default {
  id: 'jobs',
  number: 3,
  title: 'Jobs: one place for a whole project',
  summary: 'Create a job, pick the client, set the dates, and work from the job page.',
  minutes: 3,
  covers: ['jobs'],
  demoData: ['6 jobs with different statuses (active, paused, completed)', 'job "Nair Master Bath" with an estimate and photos tab', 'saved clients (Sarah Whitfield, David & Priya Nair, ...)'],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'In ContractorDocs, everything starts with a job.',
        'A job holds the client, the address, the dates, and every document and photo for one project.',
        'Here on the dashboard you can see all of your jobs as cards.',
      ],
      do: [
        { with: 0, act: 'hover', target: 'Whitfield Kitchen Remodel' },
        { with: 2, act: 'scroll', by: 260 },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'To start a new project, click New Job at the top.',
        'Type the job name, for example the client and what you are building.',
        'Then pick a saved client from the list.',
        'If the client is new, just type the name, and it is added to your clients for you.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New Job' },
        { with: 1, act: 'type', target: 'Job / project name', text: 'Lakeview Porch Rebuild' },
        { with: 2, act: 'select', target: 'Saved client', option: 'Sarah Whitfield' },
        { with: 3, act: 'highlight', target: 'Client name', label: 'New client? Type the name here' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Add the job site address, and set the start date. Today is filled in for you.',
        'You can add an end date and the worker who is assigned.',
        'For a one-off customer you will never work for again, tick Mark as temporary client.',
        'Click Create job, and you land on the job page.',
      ],
      do: [
        { with: 0, act: 'type', target: 'Job site address', text: '27 Maple Lane, Maple Grove' },
        { with: 1, act: 'highlight', target: 'End date' },
        { with: 2, act: 'highlight', target: 'Mark as temporary client' },
        { with: 3, act: 'click', target: 'Create job' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Back on the dashboard, open any job with View Project.',
        'At the top of the job page, the status menu next to the name tells you where the project stands: Active, Paused, Completed or Inactive.',
        'Change it whenever the job changes. Your dashboard and your pipeline follow along.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project', nth: 1 },
        { with: 1, act: 'highlight', target: 'Active', label: 'Status' },
        { with: 2, act: 'select', target: 'Active', option: 'Paused' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Below the name you will find the tabs of the job.',
        'Project Documents holds every invoice, estimate and report.',
        'Photos keeps your pictures. The other tabs, like Tasks, Files and Crew, each get their own chapter later in this video.',
      ],
      do: [
        { with: 0, act: 'scroll', by: 120 },
        { with: 1, act: 'click', target: 'Project Documents', role: 'tab' },
        { with: 2, act: 'click', target: 'Photos', role: 'tab' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Want to know if the job is making money? Click Financials.',
        'It shows the income from your invoices, minus materials, expenses and labor.',
        'Labor comes from your time sheets, multiplied by your labor rate, with overtime counted at one and a half.',
        'The labor rate you type there is saved to your account, so you only enter it once.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Financials' },
        { with: 1, act: 'zoom', target: 'Financials', scale: 1.2 },
        { with: 3, act: 'zoom', out: true },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Doing the same kind of job again? Open the three-dot menu on the job card and choose Duplicate job.',
        'You can copy its documents too, so you do not start from a blank page.',
        'The same menu has Delete job, so be careful with that one.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 1, act: 'highlight', target: 'Duplicate job' },
        { with: 2, act: 'highlight', target: 'Delete job' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's08', kind: 'motion', template: 'month-limit',
      say: [
        'One thing to know if you are on the Free plan: you can create six new jobs every month.',
        'Premium removes that limit. Next, let us look at your clients.',
      ],
      visual: 'A calendar-month strip with six job tiles filling up one by one and a small counter "6 of 6 this month" turning amber; then the counter resets with a "Premium: no limit" tag sliding in. Clean dark background matching the app theme, big readable numbers.',
      do: [{ with: 0, act: 'caption', text: 'Free plan: 6 new jobs a month' }],
    },
  ],
};
