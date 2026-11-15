// Chapter 26: Pipeline, Insights and the business overview. Sources: help guides `pipeline`, `business-overview`.
export default {
  id: 'insights-pipeline',
  number: 26,
  title: 'Pipeline, Insights and the business overview',
  summary: 'See every job by stage, catch what is stuck, and read your numbers, best and worst jobs, and estimates waiting for a yes.',
  minutes: 3,
  covers: ['pipeline', 'business-overview'],
  demoData: [
    'jobs spread over the pipeline stages with documents behind them: Halvorsen Deck Estimate (Requests, nothing sent), Nair Master Bath (Estimate sent EST-1043, no answer for 8 days so it shows the waiting badge), Whitfield Kitchen Remodel (In progress with work logged, invoice INV-2081 Sent), Alvarez Rental Repaint (overdue invoice INV-2072 so it shows Needs attention), Okafor Basement Finish (Paid)',
    'one quote request in Requests from the request-a-quote link',
    'Insights with enough billed and collected amounts in the current month and last month, costs on at least 4 jobs (time sheets, material logs, expenses) so Jobs by profit lists best and worst jobs, and one job with income but no costs to show "without enough data"',
    'Estimate EST-1043 shows under Waiting on a yes with the total value',
    'Gmail connected (for Nudge)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about seeing the whole business at a glance: your pipeline of jobs, and the Business overview in Insights.',
        'Click the Pipeline bar on the dashboard, or open Tools and choose Pipeline.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Pipeline', patience: 25000 },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Pipeline shows every job and quote request by stage: Requests, Estimate sent, Approved, In progress, Invoiced and Paid.',
        'Each card shows the client, the value, and the days in that stage. Each column adds up its money.',
        'There is nothing to drag. Cards move by themselves as your documents change.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Estimate sent', patience: 20000 },
        { with: 1, act: 'hover', target: 'Nair Master Bath' },
        { with: 2, act: 'zoom', target: 'Approved', scale: 1.1 },
        { with: 2, act: 'zoom', out: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Mark an estimate Sent, and the job moves to Estimate sent. Your client signing moves it to Approved.',
        'Once work is logged, like a time sheet or a daily report, it is In progress.',
        'A sent invoice moves it to Invoiced, and Mark as paid moves it to Paid.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Approved' },
        { with: 1, act: 'highlight', target: 'In progress' },
        { with: 2, act: 'highlight', target: 'Invoiced' },
        { with: 2, act: 'highlight', target: 'Paid', nth: 0 },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'A badge shows what waits too long, like an estimate with no answer after 7 days, or an overdue invoice.',
        'Click Needs attention to show only those.',
        'Then act in one tap: Follow up, Reminders, Mark as paid, Create job, or Open job.',
        'On a phone, you see one column at a time. Swipe sideways, or tap a stage at the top.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Needs attention' },
        { with: 2, act: 'highlight', target: 'Follow up', nth: 0 },
        { with: 2, act: 'highlight', target: 'Mark as paid', nth: 0 },
        { with: 3, act: 'click', target: 'Needs attention' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Now open Tools, then Insights. The Business overview is the first thing on the page.',
        'The first line sums up the period, with what you billed, what you collected, and what is still waiting.',
        'Under it you find Billed, Collected, Waiting, Overdue, Days to get paid, Profit and Active jobs.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Tools' },
        { with: 0, act: 'click', target: 'Insights', role: 'menuitem' },
        { with: 1, act: 'zoom', target: 'Billed', scale: 1.1 },
        { with: 2, act: 'zoom', out: true },
        { with: 2, act: 'highlight', target: 'Days to get paid', patience: 20000 },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Pick a period: This month, Last month, This quarter, This year, Last 12 months, or Custom dates.',
        'Choose a Customer or a Project, and every section follows. Show everything clears them.',
      ],
      do: [
        { with: 0, act: 'select', target: 'Period', option: 'Last month' },
        { with: 0, act: 'select', target: 'Period', option: 'This month', delay: 2.5 },
        { with: 1, act: 'select', target: 'Customer', option: 'Sarah Whitfield' },
        { with: 1, act: 'click', target: 'Show everything', delay: 3 },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Jobs by profit lists your five most and five least profitable jobs, with revenue, cost, profit and margin.',
        'Tap a job to open it. This period counts only what was billed and spent in the period.',
        'Whole job counts everything the job ever billed and cost. By profit and By margin change the order.',
        'A job needs both income and costs to be ranked, so you never see a fake 100 percent margin.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Jobs by profit' },
        { with: 1, act: 'highlight', target: 'This period' },
        { with: 2, act: 'click', target: 'Whole job' },
        { with: 2, act: 'click', target: 'By margin' },
        { with: 3, act: 'highlight', target: 'without enough data' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'Waiting on a yes lists the estimates nobody answered, longest wait first, with the total value.',
        'Click Nudge to send a reminder from your Gmail, a text, or a link.',
        'Active jobs shows how much of each budget is used, the tasks done, and the next date.',
        'A red tag warns you when a job is over budget, or a task is late.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Waiting on a yes' },
        { with: 1, act: 'click', target: 'Nudge', nth: 0 },
        { with: 1, act: 'key', key: 'Escape', delay: 2.4 },
        { with: 2, act: 'scroll', to: 'Active jobs' },
        { with: 3, act: 'highlight', target: 'over budget', nth: 0 },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'Click Download this overview as CSV to save what you see as a spreadsheet file.',
        'The Business overview is part of every plan, and it opens offline with the figures last loaded.',
        'Below it, Insights shows revenue collected, outstanding, costs, profit, average invoice and your estimate win rate, with charts.',
        'Next, let us set up automations and exports.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Download this overview as CSV' },
        { with: 2, act: 'scroll', by: 700 },
      ],
    },
  ],
};
