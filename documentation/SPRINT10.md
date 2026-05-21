# Sprint 10

One awesome part of having a knowledge system is the ability to cure all the resources, organize and structure.

TLDraw is a canvas, like a blackboard, where you can sketch any idea, that freedom is awesome. ReactFlow is another tool to implement things like this.

I'd love to have a place to structure in a visual way my content, skip the todo list (they are on-fly notes), let-s focus on what we have: articles, notes and workflows, it would be awesome have the ability to structure, connect and disconnect to each others, freedom to update this structure with new content, etc.

---

## Suggested implementation

### Framing — how this differs from the Garden

The **Garden** (Sprint 9) is *generated*. It reads your content and renders
what's already there: shapes from kind, color from maturity, edges from the
embeds you wrote inside articles. You can't "rearrange" it meaningfully —
the next time you open it, the simulation recomputes from scratch.

The **Map** (this sprint) is *curated*. You choose what goes on it, where it
sits, and which boxes connect to which. The map is its own persistent
artifact, separate from your articles/notes/workflows. Two different mental
models:

- **Garden** → "show me what I have and how it's already linked"
- **Map** → "let me arrange what I want, how I want it"

Skip lists and todos as the user noted — the entities that belong on a Map
are **articles, notes, and workflows**. (Workflows make sense because their
step chain often deserves an upstream/downstream context.)

### Library — use `@xyflow/svelte`

`@xyflow/svelte` is the official Svelte port of React Flow. It already
handles every primitive we'd need:

- Draggable nodes with arbitrary HTML/Svelte content
- Pan, zoom, fit-view
- Connection handles + drag-to-connect with smooth bezier edges
- Minimap, controls panel
- Selection (single + multi with shift)
- Background grid
- Keyboard shortcuts (delete, select-all, undo, redo)

Rolling our own would mean rebuilding the Garden's interaction primitives
plus handles, connections-in-progress, minimap, selection — weeks of work
for a worse result. `@xyflow/svelte` is MIT, ~50 kB minzipped, no React
required, and integrates with Svelte 5 stores cleanly.

Hard rule: we only use `@xyflow/svelte` for the editor surface. Node
contents stay our own Svelte components, styled with our existing Tailwind
palette, so the Map looks like the rest of the app.

### Data model — one global Map, the master blackboard

There is exactly **one** Map for the whole app — the master infinite
blackboard. No titles, no list, no concept of multiple boards. This keeps
the model honest: the user has one place to assemble structure.

#### New tables

```sql
-- A node placed on the master map. (kind, entity_id) references an
-- existing note/article/workflow without a hard FK so the schema stays
-- simple. Frontend resolves titles from the in-memory store.
CREATE TABLE map_nodes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  kind        TEXT    NOT NULL CHECK (kind IN ('note', 'article', 'workflow')),
  entity_id   INTEGER NOT NULL,
  x           REAL    NOT NULL,
  y           REAL    NOT NULL,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (kind, entity_id)         -- each entity appears at most once
);

CREATE TABLE map_edges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  target_id   INTEGER NOT NULL REFERENCES map_nodes(id) ON DELETE CASCADE,
  label       TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  UNIQUE (source_id, target_id)    -- one edge per direction between any two
);
```

Two notes on the constraints:

- `UNIQUE (kind, entity_id)` on `map_nodes` prevents the same article
  appearing twice on the board. Reflects the "master map" intent — each
  entity has one home position.
- If the referenced entity is deleted from its own table, the map row
  remains (no hard FK). The card renders dimmed as a "Missing …"
  placeholder until the user removes it.

### Backend commands

A trimmed surface — no map CRUD, just node/edge CRUD against the
implicit global map:

- `get_map()` → `{ nodes: MapNode[], edges: MapEdge[] }` — one payload,
  one IPC call when opening the view
- `add_map_node(kind, entity_id, x, y)` → `MapNode` — errors if the
  entity is already on the map (uniqueness)
