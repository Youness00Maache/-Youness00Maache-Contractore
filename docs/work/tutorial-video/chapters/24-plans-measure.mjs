// Chapter 24: Measuring from plans. Sources: help guides `plans`, `quick-measure`.
export default {
  id: 'plans-measure',
  number: 24,
  title: 'Measuring from plans',
  summary: 'Upload a plan, set the scale, measure lines, areas and counts, send totals to an estimate, and use Quick measure on any line.',
  minutes: 3,
  covers: ['plans', 'quick-measure'],
  demoData: [
    'job "Nair Master Bath" with one floor-plan PDF (2 pages, a known dimension line of 8 ft 6 in on the bathroom wall) already added in the Plans tab, so Add plan only needs to be shown, not completed',
    'scale already set on page 1 and a few measurements already drawn: a Drywall area, a Baseboard line and 6 Outlets (count), each with its own label colour, so Totals is filled',
    'price book item "Interior paint, walls and ceiling" (matches the Drywall or Painting label for Add to estimate)',
    'a Draft estimate on "Nair Master Bath" with at least one line, for the Quick measure scene (the estimate EST-1043 can be used)',
  ],
  scenes: [
    {
      id: 's01', kind: 'app', device: 'desktop', route: '/dashboard',
      say: [
        'This chapter is about measuring straight from your plans, so your quantities come from the drawing instead of a guess.',
        'Open a job, then switch to Plans and tap Add plan.',
        'Pick a PDF, where the first 10 pages can be measured, or an image.',
        'Files can be up to 15 megabytes, and a photo of a paper plan works too.',
        'Plans are part of Premium, and they need a connection.',
      ],
      do: [
        { with: 1, act: 'scroll', by: 500 },
        { with: 1, act: 'click', target: 'Nair Master Bath', patience: 25000 },
        { with: 1, act: 'scroll', by: -1200 },
        { with: 1, act: 'click', target: 'Plans', role: 'tab' },
        { with: 1, act: 'highlight', target: 'Add plan' },
      ],
    },
    {
      id: 's02', kind: 'app', device: 'desktop',
      say: [
        'Each page needs its scale before you measure. Tap Scale, then tap both ends of a length you know.',
        'A dimension line, a door or a wall all work. Type its length, like 12 feet 6 inches, or 3.8 meters.',
        'Then check one known length. A plan printed or scanned at another size changes every measurement.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Measure', patience: 15000 },
        { with: 0, act: 'click', target: 'Set from', delay: 2.6, patience: 15000 },
        { with: 1, act: 'highlight', target: 'Pick two points on the plan' },
        { with: 2, act: 'key', key: 'Escape', delay: 5 },
      ],
    },
    {
      id: 's03', kind: 'app', device: 'desktop',
      say: [
        'Pick Line, tap point after point, and click Done to finish. The running length shows as you go.',
        'Pick Area, tap the corners, and tap the first point to close the shape.',
        'Turn on Cut-out to draw an opening, like a stair, that comes off the area.',
        'Pick Count, and tap each outlet or light to drop a numbered marker.',
      ],
      do: [
        { with: 0, act: 'key', key: 'Escape' },
        { with: 0, act: 'click', target: 'Line', role: 'radio' },
        { with: 1, act: 'click', target: 'Area', role: 'radio' },
        { with: 2, act: 'click', target: 'Cut-out' },
        { with: 3, act: 'click', target: 'Count', role: 'radio' },
      ],
    },
    {
      id: 's04', kind: 'app', device: 'desktop',
      say: [
        'Every measurement belongs to a label, like Drywall, Baseboard or Outlets, each with its own color.',
        'Tap the label button at the bottom to pick or add one, and to set its waste percent.',
        'Use the mouse wheel or pinch to zoom, and Fit shows the whole width.',
        'In Move, tap a measurement to drag its corners or delete it. Undo and Redo work on everything.',
      ],
      do: [
        { with: 0, act: 'highlight', target: 'Drywall' },
        { with: 1, act: 'click', target: 'Drywall', role: 'button', delay: 0.5 },
        { with: 1, act: 'key', key: 'Escape', delay: 3.4 },
        { with: 2, act: 'click', target: 'Fit to width' },
        { with: 3, act: 'click', target: 'Move', role: 'radio' },
        { with: 3, act: 'highlight', target: 'Undo' },
      ],
    },
    {
      id: 's05', kind: 'app', device: 'desktop',
      say: [
        'Open Totals. Each label shows its length, its area net of cut-outs, or its count, plus waste.',
        'Waste starts at 10 percent for lengths and areas, and zero for counts.',
        'Click Add to estimate, check the price book item it matched, and click New estimate with this line.',
        'From Totals you can also download the Marked-up plan as a PNG, or the Totals as a CSV for any spreadsheet.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Totals', role: 'button' },
        { with: 2, act: 'click', target: 'Add to estimate' },
        { with: 2, act: 'highlight', target: 'New estimate with this line' },
        { with: 3, act: 'key', key: 'Escape' },
        { with: 3, act: 'click', target: 'Totals', role: 'button', delay: 0.6 },
        { with: 3, act: 'highlight', target: 'Marked-up plan (PNG)' },
        { with: 3, act: 'highlight', target: 'Totals (CSV)' },
        { with: 3, act: 'key', key: 'Escape', delay: 6 },
      ],
    },
    {
      id: 's06', kind: 'app', device: 'desktop', route: '/jobs/5b0b0000-0000-4000-8000-00000000a001',
      say: [
        'Already started an estimate? Open it and tap the ruler on a line, then pick your measurement under Recent on this job.',
        'That ruler is Quick measure, and it is free on every plan.',
        'On a phone, tap Measure next to Qty. On a computer, use the ruler next to the description.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Master bath renovation', patience: 25000 },
        { with: 0, act: 'click', target: 'Quick measure for item 1', delay: 3 },
        { with: 1, act: 'highlight', target: 'Quick measure', role: 'heading' },
      ],
    },
    {
      id: 's07', kind: 'app', device: 'desktop',
      say: [
        'Choose what to measure: Room, Area, Linear, Roof or Volume.',
        'Room takes doors and windows off the walls. Roof uses the plan area and the pitch. Volume gives cubic yards for concrete.',
        'Type feet and inches, or meters. Add a Waste percent, and for material sold by the box, set Packs.',
        'Pick a result and click Use this quantity. The line gets the quantity and its unit.',
        'Next, let us look at the AI tools.',
      ],
      do: [
        { with: 0, act: 'click', target: 'Room' },
        { with: 1, act: 'click', target: 'Roof' },
        { with: 2, act: 'highlight', target: 'Waste' },
        { with: 3, act: 'highlight', target: 'Use this quantity' },
        { with: 3, act: 'key', key: 'Escape', delay: 3.5 },
      ],
    },
  ],
};
