# Sprint 9

Now we have a good collection of features to build a good knowledge system. This is very competitive to apps like Evernote, Notion, Bear, Apple notes etc.

Let's start to think about Data Visualization, a way to visualize quantities and relationships, so now we have a knowledge system that should be improved as a Digital Garden, Maggie Appleton talks about this as a live system, and Giorgia Lupi's approach about human data visualization is really awesome. 

What we have now is:
- Tasks
- Lists
- Notes
- Workflows
- Articles

We're using this entities to keep important information, I've been implementing those features as I needed in my day by day, it's very useful, but we can take advantage of this.

Currently we have a calendar grid similar to github graph contribution, where I can see which days I finished my tasks for the day, that's very useful and informative.

Now we need to make some research about how can we present this data for the user to show him a structure about his knowledge. Please write below a suggestion to be implemented in sprint 9 based on my firsts references and this description.

---

## Suggested implementation — Sprint 9 is **one feature**: the Garden view

### Scope rule

**No backend work.** Sprint 9 is pure frontend visualization. The welcome
page grid stays exactly as it is. The DB stays untouched. We use only data
the existing IPC commands already return: entity summaries from the store,
plus `noteById` / `articleById` / `listWorkflowSteps` / `getIndexDoc` for
bodies we don't have in memory yet.

### What we're building

A new top-level view called **Garden**, reachable from the sidebar (a labeled
button right under "Index — Summary"). It opens full-screen and renders the
entire knowledge base as a single interactive map.

It's the "one place to see everything you know" view — not a dashboard, more
like a living atlas. Honors Appleton's garden idea (the system *grows*; old
notes are visibly older, recent ones are visibly fresher) and Lupi's
principle that *every visual mark should carry meaning* (shape encodes kind,
color encodes maturity, size encodes connectedness, position encodes
relationships).

### Visual model

Each entity is a node:

| Kind     | Shape           | Why                              |
|----------|-----------------|----------------------------------|
| Note     | Circle          | The default "thought" unit       |
| Article  | Rounded square  | A "page" — denser than a note    |
| Workflow | Diamond         | A directed process               |
| List     | Hexagon         | A bundle of todos                |

Each node carries these encodings — all derivable from data we already have:

- **Color (maturity)** — computed from `createdAt` / `updatedAt`:
  - 🌱 *seedling*  — created in the last 7 days  → muted green
  - 🌿 *budding*   — updated in the last 30 days → leaf green
  - 🌳 *evergreen* — updated in the last 90 days → deep green
  - 🍂 *dormant*   — no updates in 90+ days       → warm grey
- **Size** — degree (number of incoming + outgoing links). A lonely note
  is a small dot; a hub article that everything embeds is a large circle.
- **Border** — pinned items get a gold ring (we already track `pinned`).
- **Label** — title, shown on hover and for nearby/selected nodes.

Edges:

- **Embed edge (solid)** — when an article body contains `{{kind:id}}`,
  draw article → target.
- **Reference edge (dashed)** — when any body has a markdown link to
  `kind:id` (e.g. `[foo](note:5)`), draw source → target. Index doc
  references contribute too, drawn from a pseudo-node labeled "Index"
  parked at the top of the canvas.
- **Same-day soft edge (very faint)** — note and list with identical
  `date` get a thin, low-opacity link. This is the Lupi touch: it reveals
  daily co-occurrence without dominating the picture.

### Interaction (the UX bit)

This is where we put real effort — a graph is only useful if it's pleasant.

1. **Pan + zoom** with `d3-zoom`. Pinch on trackpad, scroll wheel, or +/-
   buttons in a corner.
2. **Drag a node** to reposition it; release returns it to the simulation.
   `d3-drag`.
3. **Hover a node** → it brightens, *non-neighbors fade to 15% opacity*, its
   label appears, and an edge-glow shows its connections. Hover off restores
   everything. (This single interaction is what makes a dense graph feel
   navigable.)
4. **Click a node** → opens a slim right-hand inspector panel with:
   - Title, kind, maturity badge
   - Last-updated date
   - Incoming references and outgoing references as click-through chips
   - "Open" button → navigates to the detail view (reuses existing
     `app.selectNote` / `selectArticle` / etc.)
5. **Search box** (top-left) — typing fuzzy-matches titles; matching nodes
   pulse, non-matching nodes fade.
