# Sprint 31 — Sidebar app-brand mark (retire the todo stats)

## Why

The sidebar footer still showed **Lists / Todos / Streak** counters — a
leftover from when the app was a daily-todo tool. It has since grown into
a broad knowledge base (notes, articles, blueprints, flash deck, charts…),
so those three daily-todo metrics no longer represent what the app is. We
replace them with an **app-brand mark** — a small Oswald, uppercase label
that identifies the toolbox — and make it **user-customizable**.

User ask: "remove lists/todos/streak … instead, same style, an Oswald
uppercase label like 'Alert Media Engineering Toolbox' as a mark for the
app … and a button to change the text would be awesome."

## What changed

- **Removed** the Lists / Todos / Streak rows from the sidebar footer.
  (`getStats` still runs — Home/Welcome use it; only the sidebar readout
  went away.) **Shortcuts** and the **build** commit popover stay.
- **Added** an editable brand label above them: Oswald 600, uppercase,
  `0.14em` tracking. A pencil button (hover-revealed) turns it into an
  inline input — Enter/blur saves, Esc cancels, blank resets to default.
- Default text: **"Alert Media Engineering Toolbox"**
  (`DEFAULT_BRAND`). Persisted in `localStorage` under `brandLabel`.

## Oswald, bundled (offline)

The Tauri webview has no network, so the font can't come from a CDN. We
**bundle** Oswald locally: `static/fonts/oswald-latin.woff2` +
`oswald-latin-ext.woff2` (~20 KB each — the variable-weight woff2 subsets
from Google Fonts, one file covers all weights). `@font-face` (weight
range `200 700`, matching `unicode-range`s) lives at the top of
`app.css`. `adapter-static` copies `static/fonts/**` to `build/fonts/**`,
served same-origin — verified in the production build.

The label inherits its **color** from the footer, so it adapts to every
sidebar tint and to dark mode automatically (structural, not a fixed
color).

## State / persistence

Lives in the theme store (the de-facto UI-prefs store, alongside
`sidebarTint`):

- `theme.brandLabel` (`$state`), `theme.setBrandLabel(text)` — trims,
  empty → `DEFAULT_BRAND`, writes `localStorage`.
- `readStoredBrand()` on `init()`.

## Files

- `documentation/SPRINT31.md` — this doc.
- `static/fonts/oswald-latin.woff2`, `oswald-latin-ext.woff2` — bundled font.
- `src/app.css` — `@font-face` (×2, latin + latin-ext).
- `src/lib/stores/theme.svelte.ts` — `brandLabel` + `setBrandLabel` +
  `DEFAULT_BRAND` + persistence.
- `src/lib/components/Sidebar.svelte` — removed the stat rows; added the
  editable brand block (inline edit) + `.brand-label` style.

## Not doing

- No font-family / weight picker for the label — Oswald is the mark.
- No per-workspace or synced branding — single local preference.
