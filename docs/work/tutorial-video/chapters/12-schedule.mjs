// Chapter 12: The calendar (help guides "calendar" (calendar part), "appointments" and "job-tasks" for the markers; Insights is chapter 26).
// The aria-label of a day cell in the month view, e.g. "Wednesday, November 18" (n days from today).
const dayCell = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
export default {
  id: 'schedule',
  number: 12,
  title: 'The calendar',
  summary: 'See every job from start to end, plus task due days, lead follow-ups and appointments, in month, week and list views.',
  minutes: 2,
  covers: ['calendar'],
  demoData: [
    'the demo jobs spread over the current month (Whitfield Kitchen Remodel, Nair Master Bath, Alvarez Rental Repaint, Halvorsen Deck Estimate) so bars show in Month and Week',
    'open tasks with dates (Whitfield from the chapter 8 data, plus Nair: one LATE "Order the shower glass door", "Tile delivery", "Plumbing inspection" milestone): fake-backend/demo/12-schedule.mjs',
    'lead follow-ups (Mike Dunn late, Hannah Brooks today) and two booked appointments from the chapter 2 / 10 data',
    'the profile on Premium + AI so Tasks are switched on',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about the calendar, where you see when every job runs.',
        'Click Tools, then Calendar. Each job shows from its start date to its end date, colored by status.',
        'Switch between Month, Week and List with the buttons at the top.',
        'Month gives you the big picture, Week shows each day in more detail, and List is a plain list.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 12: The calendar' },
        { with: 1, act: 'click', target: 'Tools', patience: 25000 },
        { with: 1, act: 'click', target: 'Calendar', role: 'menuitem' },
        { with: 1, act: 'hover', target: 'Whitfield Kitchen Remodel', patience: 20000 },
        { with: 2, act: 'highlight', target: 'Month', role: 'tab' },
        { with: 2, act: 'highlight', target: 'Week', role: 'tab' },
        { with: 2, act: 'highlight', target: 'List', role: 'tab' },
        { with: 3, act: 'click', target: 'Month', role: 'tab' },
        { with: 3, act: 'click', target: 'Week', role: 'tab' },
        { with: 3, act: 'click', target: 'List', role: 'tab' },
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
        { with: 1, act: 'goto', route: '/calendar' },
        { with: 1, act: 'hover', target: dayCell(3), patience: 20000 },
        { with: 2, act: 'highlight', target: 'Nair Master Bath', nth: 0 },
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
        { with: 1, act: 'highlight', target: 'Order the shower glass door', nth: 0 },
        { with: 2, act: 'click', target: 'Week', role: 'tab' },
        { with: 2, act: 'click', target: 'List', role: 'tab' },
        { with: 2, act: 'highlight', target: 'Tasks', nth: 0 },
        { with: 3, act: 'hover', target: 'Open tasks of Nair Master Bath: Order the shower glass door' },
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
        { with: 0, act: 'goto', route: '/calendar' },
        { with: 1, act: 'highlight', target: 'Mike Dunn', nth: 0, patience: 20000 },
        { with: 2, act: 'click', target: 'Week', role: 'tab' },
        { with: 2, act: 'click', target: 'List', role: 'tab' },
        { with: 2, act: 'highlight', target: 'Leads', nth: 0 },
        { with: 3, act: 'hover', target: 'Open lead: Follow up: Hannah Brooks' },
        { with: 4, act: 'highlight', target: 'Add to my calendar', nth: 0 },
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
