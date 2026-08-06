# Sprint 58 — Dark stats & spec widgets

The `stats` and `spec` blocks are now **dark widgets in every theme**, with the
header bar sharing the dark body style (not the light neutral bar). Gives PR
docs a premium, cohesive look and reads great in screenshots.

## What changed (CSS only)

- Shared dark tokens on `.md-stats-panel` / `.md-spec`: `--dark-surface`
  (`#0f1620`), `--dark-ink` (`#e6eaf2`), `--dark-line`.
- Header bar override scoped to the dark widgets
  (`.md-stats-panel .md-bhead`, `.md-spec .md-bhead`) → dark strip, light label.
- **stats cards** are now dark-accent: `linear-gradient(acc 26% → 10%, #141b27)`,
  brighter accent border + glow, light value, green/red always the light
  variants, accent label. (Bare stats without a `heading:` are dark chips too —
  `--dark-ink` has a literal fallback.)
- **spec** panel dark; key column accent tint lightened for dark
  (`color-mix(acc 45%, #e6eaf2)`), values light, inline `code` gets a
  dark-friendly pill.
- Removed the old light/`html.dark` split for both (always dark now).
- files + cards are unchanged (still light; the shared `.md-bhead` base is
  untouched — only overridden inside the two dark widgets).

## Copy-as-image

`installBlockImageCopy` now derives the capture background from the block's OWN
panel background (first child's computed `background-color` when opaque, else
the theme surface), so the dark widgets rasterize dark instead of white.

## Checks

`svelte-check` 0/0, `pnpm build` clean. (Image capture still needs a live
`pnpm tauri dev` run to confirm the clipboard write.)
