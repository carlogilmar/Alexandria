# Sprint 27 — Blueprint diagram importer (text → connected cards)

A **Import** button on the blueprint canvas opens a textarea; a small
mermaid-like DSL becomes real, connected, auto-laid-out cards. Frontend-only —
reuses the existing create actions (`addBlueprintCard` / `updateBlueprintCard`
/ `addBlueprintEdge`), no backend or schema change.

## The DSL

```
Box1: This is the description of box 1.
Box2: This is the description of box 2.
Box3: This is the description of box 3.
Box4: This is the description of box 4.

Box1 -> Box2
Box1 -> Box3
Box1 -> Box4
Box2 -> Box4
```

- `Name: description` → a card (title = Name, description = the rest).
- `A -> B` (or a chain `A -> B -> C`, and `-->` also works) → edges.
- Names used in edges but never defined become empty cards.
- Disambiguation: a line is a node def when the text *before its first `:`*
  has no arrow — so a description can itself contain `->`.

## Implementation (all in `BlueprintEditor.svelte`)

- **`parseImport(text)`** → `{ nodes: Map<name,{title,description}>, edges }`.
- **`layoutImport(nodes, edges)`** — longest-path layering (Kahn's): each layer
  is a row (top-down), nodes centred within their row (`COL=280`, `ROW=170`).
  Cycle nodes fall back to layer 0. Verified against the example: Box1 → row 0,
  Box2/Box3 → row 1, Box4 → row 2 (pushed down by `Box2 -> Box4`).
- **`doImport()`** — places the diagram to the right of existing content (via
  `getNodesBounds`), else at the viewport centre; creates each card (+ its
  description), then each edge with bottom→top handles (`"b"`/`"t"`, matching
  the downward flow). Edges are de-duped and each wrapped in try/catch so one
  rejected edge (backend `UNIQUE(source,target)`) doesn't abort the import.
  Finally pans the viewport to the new diagram and flashes a count.
- **UI**: an emerald "Import" button in the top-right cluster + a modal
  (textarea, syntax hint, the example as placeholder, Import/Cancel). Esc
  closes (wired into `onWindowKey`).

## Follow-ups / deferred

- Long descriptions can make a card taller than the `ROW` gap and overlap the
  next row — fixed spacing for now; a real measure-then-pack pass could help.
- Left-to-right layout option; edge labels (`A -> B: calls`); a matching
  "Export as text" to round-trip.
- A backend batch command (atomic, fewer IPC calls) if imports get large.
