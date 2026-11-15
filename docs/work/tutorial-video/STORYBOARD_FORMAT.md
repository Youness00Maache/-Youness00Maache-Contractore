# Chapter script format (`chapters/NN-id.mjs`)

One file per chapter. The narration lives here (English first). Translations go to `translations/<lang>.json` later, keyed
by `<chapterId>.<sceneId>.<sentenceIndex>`. The recorder reads `scenes` to drive the real app; the voice step reads `say`.

```js
export default {
  id: 'jobs',                       // same as the file name after the number
  number: 3,
  title: 'Jobs: one place for a whole project',   // shown in the chapter list
  summary: 'One line for the chapter list.',
  minutes: 3,                       // target length (the real length comes from the voice)
  covers: ['jobs'],                 // help guide ids (see CHAPTERS.md); every id in helpContent.ts must be covered once
  demoData: ['jobs: 6 with different statuses', 'one job with an estimate and an invoice'],  // what the fake backend must hold
  scenes: [
    {
      id: 's01',
      kind: 'app',                  // 'app' = real screen recording, 'motion' = animated explainer
      device: 'desktop',            // 'desktop' (default) | 'phone' (390 x 844 viewport)
      route: '/dashboard',          // first scene of a chapter: where to start. Later scenes: omit to continue.
      say: [                        // narration, one entry per sentence = one subtitle cue
        'Every project starts as a job.',
        'Click New Job at the top of the dashboard.',
      ],
      do: [                         // actions, in order. `with` = index of the sentence the action starts with
        { with: 0, act: 'hover', target: 'Whitfield Kitchen Remodel' },
        { with: 1, act: 'click', target: 'New Job' },
        { with: 1, act: 'type', target: 'Job / project name', text: 'Maple Street Porch' },
      ],
    },
    {
      id: 's02',
      kind: 'motion',
      say: ['This is what your client sees on their phone.'],
      visual: 'Plain-language description of the animation: a phone frame slides in, a portal page with the job name, a green "Approved" stamp appears, ...',
      do: [{ with: 0, act: 'caption', text: 'What your client sees' }],
    },
  ],
};
```

## Actions (`act`)
`goto {route}` · `click {target}` · `type {target, text}` · `select {target, option}` · `hover {target}` ·
`scroll {by: <pixels, positive = down>}` or `{to: <target>}` · `key {key}` (e.g. `Escape`) · `wait {s}` ·
`highlight {target, label?}` (ring + small callout) · `zoom {target, scale?}` / `zoom {out: true}` (camera move) ·
`caption {text}` (lower-third) · `state {note}` (a demo-state change the fake backend must make; say what in `note`).

`target` is the text or accessible name a person sees: a button, link, tab, field label or placeholder, written EXACTLY as in
the app and in the in-app help (the `[[Label]]` chips in `components/help/helpContent.ts`). Optional `role` (`button`, `link`,
`tab`, `textbox`, `menuitem`) and `nth` (0-based) disambiguate. If you are not sure a label exists on screen, add
`unsure: true`; the recorder reports every action it could not perform so it can be fixed.

## Writing rules for `say` (narration)
- Plain, friendly contractor language, second person ("you"). No tech words (API, database, token, JWT, RLS, sync engine).
- One idea per sentence, 8-24 words. Read it aloud: it must sound like a person showing a colleague, not like a manual.
- Say what to click AND why you would use it ("Click Save, so you can come back to it later").
- Names of controls are quoted exactly as on screen, spoken naturally: "click New Job".
- Money numbers and plan limits only from `lib/plans.ts` (Free / Premium / Premium + AI). Prices: only in chapter 30.
- NEVER write "Kelviq" or "merchant of record". Do not promise features that the help guide does not describe.
- Mention Free vs Premium where the help guide does (a short "this one is a Premium feature" is enough).
- Narration length = `minutes` x 150 words (+/- 15%). A pure-motion scene still needs narration.
- Each chapter: scene 1 says what the chapter is about (one sentence) and ends with a pointer to the next chapter.

## Motion templates
`template: '<name>'` on a motion scene (optional, added later by whoever builds the visuals, NOT by the script writer) names
`motion/<name>.html`, a self-contained animation page. Without it the recorder shows a title card and reports the scene as
"no template yet". The script writer only fills `visual`.

## Scenes
Keep app scenes short (10-35 s of narration) and each with a single visible goal. Order scenes so the recorder can keep going
without a reload. Use `motion` only for what cannot be shown in the real app (client's phone/e-mail, offline sync, the plan
comparison, AI "thinking", public pages seen by someone who is not signed in). Describe each motion scene in `visual`.

Validate: `node scripts/validate-chapters.mjs` (run from `docs/work/tutorial-video`).
