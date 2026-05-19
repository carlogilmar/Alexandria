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

## Suggested implementation

### Framing

We already store enough relational signal to draw a real picture of a person's
knowledge — we just don't show it:

- **Explicit links** — `{{kind:id}}` embeds inside articles, `list:N` / `note:N`
  references inside the index doc and note bodies.
- **Implicit links** — todos sharing a tag, items created on the same day,
  todos belonging to a list, notes attached to a date with a list.
- **Temporal signal** — every entity has `createdAt` + `updatedAt`, so we
  know which things are seedlings (new, unedited) vs evergreen (long-lived,
  often-touched).

Sprint 9 should turn those signals into four small, complementary views.
Together they make the "Digital Garden" idea legible: not a dashboard, more
a sketched map you actually want to walk through. We try to honor Lupi's
principle that **every mark should carry meaning** (shape, size, color, and
position all encode something), and Appleton's principle that **content has
a maturity that should be visible** rather than hidden behind a flat list.

### Feature 1 — Backlinks (the foundation)

For each note / article / workflow / list, show "what references this".
Backlinks are the cheapest, most useful thing in any knowledge system — they
turn one-way links into a graph.

Implementation:

- A new IPC command `backlinks_for(kind, id)` that scans:
  - `articles.body` and `notes.body` for `{{kind:id}}` tokens.
  - `articles.body`, `notes.body`, `index_doc.body` for markdown links
    matching `(note|list|workflow|article):<id>`.
- Render a "Referenced by" panel under the body in each detail view. Each
  reference is a chip that navigates on click.
- Free side benefit: lets us flag **orphans** (items with zero backlinks) on
  the home page later — a Lupi-flavored "needs tending" cue.

### Feature 2 — Multi-layer activity heatmap (extend what we have)

The current GitHub-style grid shows only todo completion. Per Lupi, each day
cell should encode multiple data streams at once — so the same grid becomes a
**garden journal**.

Implementation:

- Backend: a new `get_activity_grid(from, to)` that, per day, returns:
  - `todos_done`, `todos_total`
  - `notes_touched`, `articles_touched`, `workflows_touched` (count of items
    with `created_at` or `updated_at` on that day)
- Frontend: re-render each cell with multiple encodings:
  - **Position in row** — already the weekday
  - **Color hue** — dominant activity type (green = tasks, blue = notes,
    purple = articles, amber = workflows)
  - **Size / opacity** — total activity volume
  - **A small dot in the corner** — there's a pinned item touched today
- Tooltip lists every entity touched that day with quick-jump links.

Keep the existing legend as a fallback; the visual learning curve should be
low. The point is to glance at the grid and see *what kind of week it was*,
not just whether todos got done.

### Feature 3 — Maturity (seedling / budding / evergreen)

Borrowed straight from Maggie Appleton's garden. Every note and article
shows a small leaf-glyph indicating where it sits on the maturity scale:

- 🌱 **Seedling** — created in the last 7 days, fewer than 3 edits.
- 🌿 **Budding** — older than 7 days, edited 3–10 times, last edit < 30 days.
- 🌳 **Evergreen** — older than 30 days, edited > 10 times, edited within 60 days.
- 🍂 **Dormant** — no edits in 90+ days. (Surfaced as a gentle nudge, not a
  shame signal.)

Implementation:

- Add `edit_count` columns to `notes` and `articles` (increment in
  `update_*_body`); compute the bucket in a derived field, not stored.
- Show the glyph in:
  - Sidebar item rows (left of the title, tiny)
  - Detail view header
  - Home page bucket lists
- Filter chip on the home page: "Show only seedlings" — surfaces things
  that need watering.

### Feature 4 — Knowledge Graph (the centerpiece)

A new sidebar route, **Garden**, opens a full-screen interactive graph.

Nodes:

- One node per Note, Article, Workflow, List, Tag. (Todos are too noisy at
  this level — they're represented through their list parent and tag.)
- Node visual: small glyph encoded with kind (shape), maturity (color
  saturation), and degree (radius).

Edges:

- Article → embedded item (`{{kind:id}}` token)
- Note / index / article markdown link → target
- Todo's list → todo's tags (aggregated as List → Tag)
- Same-day Note ↔ List

Interaction:

- Drag to pan, scroll to zoom.
- Click a node to open the side panel with title, maturity, backlinks, and
  a button to jump to its detail view.
- Filter bar: toggle entity types, search by title, focus a single tag (the
  graph collapses to the neighborhood of that tag).
- Optional "freeze" toggle to stop the force simulation once the user finds
  a layout they like.

Implementation:

- Use **d3-force** in a Svelte component, drawing to SVG for crispness at
  small node sizes. (d3-force pairs cleanly with Svelte $state — we update
  positions in the simulation tick and let Svelte re-render the SVG.)
- Compute the graph in the frontend from data already in the store
  (`app.articles`, `app.notes`, `app.workflows`, `app.lists`, `app.allTodos`).
  Backlinks command (Feature 1) feeds the link list — that's why backlinks
  ships first.
- Performance note: at a few hundred nodes, d3-force runs comfortably in
  the browser. If we cross ~1000 nodes later, we'd swap to canvas rendering.

### Build order

1. **Backlinks** — small backend command + tiny UI panel. Unblocks the
   graph and is useful immediately.
2. **Maturity glyph** — adds the only new column we need (`edit_count`),
   plus a shared helper to classify maturity.
3. **Activity grid v2** — backend aggregator + frontend cell rewrite.
4. **Garden / Knowledge Graph** — new sidebar entry, new view, d3-force.

If we run out of sprint, items 1–3 alone meaningfully change how the app
feels; item 4 is the showpiece but the most code.

### Out of scope (on purpose)

- Editing the graph (creating links by dragging) — read-only first.
- AI-generated suggestions ("notes you might want to link") — separate sprint.
- Sharing / public garden — separate sprint.
- Pretty hand-drawn rendering à la Dear Data — we'll lean into Lupi's
  *meaning per mark* principle, not literal hand-drawn aesthetics.
