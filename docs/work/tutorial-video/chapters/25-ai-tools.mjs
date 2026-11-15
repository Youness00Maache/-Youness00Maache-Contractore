// Chapter 25: The AI tools. Sources: help guides `ai`, `read-documents` (+ estimate review, AI walkthrough, Note to tasks, Summarize with AI).
// Plan limits come from lib/plans.ts (FREE_LIMITS.ai = 15, PAID_AI_LIMITS.premium = 60, PAID_AI_LIMITS.ai = 600). No prices here.
export default {
  id: 'ai-tools',
  number: 25,
  title: 'The AI tools',
  summary: 'AI Command and AI fill, daily reports from photos, tasks from notes, receipt reading, the estimate check, and the business summary.',
  minutes: 4.5,
  covers: ['ai', 'read-documents'],
  demoData: [
    'canned AI answer (fake ai-assistant function) for the prompt "draft an estimate for a 12 x 14 deck for Greg Halvorsen": a Draft estimate with 5 lines, two of them matching price book items',
    'canned AI answer for "Note to tasks": "Pour footings Monday, Mike orders windows by Friday, inspection on the 20th" -> 3 tasks with who and when',
    'canned AI walkthrough result (a Daily Job Report draft) for the job "Nair Master Bath" with 4 photos from today',
    'canned receipt reading for the Expense Log: vendor Lakeside Building Supply, date, 3 lines, subtotal, tax and total that add up, one value marked "check"',
    'canned estimate AI check on EST-1043 with 2 suggestions (grout and adhesive, dump fee) next to the free checks',
    'canned business summary text for Insights ("Reading your numbers..." then a short paragraph)',
    'the demo account is on Premium + AI (seed: subscription_tier ai)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about the AI tools. They draft and read for you, and you check and approve.',
        'Nothing is created or sent until you click.',
        'Click AI Command on the dashboard. On a phone, it is the sparkle button.',
      ],
      do: [
        { with: 2, act: 'click', target: 'AI Command' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Type or dictate what you need, for example, draft an estimate for a 12 by 14 deck for Greg Halvorsen.',
        'It can draft documents, clients, jobs and emails for you to approve.',
        'Type an at sign to pick a client, and a hash sign to pick a document. You can attach up to three photos.',
        'When it drafts an estimate, it uses your price book, so your own items get your own prices.',
        'It never makes up prices for other lines, and your costs and margins are never sent.',
      ],
      do: [
        { with: 0, act: 'type', target: 'Ask anything', text: 'Draft an estimate for a 12 x 14 deck for Greg Halvorsen', patience: 15000 },
        { with: 0, act: 'key', key: 'Enter', delay: 5.2 },
        { with: 2, act: 'highlight', target: 'Attach photos' },
      ],
    },
    {
      id: 's03', kind: 'motion',
      say: [
        'While you wait, the assistant reads your request, checks your price book, and writes a first draft.',
        'Then you get a draft with your lines in it, ready for you to look over.',
      ],
      template: 'ai-thinking',
      visual: 'On a dark background, a chat bubble types "Draft an estimate for a 12 x 14 deck for Greg Halvorsen". Three soft pulsing dots appear under it, while small chips fly in one by one from the side labelled "Your request", "Your price book", "Greg Halvorsen". The dots resolve into a draft card titled "Estimate: Deck 12 x 14" with five lines and prices, two lines marked with a small price-book tag, and three buttons underneath: "Open & edit", "Save", "Discard".',
      do: [{ with: 0, act: 'caption', text: 'The assistant proposes, you decide' }],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'The assistant proposes, and you decide. Drafts show Open and edit, Save, and Discard.',
        'Other proposals show Review and create, Review and add, or a send button. Multi-step plans offer Do it all.',
        'Past chats reopens earlier conversations, and New chat starts fresh.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Open & edit' },
        { with: 1, act: 'caption', text: 'Other proposals: Review and create, Do it all' },
        { with: 2, act: 'click', target: 'Past chats' },
        { with: 2, act: 'highlight', target: 'New chat' },
        { with: 2, act: 'key', key: 'Escape', delay: 3.2 },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001',
      say: [
        'On a job page, click AI Assistant to work on just that job.',
        'It can answer questions from your job and business numbers.',
        'Inside any document, AI fill fills just that form from a description you type or say.',
        'It only fills fields. Nothing is saved until you click Save.',
        'On an estimate, you can even ask it to turn your lines into good, better, best options.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'AI Assistant', patience: 25000 },
        { with: 2, act: 'click', target: 'Master bath renovation' },
        { with: 2, act: 'highlight', target: 'AI fill', patience: 20000, delay: 2.4 },
        { with: 3, act: 'highlight', target: 'Save', role: 'button' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001#photos',
      say: [
        'With Premium plus AI, AI walkthrough, in your job Photos, takes the day’s photos and what you say about them.',
        'It drafts a Daily Job Report or a Note that opens in the editor, so you can check it and save.',
        'It only writes what your photos and your words show.',
        'On the Tasks tab, Note to tasks turns a note, like Pour footings Monday, into a list of tasks with who and when.',
        'You see them first, fix or untick any, and only then add them.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'AI walkthrough', patience: 25000 },
        { with: 3, act: 'click', target: 'Tasks', role: 'tab' },
        { with: 3, act: 'click', target: 'Note to tasks' },
        { with: 3, act: 'type', target: 'Note to turn into tasks', text: 'Pour footings Monday. Mike orders windows by Friday. Inspection on the 20th.', delay: 2.2 },
        { with: 4, act: 'click', target: 'Find the tasks' },
        { with: 4, act: 'highlight', target: 'Add 3 tasks', delay: 1.5 },
        { with: 4, act: 'key', key: 'Escape', delay: 4 },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001',
      say: [
        'Receipts are next. On a job, create an Expense Log, and under Scan a receipt, click Read with AI.',
        'Take or choose up to four photos of one receipt, or one PDF of up to ten pages.',
        'The original shows next to what the AI read. Anything it was unsure about is marked check.',
        'The line under the total says whether it adds up. Fix anything wrong, then click Save expense.',
        'This one is Premium plus AI. Without a signal, Scan receipt still reads receipts on your device.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New Document', patience: 25000 },
        { with: 0, act: 'click', target: 'Expense Log' },
        { with: 0, act: 'click', target: 'Read with AI', delay: 2 },
        { with: 2, act: 'caption', text: 'Anything the AI was unsure about is marked "check"' },
        { with: 3, act: 'caption', text: 'The total is checked for you' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001',
      say: [
        'Before you send an estimate, click Review estimate under the total.',
        'It checks the math, missing prices, odd quantities, your margin, your price book and tax. That is free on every plan.',
        'With Premium plus AI, it also looks for items you may have forgotten, like grout on a tile job.',
        'It looks for missing costs too, like permits and dump fees.',
        'Click Add line on a suggestion, or Ignore. The estimate never changes without your click.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Master bath renovation', patience: 25000 },
        { with: 0, act: 'click', target: 'Review estimate' },
        { with: 2, act: 'highlight', target: 'Add line', nth: 0, patience: 15000 },
        { with: 4, act: 'highlight', target: 'Ignore', nth: 0 },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop', route: '/analytics',
      say: [
        'In Insights, Summarize with AI reads your numbers and writes a short summary of how the business is doing.',
        'It is a Premium plus AI feature. On Free and Premium, you see a short upgrade note in its place.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Summarize with AI', patience: 25000 },
        { with: 1, act: 'caption', text: 'Premium + AI feature' },
      ],
    },
    {
      id: 's10', kind: 'app', device: 'desktop',
      say: [
        'Every plan includes AI: 15 requests a month on Free, 60 on Premium, and 600 on Premium plus AI.',
        'When the month runs out, where offered, you can buy credits: one credit is one request.',
        'AI always needs a connection. Next, let us look at your pipeline and your Insights.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/settings' },
        { with: 0, act: 'highlight', target: 'AI requests this month', delay: 1.5, patience: 15000 },
      ],
    },
  ],
};
