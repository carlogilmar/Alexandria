# Sprint 17 — UI polish: top nav bar, back button, sticky footer, commit popover, sidebar tint, mermaid error cleanup

> A batch of UX fixes once notes got long and pins got plentiful: reclaim
> sidebar space, make navigation reversible, keep the footer where it
> belongs, surface what a build contains, let the sidebar be recolored —
> and stop mermaid from littering the page with error graphics.

## 1. Mermaid orphan error nodes (bug)

**Symptom:** every failed ```` ```mermaid ```` render appended a "Syntax error
in text" graphic to the bottom of the UI; they piled up.

**Cause:** `mermaid.render(id, source)` injects a temporary measuring element
(`#id`) into `<body>` — and on a parse error an error diagram (`#d{id}`) — and
doesn't always remove them. Our own per-block error handling was already clean;
this was mermaid's leftover DOM.

**Fix:** `renderMermaid` (`$lib/mermaid.ts`) now wraps the call in `try/finally`
and removes `#id` and `#d{id}` in the `finally`. Errors still surface inline in
the block (the existing `.mermaid-error` path).

## 2. App shell is fixed-height; sidebar footer sticks to the bottom (bug)

**Symptom:** on a long note the page scrolled as a whole, so the sidebar (and
its stats/shortcuts/build footer) scrolled away — the footer never sat at the
true bottom.

**Fix:** `routes/+page.svelte` outer wrapper changed from `flex min-h-screen`
to **`flex h-screen overflow-hidden`** — the classic app-shell: the shell is
exactly the viewport, and only the main column (`flex-1 overflow-y-auto`)
scrolls. The sidebar and inspector (`h-screen overflow-y-auto`) stay put. Inside
the sidebar, the pinned `<nav>` is `flex-1 overflow-y-auto`, so the footer is
pushed to the bottom regardless of content height.

## 3. Six destinations → floating top-right icon bar (`TopNav.svelte`)

The sidebar carried Home/Alexandria/Summary/Visualization/Feedback/Activity;
with many pins they crowded the rail. All six **moved** to a compact floating
icon bar at the top-right (clear of the macOS traffic lights, which sit
top-left over the sidebar). The sidebar is now **search + pinned items +
footer** only.

- Each icon shows a tooltip with its ⌘ shortcut (⌘1–⌘6, unchanged — handled in
  `+page.svelte`). Active destination tints its icon with the destination hue
  (inline `style:color` — avoids Tailwind purging dynamic classes).
- The bar also hosts the **theme toggle** (moved from the sidebar header) and
  the **sidebar-tint** picker (item 5), plus the **back** button (item 4).
- It's a translucent `backdrop-blur` pill so vibrancy still reads underneath.

## 4. Back button + navigation history

`app.navStack` (a `$state` array of `NavLoc`) records where you were before each
navigation. Every entry point (`goHome`, `select`, `selectNote`,
`selectArticle`, `selectWorkflow`, `openIndex`, `openGarden`, `openMap`,
`openFeedback`, `openFeedbackBoard`, `openActivity`) calls a private
`recordNav()` at its top, which snapshots the current location (view + entity
id) and pushes it (deduped against the top, capped at 50).

`app.back()` pops the stack and restores that location, guarded by a
`suppressNav` flag so the restore itself doesn't re-record. `app.canGoBack`
(reactive getter over `navStack.length`) drives the button's visibility. Bound
to **⌘[** and the back arrow in `TopNav`. (Back-only by design — no forward.)

## 5. Customizable sidebar tint (light/dark aware)

The theme store gained `sidebarTint` (persisted in `localStorage` key
`sidebarTint`) and `SIDEBAR_TINTS` (neutral + 6 hues). `applyTint()` writes two
CSS vars on `<html>` — `--sidebar-bg` and `--sidebar-border` — as **translucent
HSL** derived from the tint hue and the resolved light/dark mode (so vibrancy
still shows through). It's recomputed inside `apply()` so it tracks theme flips.
`app.css` declares neutral defaults so the first paint is sane.

`Sidebar.svelte` consumes them via inline
`style="background-color: var(--sidebar-bg); border-color: var(--sidebar-border)"`.
The picker is a swatch row in a popover anchored to the palette icon in
`TopNav`; clicking a swatch calls `theme.setSidebarTint(name)`.

## 6. Clickable build hash → commit popover

`vite.config.js`'s git capture now also reads the HEAD commit's full message
(`git show -s --format=%B`) and ISO date (`%cI`), injected as
`__APP_COMMIT_MESSAGE__` / `__APP_COMMIT_DATE__` (declared in `app.d.ts`). The
sidebar footer's build line is now a button that toggles a popover showing the
commit message + formatted date + hash, so you can confirm what's in the
running build. (Dirty working tree still flags the hash with `-dirty`.)

## Round-trip checks

- `npx svelte-check` — 0 errors.
- `pnpm build` — succeeds.
- Manual (in `pnpm tauri dev`): long note keeps the sidebar footer pinned and
  the sidebar fixed while the note scrolls; top-right bar navigates with active
  highlight + ⌘1–6; back arrow / ⌘[ returns through visited entities; tint
  swatches recolor the sidebar and persist across restart + dark-mode toggle;
  build hash opens the commit popover; a broken mermaid fence shows the inline
  error with nothing stacking at the page bottom.

## Notes

- The logo in the sidebar header still doubles as Home (harmless overlap with
  the top bar's Home icon — it's branding).
- The top bar is `position: fixed` top-right; views already have top padding, so
  overlap with content is minimal. If a future view puts controls in the very
  top-right corner, mind the bar.
