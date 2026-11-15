// Chapter 13: Tasks and the job timeline (help guides "job-tasks" and "job-timeline").
export default {
  id: 'tasks-timeline',
  number: 13,
  title: 'Tasks and the job timeline',
  summary: 'Plan a job step by step with tasks, templates and the timeline view, and keep a record of everything that happened.',
  minutes: 3,
  covers: ['job-tasks', 'job-timeline'],
  demoData: [
    'crew members Jamal and Eli (needed for @Jamal and @Eli on tasks)',
    'job "Whitfield Kitchen Remodel" with about 8 tasks: some done, one In progress, one Blocked, one overdue, one Milestone ("Electrical inspection"), and two that wait for other tasks (dependencies)',
    'a built-in task template list (bathroom remodel, deck build) available under Add from a template',
    'the canned AI answer for Note to tasks: 3 tasks (pour footings Monday, Eli orders windows by Friday, inspection on the 20th)',
    'the profile on Premium + AI so Tasks, templates and Note to tasks are all unlocked',
    'a rich timeline on Whitfield Kitchen Remodel: documents sent and signed, a daily report with hours, photos by day, a note, an invoice reminder, a sent email, a crew clock entry',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about planning jobs with tasks, and keeping a record of what happens.',
        'Open a job and switch to Tasks. Type a task, and press Enter or click Add.',
        'End the line with an at sign and a name, like Jamal, to give it to a crew member.',
        'Click Date to set a due day.',
        'Job tasks are part of Premium.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 13: Tasks and the timeline' },
        { with: 1, act: 'click', target: 'Whitfield Kitchen Remodel' },
        { with: 1, act: 'click', target: 'Tasks', role: 'tab' },
        { with: 1, act: 'type', target: 'New task', text: 'Order cabinet hardware @Jamal' },
        { with: 1, act: 'click', target: 'Add task' },
        { with: 3, act: 'highlight', target: 'Set a due date' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Tap the ring in front of a task to mark it done. Tap it again to undo.',
        'Tap the task itself to open it. You can add notes, and set the status: To do, In progress, Blocked or Done.',
        'Choose who does it, and set the start and due dates.',
        'Switch on Milestone for a date you must hit, like an inspection.',
        'Comments from your crew show up in the same window, with their photos.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Mark “Order cabinet hardware” done', unsure: true },
        { with: 1, act: 'click', target: 'Order cabinet hardware', unsure: true },
        { with: 1, act: 'highlight', target: 'In progress' },
        { with: 3, act: 'highlight', target: 'Milestone' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Some tasks cannot start until another is done. In a task, use Waits for to pick what comes first.',
        'A task that waits shows Waiting on, and counts as Blocked until the others are done.',
        'Grey-striped rows are the longest chain. If one is late, the finish moves.',
        'If you move a date, the app asks Move the tasks that follow too? You choose how far.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Waits for' },
        { with: 1, act: 'highlight', target: 'Waiting on', unsure: true },
        { with: 3, act: 'highlight', target: 'Move the tasks that follow too?', unsure: true },
        { with: 3, act: 'highlight', target: 'Only as far as needed', unsure: true },
        { with: 3, act: 'highlight', target: 'No, leave them', unsure: true },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Your tasks can be listed By date, which groups them as Overdue, Today, Coming up, Later, No date and Done.',
        'In order is your own order. Use the arrows, or drag a row on a computer.',
        'Timeline draws each task as a bar, with milestones as diamonds, late tasks in red, and a line for today.',
      ],
      do: [
        { with: 0, act: 'click', target: 'By date' },
        { with: 1, act: 'click', target: 'In order' },
        { with: 2, act: 'click', target: 'Timeline', role: 'button', unsure: true },
        { with: 2, act: 'zoom', target: 'Timeline', scale: 1.15, unsure: true },
        { with: 2, act: 'zoom', out: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Do the same kind of job often? Open the three-dot menu, and choose Add from a template.',
        'There are ready-made lists, like a bathroom remodel or a deck build, and your own.',
        'Pick one, choose the day the first task starts, untick what this job does not need, and add them.',
        'To keep a job steps for next time, choose Save these tasks as a template.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Task actions' },
        { with: 0, act: 'click', target: 'Add from a template' },
        { with: 2, act: 'highlight', target: 'bathroom remodel', unsure: true },
        { with: 2, act: 'key', key: 'Escape' },
        { with: 3, act: 'highlight', target: 'Save these tasks as a template', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'With Premium plus AI, click Note to tasks, and type or say what needs doing.',
        'For example: pour footings Monday, Eli orders windows by Friday, inspection on the 20th.',
        'The assistant lists the tasks, with who and when. You check them, fix any, and only then add them.',
        'It uses one of your AI requests.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Note to tasks' },
        { with: 1, act: 'type', target: 'Note', text: 'Pour footings Monday, Eli orders windows by Friday, inspection on the 20th', unsure: true },
        { with: 2, act: 'state', note: 'Fake AI answers with 3 tasks (pour footings, order windows for Eli, inspection milestone)' },
        { with: 2, act: 'highlight', target: 'Add', unsure: true },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Now open the Timeline tab. It lists everything that happened on the job, newest first.',
        'You see documents sent, signed and paid, daily reports, photos, notes, questions, reminders and crew hours.',
        'Search for a name or an amount, and use This week, This month or All to limit the time.',
        'The chips, like Money and Photos, show only those kinds. Click Details to read more.',
        'The timeline is just for you. Nothing on it is shown to your client.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Timeline', role: 'tab' },
        { with: 2, act: 'type', target: 'Search', text: 'tile', unsure: true },
        { with: 2, act: 'highlight', target: 'This week' },
        { with: 3, act: 'highlight', target: 'Money', unsure: true },
        { with: 3, act: 'click', target: 'Details', unsure: true },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'After a phone call, use Log a conversation at the top. Type, or tap the microphone, and say what was agreed.',
        'For example: client called, wants the tile in grey.',
        'Tick Also make a follow-up task, if you want a task too.',
        'Then click Add note. It becomes a Note on this job, and appears on the timeline at once.',
        'Next, let us look at job photos and daily reports.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Log a conversation' },
        { with: 1, act: 'type', target: 'Log a conversation', text: 'Client called, wants the tile in grey', unsure: true },
        { with: 2, act: 'click', target: 'Also make a follow-up task' },
        { with: 3, act: 'click', target: 'Add note' },
      ],
    },
  ],
};
