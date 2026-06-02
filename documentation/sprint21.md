# Sprint 21 — UX & usability hardening (no new features)

> A deliberate pause. Alexandria is now a broad, powerful knowledge system —
> but it was built *by* its designer, so it assumes the designer's knowledge.
> This sprint adds **zero new capabilities**. It makes the capabilities we
> already have **discoverable, learnable, and navigable for any user** (and a
> calmer experience for the power user too). Everything proposed surfaces or
> clarifies what already exists.

---

## 1. Where we are — what Alexandria has today

A single-user, on-device knowledge system (SvelteKit + Svelte 5 + Tauri 2 +
SQLite). Entities and surfaces:

| Surface | UI label | What it is |
|---|---|---|
| `home` | Home (logo) | Calendar/activity grid + counts + day detail |
| `list` | (todo lists) | Daily todo lists with tags, reorder, inspector |
| `note` | Notes | Day-attached markdown notes |
| `article` | Articles | Long-form markdown that can embed other entities |
| `workflow` | Workflows | Step chains with sub-steps + notes |
| `map` | **Alexandria** | The centerpiece canvas — place & connect entities |
| `index` | **Summary** | Tabbed catalog of every entity (pin/archive/delete) |
| `garden` | **Visualization** | Force-directed graph of entities & links |
| `feedback` | Feedback | Kanban boards with custom columns, card colors |
| `activity` | Activity | Weekly "Kandinsky" grid of when work happened |
| `flashdeck` | Flash Deck | Deck of flashcards (generative art, categories, study) |

