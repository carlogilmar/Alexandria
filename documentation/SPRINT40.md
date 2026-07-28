# Sprint 40 — Remove the Alexandria canvas (Blueprints won)

## Why

Alexandria (the `map` view) was the original idea: one shared canvas where
every entity is a node you place and connect. In practice the user's
workflow moved entirely to **Blueprints** — multiple standalone design
canvases (Sprint 22+) — which is the same idea done better and is now the
daily driver. The single master map went unused, so it's removed to cut
maintenance surface and confusion.

The **app keeps the name "Alexandria"** — it's the product name and the
macOS bundle id (`com.alertmedia.bigpicture`) that resolves the on-disk DB
path. Only the *canvas* called Alexandria is gone.

## Decisions

- **Data: dropped.** Migration `0021_drop_master_map.sql` DROPs
  `map_edges` then `map_nodes`. The saved canvas is gone (the user
  confirmed they don't use it). Additive/idempotent, so existing DBs apply
  cleanly (mirrors how the Diagram entity left in Sprint 16).
- **Blueprints promoted** into the freed slot: it now owns **⌘2** and a
  **TopNav toolbar icon** (it previously had neither — only ⌘8). ⌘8 is now
  unbound.

## What was removed

- Components: `MapView`, `MapEditor`, `MapNodeCard`, `MapCustomNode`,
  `AddToMapPalette`.
- Store: `mapNodes`/`mapEdges`/`mapLoaded`/`mapLoading` state and every
  `*Map*` action (`openMap`, `refreshMap`, `addMapNode`, `addMapText/
  Comment/Custom/Title`, `resizeMapNode`, `updateMapNodeContent`,
  `moveMapNode`, `removeMapNode`, `addMapEdge`, `updateMapEdgeLabel`,
  `removeMapEdge`); `map` dropped from the view union + nav switches.
- ipc: `MapEntityKind`/`MapNodeKind`/`MapNode`/`MapEdge`/`MapState` types +
  all map invoke wrappers.
- Backend: `commands/map.rs` (deleted), its handler registrations in
  `lib.rs`, `pub mod map` in `commands/mod.rs`, the `MapNode`/`MapEdge`/
  `MapState` models.
- UI wiring: the `map` view branch in `+page.svelte`, VIEW_LABELS entry,
  ⌘2→map keybinding, TopNav "Alexandria" NavItem, CommandPalette
  "Alexandria" destination, HelpModal ⌘2 label, the first-run card's
  section list, the ⌘8 keybinding.

## What was KEPT (and decoupled)

`MapTextNode`, `MapCommentNode`, `MapTitleNode` — the decorative sticky /
comment / title nodes — are **still used by the Blueprints canvas**
(`BlueprintEditor` imports them). They took the map store actions
(`updateMapNodeContent`/`resizeMapNode`) as *fallback* defaults for their
`onCommitContent`/`onResizeEnd` hooks; since those store actions are gone
and Blueprints always passes its own callbacks, the fallbacks are now
**no-ops** and the `app` import was dropped. (Consider renaming these files
to `Bp*`/`Canvas*` someday, but the rename is churn for no behavior gain.)

## Verification

- `cargo test --lib` — 96 pass (the ~7 map tests were removed with
  `map.rs`); migration `0021` applies in the test pool.
- `svelte-check` clean (642 files, −5); `pnpm build` clean.

## Not doing

- No rename of the shared `Map*NodeComponents` (still accurate enough as
  "canvas nodes"). No change to the bundle id / app name.
