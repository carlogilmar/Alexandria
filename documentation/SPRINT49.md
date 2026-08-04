# Sprint 49 — Sidebar redesign + drag-to-reorder pins

## Why

The sidebar's pinned area was **7 near-identical blocks** (Workflows /
Articles / Notes / Blueprints / Storyboards / Boards / Flashcards), each a
header + repeated pin-star rows — a lot of vertical noise, and no way to
order them. The redesign consolidates all pins into **one list**, keeps the
Today / Backlog / Add affordances (upgraded), and adds **drag-and-drop
reordering** + entrance/interaction animation. Prototyped as an approved
mockup.

## What shipped

### Unified, reorderable Pinned list

- All pinned entities render in **one flat list** under a single "Pinned"
  header (with a count). A small **type-colored icon** conveys the kind
  (note/article/blueprint/storyboard/board/workflow/flashcard) — no
  per-type headers, no repeated pin stars. Hover reveals an **unpin ✕**;
  the active entity is highlighted.
- **Drag to reorder** — pointer-based (HTML5 DnD is unreliable in
  WKWebView; same reason the kanban uses pointer events): `pointerdown`
  captures the pointer, a 5px threshold distinguishes click-to-open from
  drag, and the list live-reorders as you move (insertion index from the
  non-dragged rows' midpoints). `animate:flip` slides the others; the
  dragged row lifts (shadow + scale). On drop the order persists.

### Persisted order (full-stack)

- Migration `0025_pin_order.sql` — `pin_order(kind, entity_id, position)`.
- `commands/pins.rs` — `get_pin_order` + `set_pin_order` (wholesale replace
  in a tx; self-heals stale rows). Models `PinOrder`/`PinKey`. 1 test.
  Registered as `get_pin_order_cmd` / `set_pin_order_cmd`.
- ipc `getPinOrder`/`setPinOrder`; store `pinOrder` (`"kind:id"→position`) +
  `loadPinOrder()` (in `init`) + `reorderPins(keys)` (optimistic, then
  persists). The sidebar sorts pins by this; newly-pinned items (no entry)
  fall to the end until reordered.

### Today / Backlog / Add

- **Today's list** card gained a **mini progress bar** (done/total).
- **Backlog** card kept (pending count badge).
- **＋ Add** kept — its icon now **rotates on hover** (CSS).

### Animation (native, no dependency)

Reuses `$lib/anim.ts`'s `reveal` action for a staggered entrance (logo →
search → Today → Backlog → Add → pinned rows). Progress bar animates its
width; pin reorder uses Svelte `animate:flip`. All reduced-motion-safe.
Same hand-rolled approach as the Mirror / Home — no anime.js.

## Notes

- Search, brand-label editing, commit popover, aurora backdrop, collapse,
  and the today-detection logic are all unchanged.
- The empty state now hints "…Drag to reorder."

## Checks

`cargo test --lib` (108 pass, +1 new), `svelte-check` 0/0, `pnpm build`
clean. Migration `0025` is additive — run `pnpm tauri dev` once to apply.
