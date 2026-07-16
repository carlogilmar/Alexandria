# Sprint 26 — Slash (`/`) command menu + slim icon toolbars

A Notion-style `/` command menu for the markdown editors, plus a slimming of
the editor toolbars to icon-only. Frontend-only.

## Slash menu

Type `/` at the **start of a line or after a space** while editing → a popup
opens **at the caret** with insert commands. Keep typing to filter (`/tab` →
Table), ↑/↓ to move, Enter/Tab to insert, Esc to dismiss, click also works.

Commands: Heading 1/2/3, Bulleted/Numbered list, Checklist, Quote, Callout,
Code block, Table, Diagram (mermaid), Cards, Divider, Link, Image.

- **`SlashMenu.svelte`** (shared by `MarkdownEditor` + `ArticleEditor`). Props:
  `textarea` (the element), `onEdit(nextValue, caret)`, `onLink?`, `onImage?`.
- It attaches its own `input` / `keydown` (capture) / `keyup` / `blur`
  listeners to the textarea. **Capture-phase keydown** so ↑/↓/Enter/Tab/Esc are
  intercepted before the textarea's own handlers (e.g. Tab-inserts-spaces).
- **Trigger detection** (`detect`): scans back from the caret for a `/` with a
  space-free query, where the char before `/` is start / space / newline. URLs,
  dates (`12/25`) and paths don't trigger it.
- **Caret positioning** (`caretXY`): the standard hidden "mirror div" — clone
  the textarea's font/padding/width, fill with text up to the caret + a marker
  span, measure the marker. Flips above the caret near the viewport bottom.
- **Insert**: snippet commands replace the `/query` range with the snippet and
  place the caret (`caretOffset` for code fences). Action commands (Link /
  Image) strip the `/query`, then call the editor's existing picker
  (`openLinkPicker` — now takes an optional event — / `pickAndInsertImage`).
- `onEdit` in each editor sets `draft` + restores the caret (same
  queueMicrotask pattern as `insertAtCursor`).

## Slim icon toolbars

- The insert buttons (link / table / diagram / cards / image) are now
  **icon-only with `title` tooltips** (labels removed). The top **Edit** button
  is icon-only too. The editing hint advertises `type / for commands`.
- The toolbar stays for discoverability; `/` is the fast path.

## Needs a live test

Caret-accurate positioning and the capture-phase key handling can't be
verified headless. In `pnpm tauri dev`: type `/`, filter, arrow + Enter to
insert each kind; confirm Link/Image pickers open and insert at the right spot;
confirm `/` inside a URL doesn't trigger; check the popup position + the
flip-above near the screen bottom; light + dark.
