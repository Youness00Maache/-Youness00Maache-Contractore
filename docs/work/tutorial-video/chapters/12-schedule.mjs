// Chapter 12: The calendar (help guides "calendar" (calendar part), "appointments" and "job-tasks" for the markers; Insights is chapter 26).
export default {
  id: 'schedule',
  number: 12,
  title: 'The calendar',
  summary: 'See every job from start to end, plus task due days, lead follow-ups and appointments, in month, week and list views.',
  minutes: 2,
  covers: ['calendar'],
  demoData: [
    'the 6 demo jobs spread over the current month so bars show in Month and Week views (Whitfield Kitchen Remodel, Nair Master Bath, Alvarez Rental Repaint, Halvorsen Deck Estimate)',
    '4 open tasks with due dates on the Whitfield and Nair jobs, one of them overdue (red diamond)',
    '2 lead follow-up days (one overdue, red) and 1 booked appointment (site visit) in the coming week',
    'the profile on a paid plan so Tasks are switched on',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/calendar',
      say: [
        'This chapter is about the calendar, where you see when every job runs.',
        'Click Tools, then Calendar. Each job shows from its start date to its end date, colored by status.',
        'Switch between Month, Week and List with the buttons at the top.',
        'Month gives you the big picture, Week shows each day in more detail, and List is a plain list.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 12: The calendar' },
        { with: 1, act: 'hover', target: 'Whitfield Kitchen Remodel', unsure: true },
        { with: 2, act: 'click', target: 'Week', unsure: true },
        { with: 2, act: 'click', target: 'List', unsure: true },
        { with: 2, act: 'click', target: 'Month', unsure: true },
        { with: 3, act: 'hover', target: 'Month', unsure: true },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'To schedule a job, click New job.',
        'On a computer, you can also double-click a day in the month view.',
        'Fill in the job as you learned in the jobs chapter, and it appears on the calendar.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New job' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'highlight', target: 'Month', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'If you use job tasks, the calendar also marks the days your open tasks are due.',
        'Look for a small diamond on the day. It turns red when the task is late.',
        'In the Week view, tasks sit under each day. In the List view, they are grouped under Tasks.',
        'Tap one to open the Tasks tab of that job.',
      ],
      do: [
        { with: 1, act: 'highlight', target: 'Tasks', unsure: true },
        { with: 2, act: 'click', target: 'Week', unsure: true },
        { with: 2, act: 'click', target: 'List', unsure: true },
        { with: 2, act: 'highlight', target: 'Tasks', unsure: true },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Your lead follow-ups and booked appointments show up here too.',
        'A small blue marker on a day means a follow-up or an appointment. It turns red when a follow-up is late.',
        'In the Week view, they appear as slim chips with a blue edge. In the List view, they sit under Leads.',
        'Tap one to open the lead.',
        'On an appointment, Add to my calendar puts the visit in your own Google, Apple or Outlook calendar.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Month', unsure: true },
        { with: 2, act: 'click', target: 'Week', unsure: true },
        { with: 2, act: 'click', target: 'List', unsure: true },
        { with: 2, act: 'highlight', target: 'Leads', unsure: true },
        { with: 4, act: 'caption', text: 'Appointment: Add to my calendar' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'So one screen shows your jobs, your tasks and your leads.',
        'Insights sits under Tools as well, and it gets its own chapter later.',
        'Next, let us see how tasks work.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools' },
        { with: 1, act: 'highlight', target: 'Insights' },
        { with: 1, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
