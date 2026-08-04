# Sprint 46 — "The Mirror" (replaces Visualization)

## Why

The old **Visualization** (Garden, `GardenView` + `garden.ts`) was an
early-stage d3-force graph of note/article/workflow/list *connections*.
The author's verdict: connections aren't the interesting thing, and the
graph reads as an index, not a portrait. The knowledge base is really
its **artifacts** — notes, articles, blueprints, boards, storyboards —
with lists/tasks as the *substrate* they're crafted on.

**The Mirror** is a data-portrait of the whole corpus on one timeline:

- **Terrain** — one centered, contiguous bar per todo list, ordered by
  date; **height & colour = number of tasks** (Magma magnitude ramp).
  The daily grind as a landscape.
- **Orbs** — every artifact as a circle, **size = magnitude**, **colour
  = type**, placed at its creation time, beeswarmed so none overlap.
  **Notes float above** the terrain (they dominate), the **other four
  types sit below**. Each orb is a **link** to its entity (+ tooltip).
- Zoom/pan (the scene is wider than the window), a time-lapse build
  animation, light/dark, reduced-motion safe.

Prototyped as an Artifact mockup and approved (Magma palette, clickable
orbs). This sprint ships it as the real `mirror` view and **removes**
the Garden.

## Magnitude model

Per-type "mass" (raw, unit-native), computed in SQL; the frontend
`log(1+mass)`-normalises **globally** across all points and maps to a
radius with a sqrt scale, so a big article outweighs a small note across
types without any one type dominating.

| Type       | mass = |
|------------|--------|
| note       | `length(body)` (chars) |
| article    | `length(body)` |
| blueprint  | `#nodes + #edges` |
| board      | `#cards + #comments` |
| storyboard | `#nodes + #pages` |

Lists (terrain): `tasks = COUNT(todos)`, `done = SUM(completed)`; excludes
archived + backlog + empty (`date <> ''`, `HAVING COUNT>0`).

## Backend

- `db/models.rs`: `MirrorPoint { kind, id, title, createdAt, mass }`,
  `MirrorList { id, date, tasks, done }`, `MirrorData { points, lists }`
  (serde camelCase).
- `commands/search.rs`: `get_mirror(state) -> MirrorData` — five
  per-kind `SELECT`s (each → a private `RawPoint` FromRow, kind stamped
  in Rust) + the lists aggregate. All filter `archived = 0`. One test
  (`mirror_collects_all_kinds`).
- `lib.rs`: register `get_mirror` in the handler list.

## Frontend

- `ipc.ts`: `MirrorPoint` / `MirrorList` / `MirrorData` types +
  `getMirror()` wrapper (`invoke("get_mirror")`).
- `stores/app.svelte.ts`:
  - view union `"garden"` → `"mirror"`; `NavLoc` too.
  - state `mirror = $state<MirrorData | null>`, `mirrorLoading`,
    `mirrorLoadedAt` + `MIRROR_TTL_MS`.
  - `openMirror(force?)` (replaces `openGarden`) — loads via `getMirror`,
    caches; `invalidateMirror()` (replaces `invalidateGarden`, same
    callers). Remove the `buildGraph`/`GardenGraph` import + garden state.
  - navigation from an orb: reuse `selectNote` / `selectArticle` /
    `openBlueprint` / `openFeedbackBoard` / `openStoryboard`; a bar opens
    that day's list (`select(id)`).
- `components/MirrorView.svelte` (NEW) — the mockup ported to Svelte 5:
  canvas + `$state.raw` data, world layout + beeswarm, camera (wheel
  zoom / drag pan), a random bar ramp per open (6 palettes + shuffle),
  a collapsible info/legend panel, tooltip, click→navigate, build animation via a
  small rAF easing/stagger engine (the "anime.js-style" choreography;
  no dep — CSP/offline clean like the rest of the app). Loads
  `app.openMirror()` on mount; redraws on theme change.
- `routes/+page.svelte`: label map `garden`→`mirror: "The Mirror"`, the
  `⌘4` handler → `openMirror()`, the dispatch `{:else if view === "mirror"}
  <MirrorView/>`.
- `TopNav.svelte`: the `garden` destination → `mirror` (title "The
  Mirror", ⌘4, new icon), `active: v === "mirror"`.
- `CommandPalette.svelte` + `Welcome.svelte`: the Visualization entry →
  "The Mirror" / `openMirror()`. `HelpModal` label.

## Removals (Garden)

Delete `GardenView.svelte` + `garden.ts`; drop the `garden` view value,
`gardenGraph`/`gardenLoading`/`gardenBuiltAt`/`GARDEN_TTL_MS`,
`openGarden`/`invalidateGarden`, the `buildGraph` import, and all
`garden` references in `+page.svelte` / `TopNav` / `CommandPalette` /
`Welcome`. No DB change (Garden had no tables of its own; it read
existing ones). `get_mirror` is additive.

## Checks

`cargo test --lib` (new test + existing), `svelte-check`, `pnpm build`.
Manual: open ⌘4, confirm bars + orbs render, hover tooltips, click an
orb navigates, zoom/pan, collapse the panel, light/dark.
