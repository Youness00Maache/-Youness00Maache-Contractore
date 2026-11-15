// Chapter 23: Selections, mood boards, files and client questions. Sources: help guides `job-selections`, `job-boards`, `job-files`, `job-questions`.
// (What the client sees on their link is covered in chapter 8; here it is one short motion scene.)
export default {
  id: 'selections-files',
  number: 23,
  title: 'Selections, mood boards, files and client questions',
  summary: 'Let your client choose tile and paint, share mood boards, keep versioned job files, and ask questions or submittals.',
  minutes: 4,
  covers: ['job-selections', 'job-boards', 'job-files', 'job-questions'],
  demoData: [
    'job "Nair Master Bath" with the saved client David & Priya Nair (portal link works)',
    'one Selection already Chosen by the client ("Shower floor tile", 3 options with photos, prices and a 600 dollar allowance, chosen option 40 dollars over the allowance) so Approve and Create purchase order can be shown',
    'one draft Selection "Vanity paint colour" with 2 options (photo, price, your cost, SKU, supplier) for the New / Send scene',
    'one Mood board "Bathroom ideas" with 5 items (2 images, a link, a colour, a note), private at the start, plus a private board note',
    'Files tab with about 6 files across categories (Plans, Permits, Contracts, Specs, Receipts) including a floor plan PDF with a v2, tags and one image shown in the client portal',
    'Questions tab with 2 items: one question "Which grout colour?" waiting for the client and one answered submittal "Vanity product data sheet" (Approved by David Nair); a Which tile template is available',
    'saved supplier "Harbor Tile and Stone" (used by the purchase order draft)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about the choices and paperwork that go back and forth with your client: selections, mood boards, files and questions.',
        'They are all tabs on the job page, so open the Nair Master Bath.',
        'These tools are part of Premium, and they need a connection.',
        'The job needs a client, because the client opens them from their project link.',
      ],
      do: [
        { with: 1, act: 'click', target: 'View Project', nth: 1 },
        { with: 1, act: 'highlight', target: 'Selections', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Boards', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Files', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Questions', role: 'tab' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Switch to Selections and tap New. Start from a ready-made one, like Tile, or from blank.',
        'Add a title, the room, a message, a date to choose by, and the allowance your contract includes.',
        'Then add one to six options, each with a photo, a name, a description, the quantity and the price.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Selections', role: 'tab' },
        { with: 0, act: 'click', target: 'New' },
        { with: 0, act: 'click', target: 'Tile', unsure: true },
        { with: 1, act: 'type', target: 'Title', text: 'Shower wall tile', unsure: true },
        { with: 2, act: 'scroll', by: 300 },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Each option also has Your cost, a SKU and a supplier. Only you see those, never your client.',
        'As you type, the option shows its upgrade or credit against the allowance.',
        'Above the allowance is an upgrade the client pays. Below it is a credit.',
        'Click Send to client, or Save draft to keep it to yourself.',
        'Use Copy client link on the Selections tab to give your client the link.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Your cost (each)' },
        { with: 2, act: 'highlight', target: 'upgrade', unsure: true },
        { with: 3, act: 'highlight', target: 'Send to client' },
        { with: 3, act: 'click', target: 'Save draft' },
        { with: 4, act: 'highlight', target: 'Copy client link' },
      ],
    },
    {
      id: 's04', kind: 'motion',
      say: [
        'On their phone, your client sees each option with its photo, the price, and what it adds or saves.',
        'They tap one, add a comment, type their name, and tap Send my choice.',
      ],
      visual: 'A phone frame slides in showing the client project page with a "Your selections" card: "Shower wall tile", three option cards with photos (white subway, grey stone, blue zellige), each with a price and a tag "+$120 upgrade", "Included" or "-$40 credit". A finger taps the grey stone option, a comment types "Love this one", a name field types "David Nair", then the button "Send my choice" is tapped and the card turns to "Waiting for approval". A small lock label reads "Your cost and supplier stay hidden".',
      do: [{ with: 0, act: 'caption', text: 'What your client sees' }],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'When the client chooses, the row says Chosen, with the option, the price and their comment.',
        'Tap it, then click Approve to confirm. Ask for changes sends it back to you, and Ask again lets the client choose again.',
        'On an approved selection, click Create purchase order. You see the draft order first, with the supplier and one line at your cost.',
        'Confirm, and the selection becomes Ordered. An upgrade changes what your client pays, so add a change order for the difference.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Shower floor tile', unsure: true },
        { with: 1, act: 'click', target: 'Approve' },
        { with: 1, act: 'highlight', target: 'Ask for changes', unsure: true },
        { with: 2, act: 'click', target: 'Create purchase order' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Switch to Boards and tap New board, like Kitchen ideas. A new board is private.',
        'Add an image, a link, a note or a colour. A board holds up to 60 items.',
        'Tap Client preview to see it exactly as your client will. Then switch on Share with client.',
        'Your private notes never show. Save your changes first, because sharing only changes when nothing is waiting to be saved.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Boards', role: 'tab' },
        { with: 0, act: 'click', target: 'New board' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'click', target: 'Bathroom ideas', unsure: true },
        { with: 2, act: 'click', target: 'Client preview' },
        { with: 2, act: 'key', key: 'Escape' },
        { with: 2, act: 'highlight', target: 'Share with client' },
        { with: 3, act: 'highlight', target: 'Your notes (private)', unsure: true },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Switch to Files. They are listed by category: Plans, Permits, Contracts, Specs, Receipts, Visuals and renders, and Other.',
        'Click Add file for PDFs and images up to 15 megabytes, or Take photo to use the camera.',
        'For anything bigger, a folder or a 3D walkthrough, use Add link.',
        'Give each file a name, a category, tags and a note only you see.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Files', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Add file' },
        { with: 1, act: 'highlight', target: 'Take photo' },
        { with: 2, act: 'highlight', target: 'Add link' },
        { with: 3, act: 'click', target: 'Add file' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'When the drawing changes, open the three-dot menu and choose Upload new version.',
        'The newest shows as v2, v3, and the earlier ones fold under Older versions.',
        'Switch on Show in client portal to let your client see a file. Images and links can be shown.',
        'A PDF cannot be shown yet, so add a link to it, from Google Drive or Dropbox, and show the link.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 0, act: 'highlight', target: 'Upload new version' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'highlight', target: 'Older versions', unsure: true },
        { with: 2, act: 'highlight', target: 'Show in client portal', unsure: true },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'Switch to Questions and tap New. Start from a ready-made one, like Which tile, or Submittal: product data sheet.',
        'A Question is answered in words. A Submittal is approved or rejected, and the client needs a note to reject.',
        'Add a message, a date to answer by, and attach files or links with Attach from this job.',
        'Click Send to client. When they answer, the row says Answered, Approved or Rejected, with their name, the date and their words.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Questions', role: 'tab' },
        { with: 0, act: 'click', target: 'New' },
        { with: 0, act: 'click', target: 'Which tile?', unsure: true },
        { with: 1, act: 'highlight', target: 'Submittal' },
        { with: 2, act: 'highlight', target: 'Attach from this job' },
        { with: 3, act: 'highlight', target: 'Send to client' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's10', kind: 'app', device: 'desktop',
      say: [
        'Ask again sends it back, and Close it ends it. Nothing is deleted by a close.',
        'Next, let us measure quantities straight from your plans.',
      ],
      do: [
        { with: 0, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 0, act: 'highlight', target: 'Ask again' },
        { with: 0, act: 'highlight', target: 'Close it' },
        { with: 0, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
