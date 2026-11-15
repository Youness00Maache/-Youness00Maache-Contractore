// Chapter 8: Sending documents and the client portal (help guides "messages", "sent-email-log", "client-questions-view", "client-selections-view"; "clients" for the portal preview).
export default {
  id: 'send-and-portal',
  number: 8,
  title: 'Sending documents and the client portal',
  summary: 'Send with Gmail, text or a link, see the portal exactly as your client does, and check what you sent.',
  minutes: 4,
  covers: ['messages', 'sent-email-log', 'client-questions-view', 'client-selections-view'],
  demoData: [
    'Gmail shown as connected on the Messages page (a fake sender address like marcus@northline-demo.example), and the fake Gmail send answers success',
    'Sarah Whitfield with INV-2081 and EST-1042 attached on the Messages screen, and her portal link already created',
    'Sarah Whitfield job "Whitfield Kitchen Remodel" with milestone tasks so the portal Project tab shows a progress bar ("5 of 12 steps done"), a highlighted next milestone, an invoice to pay and shared photos',
    'on the same job: one open question ("Which grout color do you prefer?"), one submittal waiting for approval, one selection ("Backsplash tile", 3 options with photos and prices) and one shared ideas board, for the client-phone motion scenes',
    '3 rows in the sent-email log for Sarah (invoice INV-2081 sent, estimate EST-1042 sent, review request), with Sent and one Failed',
    'the job Timeline showing those emails',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about sending a document to your client, and what your client sees when it arrives.',
        'On any document, click Share. It saves the document first, then gives you your options.',
        'Send with Gmail emails the PDF from your own address. Download PDF saves it to your computer.',
        'Copy portal link gives you the link to your client private page. Estimates also get an approval link.',
        'You can also send it by text message or WhatsApp.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 8: Sending and the client portal' },
        { with: 1, act: 'click', target: 'Whitfield Kitchen Remodel' },
        { with: 1, act: 'click', target: 'INV-2081', unsure: true },
        { with: 1, act: 'click', target: 'Share' },
        { with: 2, act: 'highlight', target: 'Send with Gmail' },
        { with: 2, act: 'highlight', target: 'Download PDF' },
        { with: 3, act: 'highlight', target: 'Copy portal link' },
        { with: 4, act: 'highlight', target: 'WhatsApp' },
        { with: 4, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'For a longer message, open Messages. Click Connect Gmail, and approve it in Google.',
        'ContractorDocs only asks for permission to send. It cannot read your inbox.',
        'Click Choose a client, and the To field fills in. Add Cc if someone else should see it.',
        'With a client selected, tick the documents to attach. They go out as PDFs.',
      ],
      do: [
        { with: 0, act: 'goto', route: '/communication' },
        { with: 0, act: 'highlight', target: 'Connect Gmail', unsure: true },
        { with: 1, act: 'state', note: 'Gmail is already connected in the demo account, so only highlight the button or show it before connecting' },
        { with: 2, act: 'click', target: 'Choose a client (optional)' },
        { with: 2, act: 'click', target: 'Sarah Whitfield' },
        { with: 2, act: 'click', target: 'Add Cc' },
        { with: 3, act: 'click', target: 'INV-2081', unsure: true },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Type a subject and a message, or click Use suggested text and let the app write it for you.',
        'The Insert chips add the client name, job name, document number, total and your portal link.',
        'Click Send, and it goes from your own Gmail, so replies land in your inbox.',
        'Email design wraps your message in a branded template, if you want that look.',
        'The Free plan allows ten emails a month. Premium is unlimited.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Use suggested text' },
        { with: 1, act: 'highlight', target: 'Insert' },
        { with: 2, act: 'click', target: 'Send', role: 'button', unsure: true },
        { with: 3, act: 'highlight', target: 'Email design' },
      ],
    },
    {
      id: 's04', kind: 'motion',
      say: [
        'This is what arrives in your client inbox.',
        'It comes from your own Gmail address, with the document attached as a PDF.',
        'The message links to their private portal, where they can view, sign and pay.',
      ],
      visual: 'A phone frame with a mail app inbox. A new message slides in from "Marcus Reed" with a subject line that names the invoice and a small paperclip icon. The email opens: a short friendly message in plain text, a PDF attachment chip named like the invoice, and a link to the client portal. A finger taps the PDF chip and a page preview of the invoice flips up; then the portal link is tapped and the portal home page appears.',
      do: [
        { with: 0, act: 'caption', text: 'What your client receives' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop', route: '/clients',
      say: [
        'You can see the portal exactly as your client does. Open the client, and click What my client sees.',
        'It opens on the Project tab, with the job status, the dates, and a progress bar.',
        'Below that, the milestones appear as a timeline, with the next one highlighted.',
        'It also shows what happens next, like a document to sign or an invoice to pay, plus the balance.',
        'Only milestones are shown. Your other tasks, notes and crew stay private.',
        'All documents still lists everything, but drafts and internal documents, like purchase orders and time sheets, stay hidden.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Sarah Whitfield' },
        { with: 0, act: 'click', target: 'What my client sees' },
        { with: 1, act: 'highlight', target: 'Project' },
        { with: 2, act: 'scroll', by: 300 },
        { with: 5, act: 'click', target: 'All documents' },
        { with: 5, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's06', kind: 'motion',
      say: [
        'When you ask your client a question, a small number appears on their Project tab.',
        'Questions for you is the first thing on the page. They type an answer, and tap Send answer.',
        'For a drawing or sample that needs a yes, they tap Approve or Reject, type their name, and tap Send decision.',
        'You see the answer on the job at once, with their name and the date.',
        'Answered items fold away, until you click Ask again.',
      ],
      visual: 'A phone frame showing the client portal on the Project tab. A small red "2" badge pops on the tab. A card titled "Questions for you" shows a question from the contractor and a text box where an answer types itself, then a "Send answer" button is tapped and the card turns into a calm "Thank you" with the answer shown. A second card for a drawing shows two buttons, Approve and Reject, a name field filling in, and "Send decision". Finished cards fold down into an "Answered" row.',
      do: [
        { with: 1, act: 'caption', text: 'Questions for you' },
      ],
    },
    {
      id: 's07', kind: 'motion',
      say: [
        'Selections work the same way. Under Your selections, the client sees each option with a photo, a price, and what it adds or saves.',
        'They tap one, add a comment, type their name, and tap Send my choice.',
        'They never see your cost, your supplier or your private notes.',
        'Boards you share show under Ideas board, as a gallery of pictures, colors and notes.',
      ],
      visual: 'A phone frame on the client portal. A card titled "Your selections" lists three tile options, each with a photo thumbnail, a name, a total, and a small tag such as "+$120 upgrade", "Included" or "-$40 credit". A finger taps the middle option, a comment is typed, a name is typed, and "Send my choice" is pressed; the card shows "Waiting for approval". Below it, an "Ideas board" gallery scrolls past with photos, colour swatches and short notes.',
      do: [
        { with: 0, act: 'caption', text: 'Your selections' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop', route: '/clients',
      say: [
        'To check what you sent, and when, open a client and click Emails sent.',
        'It lists the last twenty emails: the date, who it went to, the subject, and Sent or Failed.',
        'The message text and the attachments are never kept, and your clients never see this list.',
        'To clear one, click Remove from log, then Remove. Your Gmail Sent folder is not touched.',
        'The same emails also show on the Timeline tab of the job.',
        'Next, let us talk about getting paid.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Sarah Whitfield' },
        { with: 0, act: 'click', target: 'Emails sent' },
        { with: 3, act: 'highlight', target: 'Remove from log' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
  ],
};
