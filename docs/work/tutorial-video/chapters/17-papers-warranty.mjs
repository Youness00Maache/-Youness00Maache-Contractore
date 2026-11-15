// Chapter 17: Papers, lien waivers and warranty. Sources: help guides `papers`, `warranty-tracking`, `after-job-emails`.
export default {
  id: 'papers-warranty',
  number: 17,
  title: 'Papers, lien waivers and warranty',
  summary: 'Keep insurance and licenses with expiry reminders, make lien waivers, track warranties and claims, and send after-job emails.',
  minutes: 3.5,
  covers: ['papers', 'warranty-tracking', 'after-job-emails'],
  demoData: [
    'Papers vault with 4 papers: a COI expiring in about 25 days (shown in portal), a contractor License valid for a year, a Permit linked to "Nair Master Bath" with a next inspection date, a W-9 with no expiry; one paper already expired (red)',
    'job "Okafor Basement Finish" (completed) with a paid invoice INV-2064 (used by the lien waiver) and NO warranty yet (the scene creates one)',
    'a second, already saved Warranty on another completed job with one open claim, so the Warranties list shows an "open claims" badge',
    'Gmail shown as Connected in Settings; the three after-job emails (Thank-you after the job, Warranty ending, Maintenance reminders) currently off',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about the paperwork that protects you: your insurance and licenses, lien waivers, and warranties.',
        'Open Tools, then Papers. On a phone, it is under More.',
        'This Premium vault keeps your certificate of insurance, licenses, permits, bonds and W-9.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools' },
        { with: 1, act: 'click', target: 'Papers', role: 'menuitem' },
        { with: 2, act: 'hover', target: 'COI', unsure: true },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click Add paper and pick the kind: COI, License, Permit, Bond, W-9 or Other.',
        'Type the number, who issued it, and the dates.',
        'Then click Upload PDF or photo and Save, so the file is always one tap away.',
        'A permit can be linked to its job, with the next inspection date. It then shows on the job page.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Add paper' },
        { with: 0, act: 'select', target: 'Kind', option: 'Permit', unsure: true },
        { with: 1, act: 'type', target: 'Number', text: 'BP-2026-0418', unsure: true },
        { with: 2, act: 'highlight', target: 'Upload PDF or photo' },
        { with: 2, act: 'click', target: 'Save', role: 'button' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Each paper reminds you 30, 7 and 1 days before it expires. Tap the chips to change those days.',
        'You get the reminder in the bell, and by email to yourself from your Gmail.',
        'Papers that expire first sit at the top, and turn red once expired.',
        'When you renew, open the three-dot menu and choose Renew, new date and file. The reminders start again from the new date.',
      ],
      do: [
        { with: 0, act: 'highlight', target: '30', label: 'Reminder days', unsure: true },
        { with: 2, act: 'zoom', target: 'COI', scale: 1.15, unsure: true },
        { with: 3, act: 'zoom', out: true },
        { with: 3, act: 'click', target: 'More actions', nth: 0, unsure: true },
        { with: 3, act: 'highlight', target: 'Renew (new date and file)' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Need to hand a certificate to a client or a general contractor? Click Send.',
        'Type their email, check the message, and click Send with Gmail. The file is attached for you.',
        'On a COI, license or bond, switch on Show in client portal. Your client then sees Licensed and insured, with the name, number and expiry date, never the file.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Send', nth: 0 },
        { with: 1, act: 'highlight', target: 'Send with Gmail' },
        { with: 1, act: 'key', key: 'Escape' },
        { with: 2, act: 'highlight', target: 'Show in client portal', unsure: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'A lien waiver tells a client or a bank that you have been paid. Click Lien waiver here, or on a job page.',
        'Pick Conditional or Unconditional, and Progress or Final.',
        'The invoice and the payment you recorded with Mark as paid fill in the amount and the dates.',
        'Check the names and the address, then click Create waiver.',
        'It is saved on the job as a document you can print, email or share.',
        'Lien waivers work on every plan. Some states, like California, Texas, Florida and Georgia, require their own official form, so use that one there.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Lien waiver' },
        { with: 1, act: 'highlight', target: 'Conditional', unsure: true },
        { with: 2, act: 'highlight', target: 'INV-2064', unsure: true },
        { with: 3, act: 'click', target: 'Create waiver' },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Now warranties. Open a finished job, like the Okafor Basement Finish, click New Document, and choose Warranty.',
        'In Coverage period, pick when it starts. Left empty, it starts the day the work was completed.',
        'Then choose A length, like 2 years, Until a date, or Lifetime.',
        'The line at the top says it plainly, for example Active, ends in March 2028, four months left.',
        'Click Save, like any other document. It works offline too.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project', nth: 4, unsure: true },
        { with: 0, act: 'click', target: 'New Document' },
        { with: 0, act: 'click', target: 'Warranty' },
        { with: 1, act: 'highlight', target: 'Coverage period' },
        { with: 2, act: 'click', target: 'A length' },
        { with: 3, act: 'zoom', target: 'Coverage period', scale: 1.2 },
        { with: 4, act: 'zoom', out: true },
        { with: 4, act: 'click', target: 'Save', role: 'button' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'When your client reports a problem, click Add claim in Claims. Add the date, what is wrong, and up to six photos.',
        'Move it along with Start review, Mark resolved, or Deny claim. A denial needs a reason.',
        'Claims are for your records. Your client does not see them.',
        'On the job page, the Warranties list shows ending soon, active, ended and void ones, with the time left.',
        'If a warranty no longer applies, click Void this warranty. The claims history stays, and Restore warranty brings it back.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Add claim' },
        { with: 1, act: 'highlight', target: 'Start review', unsure: true },
        { with: 3, act: 'highlight', target: 'Warranties', unsure: true },
        { with: 4, act: 'highlight', target: 'Void this warranty', unsure: true },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop', route: '/settings#automations',
      say: [
        'Three emails can go out from your own Gmail after a job. Open Settings, then Automations, and look under Jobs.',
        'Thank-you after the job goes out 3 days after you mark a job completed, with your Google review link.',
        'Warranty ending tells your client 60, 30 and 7 days before the end, and on the day. You get a note too.',
        'Maintenance reminders go out 180 and 365 days after completion, with your short tip.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Thank-you after the job' },
        { with: 1, act: 'highlight', target: 'Thank-you after the job' },
        { with: 2, act: 'highlight', target: 'Warranty ending' },
        { with: 3, act: 'highlight', target: 'Maintenance reminders' },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'They are off until you switch them on, and they are part of Premium.',
        'Switching one on starts with your next completed job, so nothing old goes out by surprise.',
        'Open Days, wording and what is next to change the days and the message.',
        'Connect Gmail first, or nothing is sent. Next, let us look at service plans for repeat visits.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Thank-you after the job', role: 'switch', unsure: true },
        { with: 2, act: 'click', target: 'Days, wording and what is next', nth: 0 },
        { with: 2, act: 'highlight', target: 'Next scheduled', unsure: true },
      ],
    },
  ],
};
