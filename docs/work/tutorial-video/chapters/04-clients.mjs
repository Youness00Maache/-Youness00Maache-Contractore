// Chapter 4: Clients (help guide "clients": list, notes, temporary clients, portal link basics; the portal as the client sees it is chapter 8).
export default {
  id: 'clients',
  number: 4,
  title: 'Clients',
  summary: 'Save clients once, keep private notes, find anyone fast, and share their private portal link.',
  minutes: 2.5,
  covers: ['clients'],
  demoData: [
    'the 5 saved clients (Sarah Whitfield, David & Priya Nair, Tom Alvarez, Linda Okafor, Greg Halvorsen)',
    'Sarah Whitfield has notes, a job with an estimate and an unpaid invoice (INV-2081), and a portal link already created',
    'one more client already marked temporary (a walk-in) so the Temporary list is not empty',
    'the new client "Maria Delgado" is created live in scene s02 (remove her afterwards or reset the fake backend)',
    'a signed estimate (EST-1042) so the Activity list has an entry',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/clients',
      say: [
        'This chapter is about your clients: saving them once, and finding them again in seconds.',
        'Click Clients at the top to see everyone you work for.',
        'Type a name, an email or a phone number in the search box to find a client fast.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 4: Clients' },
        { with: 2, act: 'type', target: 'Search name, email or phone', text: 'Whitfield' },
        { with: 2, act: 'state', note: 'Clear the client search box before the next scene' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'To save a new client, click Add client.',
        'Only the name is required. Add an email, phone and address if you have them, so you can contact them later.',
        'Use Notes for things like a gate code or the best time to call.',
        'Tick Mark as temporary client for a one-off customer. If they come back, click Convert to regular later.',
        'Then click Add client to save.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Add client', role: 'button', nth: 0 },
        { with: 1, act: 'type', target: 'Name', text: 'Maria Delgado' },
        { with: 1, act: 'type', target: 'Email', text: 'maria.delgado@example.com' },
        { with: 1, act: 'type', target: 'Phone', text: '(555) 010-3106' },
        { with: 2, act: 'type', target: 'Notes', text: 'Gate code 4417. Call after 4 pm.' },
        { with: 3, act: 'highlight', target: 'Mark as temporary client' },
        { with: 4, act: 'click', target: 'Add client', role: 'button', nth: 1 },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Click a client to open their page.',
        'At the top you see their open jobs and documents, what you invoiced, and what is still outstanding.',
        'The notes are right here. Click Edit, change them, then click Save notes.',
        'Notes are private. They are never shown to the client.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Sarah Whitfield' },
        { with: 1, act: 'highlight', target: 'Outstanding' },
        { with: 2, act: 'click', target: 'Edit', role: 'button', unsure: true },
        { with: 2, act: 'type', target: 'Client notes', text: 'Prefers text messages. Dog at the house. Side gate is open.' },
        { with: 2, act: 'click', target: 'Save notes' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Every client also gets a private portal, a web page where they see their documents, sign and pay.',
        'In the Client portal box, use Copy, Email, Text or WhatsApp to send them the link.',
        'Sent it to the wrong person? Click New link, and the old one stops working at once.',
        'Click Get approval to list every estimate and change order waiting for a signature, with a link for each.',
        'What the client sees on that page has its own chapter, later in this video.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Client portal' },
        { with: 1, act: 'highlight', target: 'Copy', role: 'button' },
        { with: 2, act: 'highlight', target: 'New link' },
        { with: 3, act: 'click', target: 'Get approval' },
        { with: 3, act: 'highlight', target: 'Copy link', unsure: true },
        { with: 4, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop', route: '/clients',
      say: [
        'Moving over from another app? Import and export reads and writes a CSV file, so you can bring your list along.',
        'One-off customers live under Temporary, so they stay out of your main list.',
        'On a client page, Activity lists the estimates and change orders they signed or declined.',
        'On the Free plan you can add fifteen new clients a month. Premium has no limit.',
        'Next, we will create your documents.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Import / export' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'click', target: 'Temporary', unsure: true },
        { with: 1, act: 'key', key: 'Escape' },
        { with: 2, act: 'click', target: 'Sarah Whitfield' },
        { with: 2, act: 'highlight', target: 'Activity', unsure: true },
      ],
    },
  ],
};
