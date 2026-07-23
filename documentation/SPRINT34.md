# Sprint 34 — Interactive progress counter (```progress steppers)

## Why

The ```progress bars (Sprint 33) are static — the value is baked into the
markdown. The user wants a *live counter*: set `Tasks: 0/8`, then click
**−/+** buttons to step the numerator and watch the bar fill, persisted.
"That interaction can help me a lot."

## Model — same trick as task checkboxes

Task checkboxes (`- [ ]`) are interactive by **rewriting the marker in the
markdown source** on click, then saving; the re-render restores state from
the new source (`toggleTaskInSource`). We reuse that pattern exactly:

- A `` ```progress `` line whose value is an **integer fraction** `n/d`
  (e.g. `Tasks: 3/8`, optionally with a trailing color word) renders a
  `−` and `+` button around the readout.
- Clicking steps the numerator by ±1 (clamped to `0..d`) via
  `stepProgressInSource(src, index, delta)`, which finds the Nth
  steppable line *inside a ```progress fence* and rewrites just that
  number — then `onCommit` saves. Percent / bare-number bars stay static
  (nothing to count against).
- At `n === d` the bar completes → solid green + **COMPLETE** (Sprint 33),
  and `−` still lets you walk it back.

The user can put one bar per fence for a single clean counter, or several
fraction lines — each gets its own steppers.

## Interactive only where there's a source to edit

Steppers render **only** when the fence is rendered with
`env.progressInteractive` — set by the two editors that own the source +
save path (`MarkdownEditor` for notes, `ArticleEditor` for articles).
Read-only surfaces (blueprint cards, flash cards) call `md.render` without
it, so they show the same **static** bar — no dead buttons.

## Indexing (matches the task-checkbox scheme)

`renderProgress` numbers steppable bars per-render via a counter on `env`
(`env.progressSteps`). Notes are one `md.render`, so indices are
document-global. Articles render **per segment**, so indices restart each
segment and `ArticleEditor` offsets a click by
`countProgressStepsInSource()` of the preceding md segments — identical to
how it offsets task-checkbox indices. Source scan order (fence-by-fence,
line-by-line) matches render order, so index N always resolves to the same
bar in both directions.

## Files

- `documentation/SPRINT34.md` — this doc.
- `src/lib/markdownit.ts` — `renderProgress` gains `env` + optional
  steppers; new exports `stepProgressInSource` /
  `countProgressStepsInSource`; fence rule passes `env`.
- `src/app.css` — `.md-progress-ctrls` / `.md-progress-step` button styles.
- `src/lib/components/MarkdownEditor.svelte` — render with
  `{ progressInteractive: true }`; handle `.md-progress-step` clicks →
  `stepProgress`.
- `src/lib/components/ArticleEditor.svelte` — same, with per-segment index
  offset.
- `src/lib/components/FormattingHelp.svelte` — note the −/+ behavior.

## Not doing

- No custom step size (always ±1), no interactivity for percent/bare bars,
  no drag-to-set. Keep it a simple counter.
