# Sprint 22 — Blueprints

A new top-level section for planning software designs on freeform canvases.
Multiple documents ("blueprints"), each an xyflow canvas like Alexandria but
**standalone**: no references to other entities. Nodes are design cards
(title + markdown description + color) plus the familiar decoratives
(title / text label / comment). Everything auto-saves per gesture. A canvas
region can be exported to PNG via a draggable crop rectangle.

## Why

Alexandria is the curated map of *existing* content. Blueprints are for
*designing*: sketching architectures, flows, and plans that don't correspond
to notes/articles. They need multiple documents (one per design), richer
cards (description + color), vertical *and* horizontal flow, and PNG export
to share the result outside the app.

Name: "Visualizations" was the user's first idea but collides with the
`garden` view's UI label ("Visualization", ⌘4). **Blueprints** won.

## Decisions

- **Separate tables, separate commands** (`blueprints` / `blueprint_nodes` /
  `blueprint_edges`, `commands/blueprints.rs`). We deliberately did NOT
  generalize `map_nodes` with a canvas id — that would mean another
  CHECK-recreate migration on Alexandria's data and entangle a new feature
  with the most battle-scarred code in the app. The blueprint schema is also
  *simpler*: no `entity_id`, no partial unique index.
- **Four handles per card** (top/right/bottom/left) so diagrams can flow
  left→right or top→bottom. Consequence: `blueprint_edges` persists
  `source_handle` / `target_handle` (TEXT, one of `t|r|b|l`) — without them
  edges would snap back to default sides on reload. Connections use xyflow's
  loose connection mode (any handle to any handle).
- **Cards are HTML, not SVG.** Alexandria's entity cards are SVG for zoom
  crispness, but blueprint cards need in-place editing (title input,
  description textarea), so we accept WKWebView's zoom softness — the same
  tradeoff the existing text/custom nodes make.
- **Markdown descriptions** render through the shared `$lib/markdownit.ts`
  factory. ```` ```mermaid ```` fences are NOT hydrated inside cards
  (diagram-in-diagram, and hydrated SVG inside xyflow's transformed viewport
  breaks PNG export fidelity). Titles are plain text.
- **Colors** reuse `$lib/cardColors.ts` (the feedback-card palette).
- **Decorative nodes are shared with Alexandria.** `MapTextNode`,
  `MapCommentNode`, `MapTitleNode` now read optional `onCommitContent` /
  `onResizeEnd` callbacks from node `data`, defaulting to the map store
  actions — so `MapEditor` is untouched and `BlueprintEditor` passes its own
  persistence.
- **Edge labels get UI here** (Alexandria never exposed them): click an edge
  to get a small floating input; Enter saves, Esc cancels, empty clears.
- **Auto-save** is inherited from the architecture: every gesture persists
  (drag-stop → move, blur → content, resize-end → resize). No save button.
- **PNG export = crop rectangle.** "Export PNG" enters export mode: a dimmed
  overlay with a draggable/resizable rectangle, pre-fit to the bounding box
  of all nodes (`getNodesBounds`). Confirm converts the rect's screen corners
  to flow coordinates (`screenToFlowPosition`), computes the render transform
  (`getViewportForBounds`), rasterizes the `.svelte-flow__viewport` with
  `html-to-image` (new dependency) at 2× on a flat theme-aware background,
  and saves through the existing native-dialog + `save_binary_file` path
  (proven by the removed Sprint 14 diagram exporter).

## Schema (migration 0017)

```
blueprints        id, title, pinned, archived, created_at, updated_at
blueprint_nodes   id, blueprint_id (FK cascade), kind CHECK card|text|comment|title,
                  title, description, color, content, x, y, width, height, timestamps
blueprint_edges   id, blueprint_id (FK cascade), source_id/target_id (FK cascade),
                  source_handle, target_handle, label, timestamps,
                  UNIQUE(source_id, target_id)
```

Card nodes use `title`/`description`/`color`; decoratives use `content`.
Node/edge mutations touch the parent blueprint's `updated_at` so the index
list's "updated" stamp is honest.

## Surface

- Views `blueprints` (index) + `blueprint` (editor), ⌘8, TopNav icon,
  command-palette destination, back-stack integration.
- Index: create / rename (dblclick) / pin / archive / delete, node count +
  updated date — modeled on the feedback boards index.
- Editor: card / title / text label / comment add buttons, connect (loose,
  4 handles), edge labels, delete via Backspace or per-node ×, minimap,
  export PNG.

## Follow-ups (same sprint, after first review)

- **No TopNav icon.** The blueprint list moved into a Summary "Blueprints"
  tab and creation into the sidebar's AddEntityModal ("Blueprint" option →
  creates + opens). ⌘8 and the command palette still open the index view.
- **Animated dashed edges** (`animated: true` + dasharray) — reads as flow.
- **Cards auto-size to their text**: no default node height; a manual
  NodeResizer height still wins. Titles are centered.
- **Badges in descriptions**: inline code (`` `like this` ``) renders as an
  accent-tinted pill via a `:not(pre) > code` rule in `BlueprintCardNode` —
  fenced blocks keep code styling. (A first attempt used a `#tag` markdown-it
  core rule; replaced with backticks per user preference — guaranteed
  element, no custom parsing.)
- **Composed PNG**: the viewport is captured transparent, then composed on
  a canvas — theme background + dot grid phase-aligned to flow coordinates
  + 48px margin + rounded hairline border + the blueprint title in the
  bottom-left corner. **Edges are drawn manually**: xyflow renders each edge
  as a zero-sized `overflow: visible` SVG, which WKWebView clips inside
  html-to-image's foreignObject (connections silently vanished from the
  export). `buildEdgeLayerSvg` reads each `path.svelte-flow__edge-path`'s
  `d` (flow coordinates), serializes one properly-sized SVG with a real
  viewBox + arrow marker, and composites it under the nodes; the live edge
  SVGs are excluded from the DOM capture via toPng's `filter`. Edge labels
  are HTML (portaled `.svelte-flow__edge-label` divs) and survive the
  capture untouched.

## Deferred

- Sidebar pinned section for blueprints.
- Alexandria canvas node for a blueprint (`blueprint` map kind).
- Floating edges (auto-attach to nearest side), edge styles (dashed),
  duplicate-blueprint.
- Mermaid hydration inside card descriptions.
