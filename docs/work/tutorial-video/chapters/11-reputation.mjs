// Chapter 11: Reviews, feedback and your public page (help guides "client-feedback" and "public-profile").
export default {
  id: 'reputation',
  number: 11,
  title: 'Reviews, feedback and your public page',
  summary: 'Ask finished clients for feedback, show the best answers as testimonials, and fill in your public profile.',
  minutes: 2,
  covers: ['client-feedback', 'public-profile'],
  demoData: [
    'completed job "Okafor Basement Finish" (Linda Okafor, invoice INV-2064 paid) with no feedback link yet, so Make the link is visible',
    'Settings > Payments & reviews has the Google review link (https://g.page/r/northline-demo/review)',
    '4 feedback answers in Settings > Request-a-quote link > Client feedback: 5 stars (Linda Okafor, with a comment), 5 stars, 4 stars, 2 stars; one answered, one waiting link; one already shown on the page',
    'a Public profile with About text, 3 services, work area, license line, experience line and 3 gallery photos taken from job photos',
    'job photos on the Okafor job (Before / After) to pick for the gallery',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about turning happy clients into reviews, and showing your best work on a public page.',
        'Open a finished job and click Ask for feedback, in the row of buttons under the job name.',
        'Click Make the link. It is one link for this job, and your client can answer it once.',
        'Copy link, Share it, or click Send with Gmail. Nothing goes out until you tap it.',
        'Asking a client for feedback is part of Premium.',
      ],
      do: [
        { with: 0, act: 'caption', text: 'Chapter 11: Reviews and your public page' },
        { with: 1, act: 'click', target: 'Okafor Basement Finish' },
        { with: 1, act: 'click', target: 'Ask for feedback' },
        { with: 2, act: 'click', target: 'Make the link' },
        { with: 3, act: 'highlight', target: 'Copy link' },
        { with: 3, act: 'highlight', target: 'Send with Gmail' },
      ],
    },
    {
      id: 's02', kind: 'motion',
      say: [
        'Your client sees your name and logo, the job, and five big stars.',
        'They add an optional comment and their name, and tap Send feedback. No login needed.',
        'Everyone is also asked whether they would share it on Google, with your review link.',
        'It is the same link for every rating, because Google does not allow asking only the happy customers.',
        'Someone who gives one to three stars also sees a kind message.',
      ],
      visual: 'A phone frame with a clean feedback page: the Northline Remodeling logo and name on top, the job name, and a row of five large grey stars. A finger taps the fifth star and all five fill with gold. A comment box types a short sentence, a name field fills in, and a "Send feedback" button is pressed. A second card slides up asking whether they would share it on Google, with a button that opens the review link. A quick side-by-side shows a 2-star version of the same page with a short kind message instead of a celebration.',
      do: [
        { with: 0, act: 'caption', text: 'What your client sees' },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop', route: '/settings',
      say: [
        'You read the answers in Settings, under Request a quote link, in Client feedback.',
        'You see your average, how the stars are spread, and every answer in the client own words.',
        'Tap Use as testimonial on a good one. The name starts as a first name and a last initial.',
        'You can trim the ends of the quote, but you cannot rewrite what they said.',
        'Then click Show on my page. Nothing is public unless you choose it.',
      ],
      do: [
        { with: 0, act: 'scroll', to: 'Request-a-quote link' },
        { with: 0, act: 'click', target: 'Client feedback' },
        { with: 1, act: 'highlight', target: 'Answered', unsure: true },
        { with: 2, act: 'click', target: 'Use as testimonial' },
        { with: 4, act: 'click', target: 'Show on my page' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Next to it is Public profile. Write About your business, and add what you do as short chips.',
        'Fill in Where you work, your License and your Experience, then click Save profile.',
        'Under Photo gallery, click Pick photos from your jobs, and add a caption to each.',
        'These photos and captions are public, so keep faces and house numbers out of them.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Public profile' },
        { with: 0, act: 'highlight', target: 'About your business' },
        { with: 0, act: 'highlight', target: 'What you do' },
        { with: 1, act: 'highlight', target: 'Where you work' },
        { with: 1, act: 'click', target: 'Save profile' },
        { with: 2, act: 'click', target: 'Pick photos from your jobs' },
        { with: 2, act: 'key', key: 'Escape' },
      ],
    },
    {
      id: 's05', kind: 'motion',
      say: [
        'This is your public page, which anyone with your link can open.',
        'Below the request form, visitors read about you, what you do, where you work, and your license.',
        'They can tap a photo to enlarge it, and read What clients say, with your average stars.',
        'Your public profile is free on every plan. Next, let us look at your calendar.',
      ],
      visual: 'A phone frame showing the public request page for Northline Remodeling. After the short request form, the page scrolls down through sections: About, What we do as little chips, Where we work, License and Experience lines, then a photo gallery grid labelled Our work where one photo is tapped and grows to fill the screen, and finally What clients say with a gold average star rating and two short testimonials signed with first name and last initial.',
      do: [
        { with: 0, act: 'caption', text: 'Your public page' },
      ],
    },
  ],
};
