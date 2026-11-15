// Chapter 14: Job photos and daily reports (help guide "photos"; DailyJobReportForm, WorkOrderForm, MaterialLogForm for the three forms).
export default {
  id: 'photos-reports',
  number: 14,
  title: 'Job photos and daily reports',
  summary: 'Add and mark up photos, share them in the portal, make a before/after report, and write daily reports, work orders and material logs.',
  minutes: 3,
  covers: ['photos'],
  demoData: [
    'job "Nair Master Bath" (David & Priya Nair, linked to a saved client) with about 8 photos: Before (3), During (3), After (1), Issue (1), some with captions, 2 already shown in the client portal',
    'the profile on Premium + AI so Write client update and AI walkthrough are unlocked, with canned AI answers: a short client update text, and a drafted Daily Job Report from the day\'s photos',
    'a saved Daily Job Report, a Work Order (assigned to Eli, with a description of work and materials) and a Material Log on that job',
    'crew member Eli, so the Work Order Assigned to field has a name',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about job photos, and the reports that go with them.',
        'Open a job and switch to Photos.',
        'Choose the stage for your new photos: Before, During, After or Issue.',
        'On a phone, tap Take photo or Upload. On a computer, click Add photos.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 14: Photos and reports' },
        { with: 1, act: 'click', target: 'Nair Master Bath' },
        { with: 1, act: 'click', target: 'Photos', role: 'tab' },
        { with: 2, act: 'highlight', target: 'During', unsure: true },
        { with: 3, act: 'highlight', target: 'Add photos' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Tap a photo to set its caption and its stage.',
        'Click Mark up to draw arrows, circles, text or freehand lines. It is saved as a copy, so the original stays as it was.',
        'Switch on Show in client portal to let your client see the photo.',
        'Shared photos only show in the portal when the job is linked to a saved client.',
      ],
      do: [
        { with: 0, act: 'state', note: 'Click the first photo in the grid to open its viewer (caption and stage fields)' },
        { with: 1, act: 'click', target: 'Mark up' },
        { with: 1, act: 'key', key: 'Escape' },
        { with: 2, act: 'highlight', target: 'Show in client portal' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Click Select to pick several photos at once, and show them in the portal, hide them, or delete them.',
        'Before and after report makes a PDF of the job photos. Tag some photos Before or After first.',
        'Free gives you thirty photos per job and 250 megabytes in total. Premium gives you 5 gigabytes, and Premium plus AI gives you 10.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Select' },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'click', target: 'Before/after report' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'With Premium plus AI, click Write client update. It picks the photos added since your last update.',
        'Change the photos if you like, up to eight, add a note or say one, then click Write update.',
        'Edit the text, then send it with Send with Gmail, Text or WhatsApp. The portal link is included.',
        'Each update is saved on the job as a Client update note.',
        'AI walkthrough drafts a Daily Job Report from the day photos and what you say. It only writes what your photos and note show.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Write client update' },
        { with: 1, act: 'click', target: 'Write update' },
        { with: 2, act: 'highlight', target: 'Send with Gmail' },
        { with: 2, act: 'key', key: 'Escape' },
        { with: 4, act: 'click', target: 'AI walkthrough' },
        { with: 4, act: 'state', note: 'Fake AI answers with a drafted Daily Job Report from the day\'s photos' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'The Daily Job Report is your record of the day. Click New Document, then Daily Job Report.',
        'Fill in the date, the weather, how many people were on site, and the total labor hours.',
        'Then write what got done. You can insert headings, like Work completed, Materials, and Delays and issues.',
        'A foreman can sign it too, if you like.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New Document' },
        { with: 0, act: 'click', target: 'Daily Job Report' },
        { with: 1, act: 'type', target: 'Weather', text: 'Sunny' },
        { with: 1, act: 'type', target: 'Crew on site', text: '3' },
        { with: 1, act: 'type', target: 'Labor hours (total)', text: '24' },
        { with: 2, act: 'highlight', target: 'Insert headings', unsure: true },
        { with: 3, act: 'highlight', target: 'Signed by', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'A Work Order tells someone exactly what to do. Fill in who it is Assigned to, the Description of work, and the Materials used.',
        'Add the labor hours and an estimated cost.',
        'In the Tasks section, click Create tasks from this work order, and each line becomes a task on the job.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/dashboard' },
        { with: 0, act: 'click', target: 'Nair Master Bath' },
        { with: 0, act: 'click', target: 'New Document' },
        { with: 0, act: 'click', target: 'Work Order' },
        { with: 0, act: 'highlight', target: 'Description of work' },
        { with: 1, act: 'highlight', target: 'Labor hours' },
        { with: 2, act: 'highlight', target: 'Create tasks from this work order' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'A Material Log records what was delivered or used on site, with its cost.',
        'Add each material as a line, and the log adds up the total materials cost.',
        'Switch on Deduct linked items from inventory, so your stock count stays right.',
        'Next, let us look at your crew, and how they clock in.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/dashboard' },
        { with: 0, act: 'click', target: 'Nair Master Bath' },
        { with: 0, act: 'click', target: 'New Document' },
        { with: 0, act: 'click', target: 'Material Log' },
        { with: 1, act: 'highlight', target: 'Total materials cost' },
        { with: 2, act: 'highlight', target: 'Deduct linked items from inventory' },
      ],
    },
  ],
};