- `move_map_node(id, x, y)` → `MapNode` — called on drag end (debounced
  on the frontend so per-pointermove updates don't flood IPC)
- `remove_map_node(id)` → `()` — removes from the map only; the
  underlying note/article/workflow is untouched
- `add_map_edge(source_id, target_id, label?)` → `MapEdge`
- `update_map_edge_label(id, label)` → `MapEdge`
- `remove_map_edge(id)` → `()`

Seven commands total. Mirrors the workflows / articles shape.

### Frontend

#### Sidebar entry

One new top-level button below "Garden" — opens the master map directly,
no index in between:

```
📚 Index — Summary
🌿 Garden
🗺️ Map
```

Clicking "Map" sets `app.view = "map"` and loads the global map state.

#### Components

- **`MapView.svelte`** — the editor surface. Hosts the `<SvelteFlow>`
  instance, bridges its state to the store, and renders the floating
  palette.
- **`MapNodeCard.svelte`** — the node body rendered inside each flow node.
  Shows the kind icon, title, a tiny "go to detail view" affordance, and
  a remove-from-map button on hover. Left border + background tint match
  the kind color from the Garden (blue note / violet article / amber
  workflow).
- **`AddToMapPalette.svelte`** — a collapsible side panel that lists every
  article/note/workflow **not currently on the map** (the unique
  constraint guarantees each entity has a single home). Drag onto the
  canvas to place; click "+" to drop at the viewport center. Search box
  at top to scope quickly.

#### `@xyflow/svelte` integration

Wire-up:

1. Convert `MapNode[]` from the backend into xyflow's `Node[]` format on
   open: `{ id: String(n.id), type: 'mapNode', position: { x: n.x, y: n.y }, data: { kind, entityId, title } }`.
2. Convert `MapEdge[]` into xyflow's `Edge[]`: `{ id: String(e.id), source: String(e.sourceId), target: String(e.targetId), label: e.label }`.
3. Register `MapNodeCard` as the `mapNode` custom node type.
4. Subscribe to xyflow's `onNodesChange` and `onEdgesChange` events.
   Filter to the events that matter:
   - `position` change (drag) → call `move_map_node` (debounced ~300 ms)
   - `remove` change → call `remove_map_node`
   - new connection → call `add_map_edge`
   - removed edge → call `remove_map_edge`

#### Resolve titles client-side

`MapNodeCard` looks up the title from the in-memory store:

```ts
const title = $derived.by(() => {
  if (kind === 'note')
    return app.notes.find(n => n.id === entityId)?.title ?? 'Missing note';
  if (kind === 'article')
    return app.articles.find(a => a.id === entityId)?.title ?? 'Missing article';
  return app.workflows.find(w => w.id === entityId)?.title ?? 'Missing workflow';
});
```

If `'Missing …'` is returned, render the card dimmed with a small warning
icon — the entity was deleted while it was placed on a map.

#### Interactions

- **Add item** — drag from the palette → drop on canvas → `add_map_node`
- **Move item** — drag inside canvas → `move_map_node` (debounced)
- **Connect** — drag from a node's handle to another → `add_map_edge`
- **Disconnect** — click an edge → press Delete (xyflow built-in)
- **Remove from map** — small × on each card hover → `remove_map_node`
  (entity itself is preserved)
- **Open the entity** — double-click a card → `app.selectNote/Article/Workflow`
- **Pan/zoom** — xyflow defaults (drag empty space, scroll-wheel, pinch)
- **Fit view** — xyflow `<Controls>` panel built-in
- **Minimap** — xyflow `<MiniMap>` built-in, bottom-right

### Build order

1. **Backend** — migration (`map_nodes` + `map_edges`) + the seven commands
   above. Mirrors workflows/articles in shape; ~half a day.
2. **Frontend store** — `app.mapNodes`, `app.mapEdges`, CRUD wrappers, a
   debounced `moveMapNode` (~300 ms after last drag tick).
3. **Map editor** — sidebar button, `app.view = "map"`, `@xyflow/svelte`
   integration, `MapNodeCard`, load-on-open / save-on-change loop.
4. **Palette + drag-to-add** — drag from palette to canvas; placed
   entities disappear from the palette (unique constraint).
5. **Edge labels + dim-orphan rendering** — polish: click an edge to
   label it, dim cards whose entity has been deleted.

A reasonable MVP is steps 1–4. Step 5 is nice-to-have.

### Aesthetic notes

- Use the kind colors we already use in the Garden so the Map feels like
  part of the same system. Each card's left border is the kind hue;
  background is a faint tint of the same hue.
- The pinned indicator from sidebars should also appear on the card.
- Background grid (xyflow built-in) at 24 px stride, ~6% opacity in light
  mode / 12% in dark — matches the Garden's dot pattern.
- Edges default to a soft neutral grey; user can later add labels for
  meaningful connections (e.g. "implements", "supersedes").

### Out of scope

- Freehand drawing on the canvas (the "tldraw" half of the reference) —
  meaningful for sketching, but adds a whole tool palette. Revisit if it
  comes up organically.
- Multiplayer / shared maps.
- Auto-layout buttons (we already have the Garden for "auto-arranged").
- Embedding the entity's *content* inside the card (just title + kind for
  v1; otherwise card sizes vary and the canvas gets visually noisy).

