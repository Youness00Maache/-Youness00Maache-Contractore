// Chapter 29: Community and getting help. Sources: components/ForumView.tsx (tabs, New post), components/help/HelpCenter.tsx (/tutorials),
// components/help/HelpButton.tsx ("How it works"), components/AppNav.tsx (Contact support). No help guide of its own.
export default {
  id: 'community-help',
  number: 29,
  title: 'Community and getting help',
  summary: 'Ask other contractors in the Community, search the Help center, use the How it works buttons, and reach support.',
  minutes: 2,
  covers: [],
  demoData: [
    'Community with a handful of posts: 2 in General (questions and tips, one with 3 comments), 2 in Suggestion (ideas with votes), 1 in Project Showcase (with a photo); one post written by Marcus Reed so My Posts is not empty',
    'a Community reply or like in the bell so the Community badge shows a number',
    'Help & tutorials page with all guides listed (comes from the app, no data needed)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about getting help: the Community, the Help center, and your own support.',
        'Click Community in the top bar. On a phone, it is in the bottom bar.',
        'It has tabs: General for questions, tips and news from the trade, and Suggestion for ideas.',
        'Vote for the features you want most. Project Showcase is for photos of your latest work.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Community' },
        { with: 2, act: 'click', target: 'General' },
        { with: 2, act: 'click', target: 'Suggestion' },
        { with: 3, act: 'click', target: 'Project Showcase' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click New post, pick a category, and write your title and message.',
        'You can add a picture or a video link.',
        'Open a post to read the comments and add your own. My Posts lists everything you posted.',
        'Replies, likes and comments show up in your bell, and as a number on Community.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New post' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 2, act: 'click', target: 'My Posts' },
        { with: 3, act: 'highlight', target: 'Community', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop', route: '/tutorials',
      say: [
        'For how-to answers, open your account menu and choose Help and tutorials.',
        'Every feature has a step-by-step guide here, grouped by topic. Type a word in the search box, like invoice, portal or reminders.',
        'Each guide has an Open button that takes you straight to that screen.',
        'Click Take the 1-minute tour to replay the app tour whenever you like.',
      ],
      do: [
        { with: 1, act: 'type', target: 'Search the guides', text: 'reminders', unsure: true },
        { with: 2, act: 'highlight', target: 'Open', nth: 0 },
        { with: 3, act: 'highlight', target: 'Take the 1-minute tour' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'On most screens you also find a How it works button at the top.',
        'It opens the guide for that very screen, and on a phone it is a small question mark.',
        'Not sure where something is? Ask AI Command on the dashboard in plain words. It knows these guides.',
      ],
      do: [
        { with: 0, act: 'click', target: 'How it works', unsure: true },
        { with: 1, act: 'key', key: 'Escape' },
        { with: 2, act: 'highlight', target: 'AI Command' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Still stuck? Open the account menu and click Contact support.',
        'You can also email the address at the bottom of the Help page, and a real person will answer.',
        'Premium plus AI includes priority support.',
        'You are almost done. The last chapter covers your plan and your account.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Account menu' },
        { with: 0, act: 'highlight', target: 'Contact support' },
        { with: 0, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
