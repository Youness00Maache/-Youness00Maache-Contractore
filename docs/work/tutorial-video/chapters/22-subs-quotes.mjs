// Chapter 22: Subcontractors and comparing quotes. Sources: help guides `subcontractors`, `compare-quotes`, `sub-link`.
export default {
  id: 'subs-quotes',
  number: 22,
  title: 'Subcontractors and comparing quotes',
  summary: 'Mark crew as subcontractors, write and send subcontracts, record payments, and compare quotes side by side.',
  minutes: 3.5,
  covers: ['subcontractors', 'compare-quotes', 'sub-link'],
  demoData: [
    'Crew enabled with 2 workers (Jamal, Eli) and 2 subcontractors: "Ramirez Electric" (company Ramirez Electric LLC, trade Electrical) and "Cole Plumbing" (trade Plumbing); each has a crew link',
    'job "Nair Master Bath" with one subcontract for Ramirez Electric: scope "Electrical rough-in and fixtures", amount 4,800 dollars, retainage 10 percent, status Sent (Waiting for the sub to accept), plus one already Accepted subcontract for Cole Plumbing with one payment recorded',
    'the Nair Master Bath job has 3 quotes for the scope "Electrical rough-in": Ramirez Electric 4,800 (lead time 5 days, price holds 30 days, includes materials, excludes permit), Bright Wire Co 4,350 (no inclusions listed, lead time 12 days) and Volt and Sons 4,100 (price expired last week), each with a different mix of fields so the flags (Lowest price, Best value, Fastest, Quote expired) and the Check row show',
    'a phone-sized view of the sub link is a motion scene: no data needed beyond the subcontract above',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about subcontractors: people you hire for a piece of a job, and how to compare their prices.',
        'Open Tools, then Crew. Click Edit on a person, or Add crew member, and set Type to Subcontractor.',
        'Add their company and trade if you like. The Crew list then shows All, Workers and Subs.',
      ],
      do: [
        { with: 1, act: 'click', target: 'Tools' },
        { with: 1, act: 'click', target: 'Crew', role: 'menuitem' },
        { with: 1, act: 'click', target: 'Add crew member' },
        { with: 1, act: 'select', target: 'Type', option: 'Subcontractor', unsure: true },
        { with: 2, act: 'key', key: 'Escape' },
        { with: 2, act: 'highlight', target: 'Subs' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'To work with a sub on a job, open the job and switch to Subs.',
        'Stay on Subcontracts. The line under the heading adds up what is committed, paid and still to pay.',
        'It also shows how many subcontracts wait for the sub to accept, and how many are overdue.',
      ],
      do: [
        { with: 0, act: 'click', target: 'View Project', nth: 1 },
        { with: 0, act: 'click', target: 'Subs', role: 'tab' },
        { with: 1, act: 'click', target: 'Subcontracts' },
        { with: 2, act: 'highlight', target: 'committed', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Tap New subcontract, and pick the subcontractor from your crew, or choose Someone else and type a name.',
        'Add the scope of work, which is what the sub reads on their link, and the agreed amount.',
        'Retainage is a percentage you hold back until the work is complete. Add a start date and a due date, too.',
        'Private notes are only for you. Save draft keeps it to yourself, and Save and send to sub sends it.',
      ],
      do: [
        { with: 0, act: 'click', target: 'New subcontract' },
        { with: 0, act: 'select', target: 'Subcontractor', option: 'Ramirez Electric', unsure: true },
        { with: 1, act: 'type', target: 'Scope of work', text: 'Electrical rough-in and fixtures for the master bath.', unsure: true },
        { with: 1, act: 'type', target: 'Amount', text: '4800', unsure: true },
        { with: 2, act: 'type', target: 'Retainage', text: '10', unsure: true },
        { with: 3, act: 'highlight', target: 'Save and send to sub' },
        { with: 3, act: 'click', target: 'Save and send to sub' },
      ],
    },
    {
      id: 's04', kind: 'motion',
      say: [
        'The sub opens their private link on a phone. No app, no login.',
        'Above My tasks, they see My subcontract: your scope, the job address with Directions, the price, what is paid, and the retainage held.',
        'They type their full name and tap Accept this work.',
        'You see Accepted, with their name and the date, on the job right away.',
        'They never see your private notes, other quotes, other subs, or what you pay your crew.',
        'The page follows the phone’s language, English or Spanish, and the link works while you are on Premium.',
      ],
      visual: 'A phone frame slides in showing the crew page of a subcontractor ("Ramirez Electric"). Above a "My tasks" list sits a card "My subcontract": Nair Master Bath with the address and a Directions button, scope text, "Agreed price", "Paid so far", "Retainage held", start and due dates and a thin progress bar. A name field types "Luis Ramirez", the green button "Accept this work" is tapped, and the card turns to "Accepted". Then the view cuts to the desktop job page where the row reads "Accepted by Luis Ramirez" with the date. A small padlock badge sits over the card with the label "Your notes and other quotes stay private".',
      do: [{ with: 0, act: 'caption', text: 'What your subcontractor sees' }],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'If you change the scope, amount, retainage or dates after they accepted, it goes back to Sent and they accept again.',
        'Use Mark in progress, then Mark completed when the work is done.',
        'Cancel stops a subcontract, and payments already recorded stay.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Edit', nth: 0, unsure: true },
        { with: 0, act: 'key', key: 'Escape' },
        { with: 1, act: 'highlight', target: 'Mark in progress', unsure: true },
        { with: 2, act: 'highlight', target: 'Cancel', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'Open a subcontract and tap Record a payment. Type the date, the amount, and a note like the check number.',
        'It shows what is paid, what is still to pay, and the percentage paid.',
        'Payments are never edited or deleted. To fix a mistake, record a correction as a negative amount, like minus 250.',
        'In Job financials, a Subcontracts, committed line appears. Do not log the same payment as an expense too, or it counts twice.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Record a payment' },
        { with: 0, act: 'type', target: 'Amount', text: '1200', unsure: true },
        { with: 0, act: 'type', target: 'Note', text: 'Check 1043', unsure: true },
        { with: 2, act: 'highlight', target: 'Record a payment' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Now quotes. On the job, open Subs, then Quotes, and tap Add a quote.',
        'Type the scope, like Electrical rough-in, who the quote is from, and the amount.',
        'Add what is included and not included, the lead time in days, and how long the price holds.',
        'Attach the PDF or a photo of the quote if you have it. Quotes with the same scope are compared together.',
        'So use exactly the same words for the scope on every quote.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Quotes' },
        { with: 0, act: 'click', target: 'Add a quote' },
        { with: 1, act: 'type', target: 'Scope', text: 'Electrical rough-in', unsure: true },
        { with: 1, act: 'type', target: 'Amount', text: '4350', unsure: true },
        { with: 2, act: 'highlight', target: 'Lead time', unsure: true },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'Each scope lists its quotes cheapest first, with plain flags: Lowest price, Within 10% of the lowest, Best value, Fastest, and Quote expired.',
        'Best value is only a suggestion.',
        'Tap Compare to see the quotes side by side, one column each.',
        'The best answer in each row is green, and gaps are amber.',
        'A Check row lists what is missing, such as No inclusions listed.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Lowest price', unsure: true },
        { with: 1, act: 'highlight', target: 'Best value', unsure: true },
        { with: 2, act: 'click', target: 'Compare' },
        { with: 4, act: 'highlight', target: 'No inclusions listed', unsure: true },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'Click Shortlist on the ones still in the running, and Reject the rest.',
        'Then click Choose this quote. It shows the draft subcontract it would make, before anything is saved.',
        'Click Choose and draft the subcontract. Nothing goes to the sub until you press Send to sub.',
        'Only mark it chosen is for a quote you will not turn into a subcontract, like a supplier’s material price.',
        'Subcontractors and quote comparison are part of Premium. Next, selections, mood boards and files.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Shortlist', nth: 0 },
        { with: 0, act: 'click', target: 'Reject', nth: 0 },
        { with: 1, act: 'click', target: 'Choose this quote', nth: 0 },
        { with: 2, act: 'highlight', target: 'Choose and draft the subcontract' },
        { with: 3, act: 'highlight', target: 'Only mark it chosen' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
