# Sprint 56 — PR blocks III: restyle stats / spec / files for reviewers

Polish pass on the PR/code-doc blocks so they actively help a reviewer.
All still CSS-only/synchronous and screenshot-friendly (+ image-copy).

## ```stats — tinted cards + pulse

- Optional accent color: a trailing color word per line (`Tests: 90 ✓ green`),
  else the fence color (`stats violet`), else **auto** (pure `+N` → green,
  pure `−N` → red, else blue). Rides in as `--acc` on each card.
- Card = accent gradient tint + accent border + a gentle breathing glow
  (`@keyframes md-stat-pulse`, reduced-motion-safe). `+N`/`−N` still colored;
  label tinted with the accent.
- `renderStats(source, opts, md)` — fence dispatch now passes the info-string
  options (`stats` / `stats <color>`).

## ```spec — colored key column + inline markdown

- The **label column** is accent-tinted (fence color, default blue): accent
  text, soft accent background, accent divider — reads like a table with a
  colored key column. `--acc` on the container.
- **Values take basic inline markdown** now (`md.renderInline`): `code`,
  **bold**, links, `:icons:`. `renderSpec(source, opts, md)`.

## ```files — reviewer-oriented rows

- **Status colors the row** via a left rail (`--st`) + the letter chip.
- **Path split**: dimmed `dir/` + bold `filename` inside a mono badge, so the
  eye lands on the file.
- **Header**: `N files changed` + summed `+adds −dels` to orient the reviewer.
- The per-file note is a **description row with inline markdown**.

## Notes

- Accent colors reuse the shared `NAMED_COLORS` vocabulary.
- Slash templates + FormattingHelp rows updated; `pr-blocks-demo.md` refreshed.

## Checks

`svelte-check` 0/0, `pnpm build` clean.
