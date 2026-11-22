import type { BlogPostContent } from '../types.ts';

const post: BlogPostContent = {
  slug: 'how-to-estimate-a-roofing-job',
  answer:
    'Estimate a roofing job in squares (one square is 100 square feet of roof). Measure the roof area, adjust for pitch, add waste, then price tear-off, materials, labor, disposal and the small items, and finish with overhead and profit. The worked example below shows each step with example numbers you replace with your own.',
  takeaways: [
    'Roofing is priced by the square: 100 square feet of roof surface, not of floor.',
    'Pitch makes the roof bigger than its footprint, and waste adds more on top of that.',
    'Tear-off, disposal, flashing, drip edge and underlayment are the lines most often forgotten.',
    'Price labor from your own tracked rate and production, not from a number you heard.',
    'Write inclusions, exclusions and the rotten-decking rule into the estimate before the client signs.',
  ],
  howTo: {
    name: 'How to estimate a roofing job',
    totalTime: 'PT45M',
    steps: [
      { name: 'Measure the roof', text: 'Measure each roof plane, multiply length by width, adjust for pitch and add them up to get the total area in squares.' },
      { name: 'Add waste', text: 'Increase the squares for cuts, hips, valleys and starter courses so you order enough material.' },
      { name: 'Price the materials', text: 'List shingles, underlayment, drip edge, flashing, vents, nails and sealant with quantities and your supplier prices.' },
      { name: 'Price tear-off and disposal', text: 'Add removing the old layers, hauling and the dumpster or dump fees, per square or per job.' },
      { name: 'Price the labor', text: 'Use your tracked crew hours per square and your loaded labor rate to build the labor line.' },
      { name: 'Add overhead and profit', text: 'Add your overhead share and profit margin, then state allowances, exclusions and the decking rule.' },
    ],
  },
  body: `A homeowner sends a photo of a roof and asks for a number by tomorrow. You can guess from experience, but a guess turns into a loss the first time a hidden layer of shingles or a soft patch of decking shows up.

This guide shows a repeatable way to estimate a roofing job from the measurements to the final price. The numbers are examples only. Material prices, labor rates and disposal costs change by area and by season, so use your own. Roofing rules and licensing vary by state, and this is not legal advice.

## Step 1: Measure the roof in squares

Roofers price in squares. One square is 100 square feet of roof surface.

For a simple roof, measure the length and width of each plane (each flat section of the roof) and multiply. For a gable roof that is two planes, for a hip roof it is four or more. Add the planes together to get the total area in square feet, then divide by 100.

Pitch matters. The roof surface is larger than the footprint of the house because the roof slopes. A steeper pitch means more surface for the same footprint. If you measure from the ground or from the plans, apply a pitch factor. If you measure the roof surface directly, you do not need one.

## Example: a simple gable roof

Example numbers only.

| Item | Value |
| --- | --- |
| Two planes, each 40 ft by 15 ft of sloped surface | 40 x 15 x 2 = 1,200 sq ft |
| Convert to squares | 1,200 / 100 = 12 squares |
| Add 10% waste for cuts and starter courses | 12 x 1.10 = 13.2 squares |
| Order | 14 squares of shingles, rounded up |

Waste depends on the roof. A plain gable wastes less than a roof with many hips, valleys and dormers. Use the waste you have seen on your own jobs.

## Step 2: Price the materials

Do not stop at shingles. A roofing estimate is mostly a list of small items, and the small items are what get forgotten.

| Line | Quantity logic | Notes |
| --- | --- | --- |
| Shingles | Squares x bundles per square | Check the manufacturer's bundles per square |
| Underlayment | Roof area plus overlap | Different types for different areas |
| Ice and water shield | Eaves and valleys | Depends on climate and local code |
| Drip edge | Eave and rake length | Often required by local code |
| Starter strip and ridge cap | Eave, rake and ridge length | Count it separately from field shingles |
| Flashing | Each wall, chimney, skylight and pipe | Count the penetrations |
| Vents and pipe boots | Per vent, per pipe | Replace worn boots while the roof is open |
| Nails, sealant and caulk | Allowance | Small but real |

Get current supplier prices for each line and write them in. A typical mistake is to price the shingles carefully and then add a vague "misc" at the end. Counting the flashing and vents takes ten minutes on the roof and saves real money.

## Step 3: Tear-off and disposal

If you are removing an old roof, the removal is a line of its own. Include:

- Labor to strip each layer. Two layers take longer than one.
- A dumpster rental or dump fees and the hauling.
- Protection for landscaping, siding and air conditioning units.
- Magnet sweep for nails around the house.

If you are adding a layer over an existing one (where local code allows it), say so in the estimate. Rules about how many layers are permitted vary by place, so check your local code.

## Step 4: Price the labor

Labor is where roofers either make money or lose it. Build the line from your own tracked data:

1. Production: how many squares per crew-day do you really finish on a plain roof like this one?
2. Adjust: steep pitch, tall buildings, multiple dormers and tight access slow the crew down.
3. Crew cost: the loaded hourly cost of each person (wages plus payroll costs), added up per day.
4. Divide: crew-day cost divided by squares per day gives labor cost per square.

If you do not know your loaded labor rate, [how to set your contractor labor rate](/blog/how-to-set-your-contractor-labor-rate) walks through the formula with a worked example.

## Example: putting the whole price together

Using the 14-square gable roof from above. Every number is an example, not a market price.

| Line | Amount (example) |
| --- | --- |
| Materials (shingles, underlayment, drip edge, flashing, vents, nails) | $3,600 |
| Tear-off and disposal | $1,100 |
| Labor (crew of three, 2 days) | $2,700 |
| Subtotal (direct cost) | $7,400 |
| Overhead at 15% of direct cost | $1,110 |
| Profit at 15% on direct cost plus overhead | $1,276 |
| Estimate total | $9,786 |

Overhead and profit are separate lines on purpose. Overhead is the cost of running the business (insurance, trucks, phone, software), and profit is what you keep. The difference between markup and margin trips people up, and it is explained in [how to calculate job profit margin](/blog/how-to-calculate-job-profit-margin).

## Factors that change the labor number

Two roofs with the same square count can take very different time. Before you settle on a labor figure, ask:

- How steep is it? Steep roofs need extra safety gear and slow every task, and some crews price them in a separate pitch bracket.
- How high is the building? A third-storey eave means more time moving material and more fall protection.
- How many cuts? Hips, valleys, dormers and skylights multiply the cutting and flashing work per square.
- Can the truck and dumpster get close? A long carry from the driveway adds hours that nobody sees in the measurements.
- What is the weather window? A job that must be dried in by evening needs a bigger crew for the first day.

Write the answer to each one next to your labor line. After the job, compare the hours you estimated with the hours the crew really worked, and correct your production number. That single habit makes the next roofing estimate more accurate than any rule of thumb. Time records from a [time sheet](/blog/construction-time-sheet-tracking) are the easiest source for it.

## Step 5: Write what is and is not included

Most roofing disputes are not about the shingles. They are about the decking. Write these in the estimate:

- Included: tear-off, disposal, underlayment, shingles, flashing, cleanup, magnet sweep.
- Excluded: structural repairs, gutters, chimney repair, interior damage.
- Decking: rotten or damaged plywood found after tear-off will be replaced at an agreed price per sheet, approved by the client before the work.
- Weather: what happens if rain stops the job halfway.
- Warranty: what your labor warranty covers and for how long, separate from the manufacturer's warranty.

For the decking rule, a signed [change order](/blog/change-order-form-guide) is the clean way to handle extra sheets. Writing the exclusions clearly follows the same logic as a [scope of work](/blog/how-to-write-a-construction-scope-of-work).

## Pre-send checklist

- [ ] Roof measured plane by plane, pitch accounted for
- [ ] Waste added and the order rounded up
- [ ] Every material line counted, including flashing, drip edge and vents
- [ ] Tear-off, dumpster and dump fees included
- [ ] Labor from your own production and loaded rate
- [ ] Overhead and profit added as separate lines
- [ ] Decking price per sheet written down
- [ ] Exclusions and weather terms stated
- [ ] Permit and inspection responsibility stated
- [ ] Expiry date on the estimate, because material prices move

## Sending it

Turn the numbers into a clear estimate the client can read and approve on a phone. ContractorDocs lets the client approve and sign from a link with no account. See the [roofers page](/for/roofers) for how roofing contractors use it, or build a quick one with the [estimate generator](/estimate-generator). After sending, a quick [follow-up](/blog/how-to-follow-up-on-a-construction-estimate) often wins the job.

## What this does not cover

Insurance claims, storm damage work, metal and flat roofing systems and local code requirements each have their own rules. Use the method here as a base and adjust it for your market and trade.`,
  faq: [
    {
      q: 'How do you calculate roofing squares?',
      a: 'Measure each roof plane in square feet, add them together and divide by 100. One square equals 100 square feet of roof surface. Add a waste percentage before you order material.',
    },
    {
      q: 'How much waste should I add to a roofing estimate?',
      a: 'It depends on the roof. Simple gable roofs waste less than roofs with many hips, valleys and dormers. Use the waste you have actually seen on similar jobs and round the order up.',
    },
    {
      q: 'What do roofers forget in an estimate?',
      a: 'Tear-off and disposal, drip edge, flashing around chimneys and walls, pipe boots and vents, and a decking replacement rule. Counting them on the roof avoids paying for them yourself.',
    },
    {
      q: 'How do I handle rotten decking found after tear-off?',
      a: 'Put a price per sheet in the estimate and have the client approve extra sheets before you replace them, ideally with a written [change order](/blog/change-order-form-guide).',
    },
    {
      q: 'Should I include a profit line on a roofing estimate?',
      a: 'Add overhead and profit so they are priced in, even if you show the client one total. Leaving them out means you are working for your costs only. See [job profit margin](/blog/how-to-calculate-job-profit-margin).',
    },
  ],
  cta: {
    heading: 'Send the roof estimate from your phone',
    text: 'Build the estimate, let the client approve it on a link and keep it with the job in the free plan.',
    href: '/for/roofers',
    label: 'See ContractorDocs for roofers',
  },
};

export default post;