6. **Type filters** (top-left, below search) — four toggles for
   Notes / Articles / Workflows / Lists. Off-types are hidden along with
   their edges.
7. **Layout switcher** (top-right) — three layouts share the same node set:
   - **Force** (default) — `d3-forceSimulation` with charge + link forces.
     Organic, garden-like.
   - **Radial** — `d3-forceRadial` grouping by kind; concentric rings of
     notes / articles / workflows / lists. Good for "what do I have a lot
     of?"
   - **Timeline** — x-axis = createdAt (oldest → newest), y-axis spread by
     kind; edges curve gently. Good for "how did this knowledge accumulate?"
   Switching layouts animates positions over ~600ms (use d3 transitions or
   a Svelte tween).
8. **Freeze** toggle — pauses the force simulation once the layout settles.
   Frozen positions persist for the session.
9. **Empty state** — when the user has very few items, render a soft prompt:
   "Your garden is just sprouting. Pin a few items, embed something in an
   article, and come back here to watch it grow."

### Data flow (frontend only)

On opening the Garden view (`app.view = "garden"`):

1. Use the entity summaries already in the store
   (`app.notes`, `app.articles`, `app.workflows`, `app.lists`).
2. Lazily fetch bodies we don't have:
   - For each note in `app.notes` → `noteById(id)` (parallelize with
     `Promise.all`)
   - For each article in `app.articles` → `articleById(id)`
   - Use the cached `app.indexDoc`
3. Build the edge list by scanning each body for:
   - `{{(note|list|workflow|article):(\d+)}}` → embed edges
   - `\[[^\]]*\]\((note|list|workflow|article):(\d+)\)` → reference edges
4. Build same-day edges by grouping `app.notes` and `app.lists` by `date`.
5. Compute node degree from the edge list → drives node radius.
6. Feed the result into `d3-force`.

Cache the body fetch results in a `gardenCache` field on the store with a
30-second TTL so reopening Garden is instant. Invalidate the cache when any
mutation runs (cheap to bust and rebuild).

### Why d3 specifically

`d3-force` is the best-tested incremental physics simulator on the web; it
exposes a tick callback that maps perfectly to Svelte 5's `$state` — every
tick we mutate node positions and Svelte re-renders the SVG. We deliberately
keep d3 to four packages and let Svelte own the DOM:

- `d3-force` — simulation
- `d3-zoom` — pan/zoom on the SVG root group
- `d3-drag` — node dragging
- `d3-scale` (optional) — for timeline-layout x-axis

We do **not** use `d3-selection` to mutate the DOM. Svelte renders the
nodes; d3 only computes numbers. This avoids the classic d3+framework
double-binding mess.

### Aesthetic notes

- **Background** — same neutral as the rest of the app, with a *very*
  faint dotted grid (5px on a 20px stride) at ~6% opacity. Subtle anchor
  for the eye without visual noise.
- **Typography on hover labels** — same font as the app, slightly smaller,
  with a translucent backdrop so labels stay legible over edges.
- **Motion** — easings should feel slow and organic, not snappy. ~250ms for
  hover transitions, ~600ms for layout transitions. Cosine-ease, not
  spring. Gardens grow slowly.
- **Dark mode** — invert the maturity palette toward saturated leaf colors
  on a near-black background; same color story, more contrast.

### Build order (all frontend)

1. **Add `pnpm` deps**: `d3-force d3-zoom d3-drag d3-scale` plus types.
2. **Routing**: add `"garden"` to the view union; sidebar button under
   "Index — Summary".
3. **Loader**: `app.openGarden()` populates the body cache and computes
   nodes + edges; store both as `$state` on the store.
4. **`GardenView.svelte`** — full-screen SVG with the force simulation, the
   four interactions (pan/zoom/drag/hover), and the inspector panel.
5. **Layout switcher** — `force` first; `radial` and `timeline` after the
   core view works.
6. **Search + type filters** — wired to a `visibleNodes` derived.
7. **Empty state + dark mode polish.**

If we run out of time, *force layout alone with hover-fade and the inspector
panel* is already a real "see your whole garden" feature. Radial / timeline
/ search are nice-to-haves layered on top.

### Out of scope (on purpose)

- Editing the graph (creating links by dragging between nodes).
- Storing layout positions to disk — session-only for now.
- Tags as nodes — keeps the v1 picture clean; revisit once we see usage.
- Individual todos as nodes — too noisy at this zoom; surfaced via their list.
- Anything backend.
