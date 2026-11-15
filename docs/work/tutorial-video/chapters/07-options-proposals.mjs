// Chapter 7: Good / better / best, proposals and the estimate check (help guides "estimate-options", "proposals", "estimate-review").
export default {
  id: 'options-proposals',
  number: 7,
  title: 'Good / better / best, proposals and the estimate check',
  summary: 'Offer your client choices, build a full proposal with add-ons, scope, payment schedule and photos, and review the estimate before you send it.',
  minutes: 4,
  covers: ['estimate-options', 'proposals', 'estimate-review'],
  demoData: [
    'job "Nair Master Bath" with the Sent estimate EST-1043 "Master bath renovation" (4 lines), editable (not signed)',
    'on that estimate: one line left without a price and one line priced below its cost, so the Review estimate checks show real warnings',
    'a second estimate on the same job where the client already chose "Better" (good / better / best on, chosen option set) so Apply chosen option is visible',
    '3 job photos on Nair Master Bath (Before/During) for the proposal Photos tab "From job photos"',
    'one saved proposal template so Use a template has an entry',
    'the profile on Premium + AI so the AI check rows (missing items like grout, dump fee) show up in the review',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about giving your client choices, building a full proposal, and checking an estimate before you send it.',
        'Open an estimate and click Good, better, best, next to Items.',
        'Good, Better and Best start with your current lines, and Better is marked Recommended.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 7: Options and proposals' },
        { with: 1, act: 'click', target: 'Nair Master Bath' },
        { with: 1, act: 'click', target: 'Master bath renovation', unsure: true },
        { with: 1, act: 'click', target: 'Good / better / best' },
        { with: 2, act: 'highlight', target: 'Recommended' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Click an option to rename it, add a short description, and change its lines.',
        'Start from copies the lines of another option, and Add option gives you up to four.',
        'Lines your client gets either way go under In every option.',
        'Discount and tax apply to every option.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Better' },
        { with: 1, act: 'highlight', target: 'Start from', unsure: true },
        { with: 1, act: 'highlight', target: 'Add option' },
        { with: 2, act: 'highlight', target: 'In every option' },
      ],
    },
    {
      id: 's03', kind: 'motion',
      say: [
        'Your PDF lists every option with its lines and total, and marks the recommended one.',
        'On the approval link, your client taps the option they want, then signs with Approve and sign.',
      ],
      visual: 'A phone frame over the dark app background. The approval page shows three stacked option cards named Good, Better and Best, each with a short line list and a total that rises from card to card; the Better card wears a small "Recommended" badge. A finger taps the Better card and it gets a thick highlighted border with a check mark. The page then scrolls to the signature pad and a big "Approve & sign" button is pressed.',
      do: [
        { with: 0, act: 'caption', text: 'What your client sees' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'Back on your estimate, it now shows which option the client chose.',
        'Click Apply chosen option, and the estimate becomes that option, with one total, ready for Convert to invoice.',
        'If the client told you by phone, pick it under Client told you.',
        'Until they choose, your invoices, job budget and pipeline use the recommended option.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Nair Master Bath' },
        { with: 0, act: 'state', note: 'Open the estimate on this job where the client has already chosen the Better option' },
        { with: 1, act: 'click', target: 'Apply chosen option' },
        { with: 2, act: 'highlight', target: 'Client told you?', unsure: true },
        { with: 3, act: 'highlight', target: 'Use one total instead', unsure: true },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Now, proposals. Under Items, open Optional add-ons, and click Add an add-on, for extras like a heated floor.',
        'An add-on prints with its price and an Optional tag, but it is not in the subtotal, tax or total.',
        'On the approval link, your client ticks Add to my estimate next to each add-on they want, and the total updates as they tick.',
        'If you add one yourself, tick In the total. Make it a regular line moves it back into the list.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Optional add-ons' },
        { with: 0, act: 'click', target: 'Add an add-on' },
        { with: 1, act: 'highlight', target: 'Optional' },
        { with: 3, act: 'highlight', target: 'In the total', unsure: true },
        { with: 3, act: 'highlight', target: 'Make it a regular line', unsure: true },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop',
      say: [
        'In the Proposal section, the Scope tab holds your Scope of work, Inclusions, Exclusions, Assumptions and Timeline.',
        'Type one item per line for a neat list, or switch Print as to Paragraphs.',
        'The arrows change the order they print in.',
        'A clear scope helps you and your client agree on what is, and is not, included.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Proposal' },
        { with: 0, act: 'click', target: 'Scope', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Print as' },
        { with: 2, act: 'highlight', target: 'Scope of work' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'On the Payments tab, pick 50 and 50, 30, 40 and 30, or 10, 40, 40 and 10, for a ready-made payment schedule.',
        'Or click Add payment, and set each one as a percent of the total, or a fixed amount.',
        'The payments must add up to the total.',
        'On the Photos tab, click Upload photo or From job photos. You can add up to eight, each with a caption.',
        'They print as a photo page, with the captions you wrote.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Payments', role: 'tab' },
        { with: 1, act: 'click', target: 'Add payment' },
        { with: 3, act: 'click', target: 'Photos', role: 'tab' },
        { with: 3, act: 'click', target: 'From job photos' },
        { with: 3, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's08', kind: 'app', device: 'desktop',
      say: [
        'When the estimate is accepted, click Convert to invoice. It asks What to invoice.',
        'Choose the whole estimate, the deposit, or a later payment from your schedule.',
        'Click Save as template to keep your scope, payment schedule and terms for next time.',
        'On your next estimate, choose Use a template to fill them in. Free keeps one template, and Premium keeps up to twenty.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Convert to invoice' },
        { with: 1, act: 'highlight', target: 'What to invoice', unsure: true },
        { with: 2, act: 'click', target: 'Save as template' },
        { with: 3, act: 'highlight', target: 'Use a template', unsure: true },
      ],
    },
    {
      id: 's09', kind: 'app', device: 'desktop',
      say: [
        'Before you send, click Review estimate under the total. It gives you a second look.',
        'Next to the button, a line already says how many things there are to check.',
        'It flags a line without a price, an odd quantity, a price below your cost, a low margin, or missing tax.',
        'On Premium plus AI, it also suggests things you may have forgotten, like grout on a tile job, or a dump fee.',
        'Fix the line yourself, click Add line on a suggestion, or click Ignore. Your estimate never changes without your click.',
        'The basic checks are free on every plan. Next, let us send documents to your clients.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Review estimate' },
        { with: 0, act: 'click', target: 'Review estimate' },
        { with: 2, act: 'highlight', target: 'Ignore', unsure: true },
        { with: 3, act: 'highlight', target: 'Add line', unsure: true },
      ],
    },
  ],
};
