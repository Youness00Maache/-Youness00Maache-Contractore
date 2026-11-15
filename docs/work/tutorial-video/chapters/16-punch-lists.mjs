// Chapter 16: Punch lists. Source: help guide `punch-list`.
export default {
  id: 'punch-lists',
  number: 16,
  title: 'Punch lists',
  summary: 'Capture the small things left to fix, check them off with proof, and let the client approve them in the portal.',
  minutes: 2,
  covers: ['punch-list'],
  demoData: [
    'job "Nair Master Bath" with a Punch list of about 8 items in two rooms (Bathroom, Hallway): 3 already done, one done but not yet verified, one with a before and after photo',
    'crew member "Eli" so that "@Eli" is understood as an assignee',
    '"Show in client portal" switched OFF at the start of the chapter',
    'for the client-phone animation only: nothing in the data, it is a motion scene',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about punch lists, the short list of small things left to fix before a job is truly finished.',
        'Open a job, here the Nair Master Bath, by clicking View Project.',
        'Then switch to the Punch list tab. The number next to it shows how many items are done.',
      ],
      do: [
        { with: 1, act: 'click', target: 'View Project', nth: 1 },
        { with: 2, act: 'click', target: 'Punch list', role: 'tab' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Walk through the job with your phone and type one item per line.',
        'Start with the room, for example Bathroom: touch up paint. The room sticks for the next items, so you type less.',
        'End a line with an at sign and a name to hand it to someone, like at Eli.',
        'Press Enter or click Add item. You capture the problem right where you are standing.',
      ],
      do: [
        { with: 1, act: 'type', target: 'New punch list item', text: 'Bathroom: touch up paint at window trim' },
        { with: 1, act: 'click', target: 'Add item' },
        { with: 2, act: 'type', target: 'New punch list item', text: 'Caulk tub @Eli' },
        { with: 3, act: 'click', target: 'Add item' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Tap the ring in front of an item to mark it done. Tap again to undo.',
        'After you have checked the work yourself, open the three-dot menu and choose Mark verified.',
        'The same menu has Edit, where you can add a due date, notes, and a before and after photo.',
        'Those photos are added to the job photos too, so they count toward your photo storage.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Mark “touch up paint at window trim” done', unsure: true },
        { with: 1, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 1, act: 'highlight', target: 'Mark verified' },
        { with: 2, act: 'highlight', target: 'Edit' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Want your client to sign off? Switch on Show in client portal.',
        'Now they can follow the progress on their own, without calling you to ask what is left.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Show in client portal' },
        { with: 1, act: 'highlight', target: 'Show in client portal', label: 'Client sees the progress' },
      ],
    },
    {
      id: 's05', kind: 'motion',
      say: [
        'On their phone, the client sees the list. On each finished item they tap Looks good or Needs work.',
        'If they tap Needs work, they add a note, the item opens again, and the bell tells you right away.',
      ],
      visual: 'A phone frame slides in showing the client portal page "Punch list" for the Nair Master Bath, a progress bar "5 of 8 done" filling up. One finished item, "Caulk tub", has two buttons: a green "Looks good" and an amber "Needs work". A finger taps "Needs work", a small note box types "Gap left at the wall". Then the screen cuts to a desktop corner where the app bell gets a red dot and the same item flips from Done back to Open with the client note under it.',
      do: [{ with: 0, act: 'caption', text: 'What your client sees' }],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'At the top, the three-dot menu has Download PDF, with the photos, which is perfect for the final walkthrough.',
        'Or choose Save as Note on the job, to email or share it later.',
        'Adding and checking off items works offline and syncs later. Photos, deleting and sharing need a connection.',
        'Punch lists are on every plan. Next, let us look at your papers, insurance and warranties.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 0, act: 'highlight', target: 'Download PDF' },
        { with: 1, act: 'highlight', target: 'Save as Note on the job' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