Plus: rich markdown everywhere (`{color|text}`, `==highlight==`, `> [!NOTE]`
callouts, tables, mermaid, `#tag` badges), entity **links** `[x](note:5)` and
article **embeds** `{{note:5}}`, theming (light/dark + sidebar tint), a floating
top-nav bar (⌘1–7), back (⌘[), sidebar collapse (⌘\), and a per-kind pinned
sidebar.

**Verdict:** the feature set is genuinely complete and works. The gap is *not*
capability — it's communication.

## 2. The core problem (thesis)

> Alexandria is excellent for the one person who already knows where everything
> is and what everything means. For everyone else it is **opaque**: unlabeled
> icons, insider names, a search that silently ignores most content, no
> first-run guidance, and powerful syntax that's never shown in-app.

Five concrete symptoms (all grounded in the current code):

1. **Navigation is icon-only.** The 7 destinations are unlabeled glyphs in the
   top bar (`TopNav.svelte`); the only labels are hover tooltips. A newcomer
   sees seven mystery icons.
2. **Search is a trap.** The sidebar "Search…" box calls `searchTodos` only —
   it searches **todos and nothing else**. Search for a note/article/card you
   just made → "No results", with no hint why.
3. **Insider names.** "Alexandria" (a canvas), "Visualization" (a graph),
   "Summary" vs "Home", "Activity" (a Kandinsky grid) — meaningful to the
   author, cryptic to a new user. None are explained in-app.
4. **No onboarding.** First launch = an empty grid + mystery icons. Empty states
   mostly say "Nothing yet" without pointing at the next action.
5. **Power features are invisible.** Markdown extensions, embeds, links, and even
   shortcuts (`HelpModal` is stale: no ⌘7 / ⌘[ / ⌘\, no formatting reference)
   are discoverable only by reading the source or this repo's docs.

## 3. Findings (audit), by severity

**P0 — blocks a new user from being effective**
- **Search is todos-only** (`app.runSearch` → `searchTodos`). No way to find a
  note, article, workflow, flashcard, or board by name.
- **Top-nav is unlabeled**; destinations are undiscoverable without hovering.
- **No first-run orientation**; the app never says what it is or what to do.

**P1 — costs clarity / learnability**
- **Stale Help modal** — missing ⌘7 (Flash Deck), ⌘[ (back), ⌘\ (collapse), ⌘K
  (proposed), and any **formatting/embeds/links** reference.
- **Jargon unexplained** — "Alexandria", "Visualization", "Activity", "Summary"
  have no in-view one-liner telling you what they are / what to do.
- **No in-app markdown reference** — `{color|text}`, callouts, `{{embeds}}`,
  `note:5` links exist only in editor placeholders + a repo `markdown-guide.md`.
- **Empty states are passive** — Map/Garden/Activity especially give no
  next-action guidance on first visit.

**P2 — polish & accessibility**
- **Escape is inconsistent** — closes Help and the todo inspector, cancels edits,
  closes the Study overlay, but **not** `FeedbackCardPanel` / `FlashCardPanel` /
  `AddEntityModal`.
- **No focus management / trap** in modals & slide-in panels; focus isn't moved
  in or restored on close.
- **Two overview surfaces** (Home = temporal, Summary = categorical) with
  overlapping purpose and no signposting of the difference.
- Minor: low-visibility pin affordance; no Tab traversal of the top-nav icons.

## 4. The plan — proposed improvements (prioritized)

### ★ Headline: a Command Palette (⌘K) — "find anything, go anywhere"

One addition fixes three of the biggest gaps at once (search scope + navigation
discoverability + learnability). A `⌘K` overlay with a single text box that
searches **across everything**:

- **Entities** — notes, articles, workflows, flashcards, boards, lists, todos
  (by title/text), each row showing its kind + a one-line context. Enter →
  navigate to it.
- **Destinations** — Home, Alexandria, Summary, Visualization, Feedback,
  Activity, Flash Deck — each with its **label + what-it-is subtitle + shortcut**
  (so the palette doubles as the nav legend).
- **Actions** — New note / article / workflow / flashcard / board, toggle theme,
  collapse sidebar, open formatting help, etc.

This is framed as a **findability fix, not a feature** — it only surfaces things
that already exist. It's the single highest-leverage change for "any user can
navigate easily." (Backend: a new `search_all` command or client-side filtering
over already-loaded entity lists; most are already in the store.)

### P0 fixes
1. **Command palette (⌘K)** — above.
2. **Make the sidebar search real** — either (a) fold it into ⌘K and relabel the
   sidebar box as "Search todos" for honesty, or (b) expand it to search all
   entities. *Recommended: ⌘K is the global search; keep the sidebar box but
   scope-label it.* **[DECISION A]**
3. **Label the top nav** — keep the icon bar, but make destinations legible:
   show the **label of the active destination** as text next to the cluster, and
   ensure hover labels are obvious. (The palette covers the rest.) **[DECISION B]**

### P1 fixes
4. **Refresh the Help modal** — add ⌘7/⌘[/⌘\/⌘K; add a **Formatting** section
   (colors, highlight, callouts, tables, mermaid, links, embeds) sourced from the
   existing `markdown-guide.md`; add a one-line description per destination.
5. **In-app formatting help** — a small "Aa ?" affordance in the markdown editor
   toolbars that opens the formatting reference (a modal or popover). Stop hiding
   the syntax.
6. **View headers with a one-liner** — every destination view gets a short
   subtitle telling a newcomer what it is and the first thing to do (e.g.,
   Alexandria: "Your canvas — drag notes, articles, and boards here and connect
   them."). Cheap, high-impact, fixes most of the "jargon" problem **without
   renaming** the beloved "Alexandria".
7. **Action-oriented empty states** — replace "Nothing yet" with a CTA: Map →
   "Open the palette (＋) to add items"; Garden → "Create notes & link them to
   grow this graph"; Activity → "Your activity will appear as you add things";
   Summary tabs → a "+ New …" button inline.
8. **First-run orientation** — on an empty DB, Home shows a dismissible "Start
   here" card: 3–4 steps (make a note, try `⌘K`, open Help) and a "what is each
   section" mini-legend. Persist dismissal in localStorage. Optionally seed a
   read-only "Welcome / How to use Alexandria" note from `markdown-guide.md`.
   **[DECISION C]** seed a sample note or just the card?

### P2 fixes (consistency & a11y)
9. **Uniform Escape** — Esc closes any open modal/panel (`FeedbackCardPanel`,
   `FlashCardPanel`, `AddEntityModal`, palette) in priority order.
10. **Focus management** — move focus into a modal/panel on open, restore on
    close, and trap Tab within it (a tiny shared `trapFocus` action).
11. **Signpost Home vs Summary** — subtitles that distinguish "today / over time"
    (Home) from "everything you've made" (Summary).
12. **Small affordance polish** — clearer pin state, visible "drag to reorder"
    hint on first kanban/deck use, Tab-navigable top nav.

### Explicitly NOT renaming "Alexandria"
The product *is* Alexandria (the canvas is its namesake). We clarify with
subtitles/legend, not by renaming. "Visualization", "Summary", "Activity" are
candidates for friendlier labels **if** desired — but I recommend keeping them
and letting the subtitles + palette + help carry the meaning. **[DECISION D]**

## 5. Decisions needed
- **[A]** Global search = ⌘K palette (sidebar box scope-labeled "todos"), or also
  expand the sidebar box to all entities? *(rec: ⌘K is global; label the box)*
- **[B]** Top-nav: show the active destination's label as text? add a labeled
  expand-on-hover? *(rec: active-label + keep icons)*
- **[C]** First-run: a dismissible "Start here" card only, or also seed a
  read-only "How to use" note? *(rec: card + optional seeded note)*
- **[D]** Rename any of Visualization / Summary / Activity, or keep + clarify?
  *(rec: keep + clarify)*
- **[E]** Scope: do all of P0+P1 this sprint and defer P2 polish, or include P2?
  *(rec: P0+P1 now, P2 if time)*

## 6. Non-goals (important)
- **No new entities or capabilities.** No SRS, no canvas-flashcard node, no new
  views. This sprint is pure clarity/navigation/learnability.
- No visual redesign / re-theming beyond the small additions above.
- No data-model changes except possibly a lightweight `search_all` (read-only).

## 7. Suggested phasing (once decisions are locked)
1. **Command palette (⌘K)** + global search wiring — the centerpiece.
2. **Help refresh + in-app formatting reference** (reuse `markdown-guide.md`).
3. **View subtitles + action-oriented empty states** (a sweep across views).
4. **First-run "Start here"** card (+ optional seeded note).
5. **Consistency & a11y pass** (Escape, focus trap, affordances) — P2.

Each phase verified with `svelte-check` / `pnpm build`, and a real
`pnpm tauri dev` walkthrough *as a new user* (empty profile) to sanity-check that
someone with zero context can find their way.

---

## What shipped

Implemented with the recommended defaults (names kept + clarified; ⌘K is the
global search). **Frontend-only — no backend, no migration, no new
capabilities.** `svelte-check` 0 errors · `pnpm build` ok.

- **Command palette (⌘K)** — `CommandPalette.svelte`: one box that searches
  across notes, articles, workflows, flashcards, boards, lists, and todos
  (client-side over already-loaded store state — no new command), plus the seven
  **destinations** (each with a "what it is" subtitle + shortcut, so it doubles
  as the nav legend) and **quick actions** (new note/article/workflow/flashcard/
  board/list, toggle theme, toggle sidebar, formatting & shortcuts help).
  Arrow/Enter/Esc, grouped results. Wired to ⌘K and a visible **"Search ⌘K"**
  pill in the toolbar; the sidebar box is relabeled **"Search todos"** with a
  "Search everything ⌘K" link (honest scope).
- **Labeled section** — the current view's friendly name now shows as text in the
  top toolbar, so the icon-only nav isn't a mystery.
- **Help refresh** — `HelpModal` now lists ⌘K/⌘7/⌘[/⌘\ + Tab, each destination
  has a one-line description, and there's a link to the new formatting reference.
- **In-app formatting reference** — `FormattingHelp.svelte` (colors, highlight,
  callouts, tables, mermaid, links, embeds), opened from an **"Aa"** button in
  both editor toolbars, from Help, and from the palette.
- **First-run orientation** — a dismissible **"Welcome to Alexandria"** card on
  Home (only while the profile is empty; dismissal persisted in localStorage)
  with the 3 first steps + a one-line legend of the sections.
- **Empty-state CTA** — Alexandria/Map now shows "This is your canvas — open the
  ＋ palette to add items" when empty (Garden, Activity, and Summary already had
  good guidance).
- **Consistency** — Esc now closes `FeedbackCardPanel` & `FlashCardPanel` (with a
  guard so Esc inside a field cancels the field first); `AddEntityModal`,
  `FormattingHelp`, palette, and Study already handled Esc.

### Deferred (P2 remainder)
- Full focus-**trap** in modals/panels (we set initial focus + Esc; Tab can still
  leave a panel).
- Tab-traversal of the top-nav icons; richer pin affordance.
- Any actual renames (kept names + clarified via subtitles/palette/help).
