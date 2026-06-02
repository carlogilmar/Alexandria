# Sprint 20: Flash cards

Flash cards more than cards are a powerful cognitive tool, when you can separate concepts into small units it's more easy to understand and structure, the goal of have flash cards is key in this knowledge system. 

One important part of flash cards is the UX and the usability, this should make you feel curiosity, so the visual design is so important and crucial.

I feel for this sprint it's good to have a general deck for all the system. 

The flow I want:
- Go to the section "Flash Deck"
- I added a new flash card
- The card have a title, category, and a markdown text I can edit using our improvements in markdown texts
- I can customize the flash card style
- After add some cards, then the UI section should show all the cards in the deck, this view is important.
- So when I all my deck, I can select one to see in detail/edit/remove. I remember YugiOh decks. 
- Deck cards can be moved by me, so I can group them as I want.
- Cards can be reference and embedded in notes/articles as we did for workflows/notes.
- This section is going to be an important part of our system, let's put into our menu and prepare a shortcut.

The card style:
I think it could be enough to have the title, a custom categoy (I can create many categories as I need) and the text powered by markdown, but one important part in any card is the art, not sure how to handle the art in our cards, but artworks are so important for this. One thing we can do for this sprint is use emojis or use custom icons, but I feel that designs are flat, simple and doesn't reflect the power of this idea, I'd love to have better artworks to add in our card, also this artwork should be visually present in the card. 

The challenge in this feature is create a very good design for the flashcards. The inspiration of this ideas is on Pip Decks, and Tarot decks. The challenge also is bring the user the ability to break this strategies into visuals through this flash cards, this a very simple but powerful way of breakdown knowledge, so usability is crucial. 

---

# Refinement & proposal (read before implementing)

> Status: **definition / not yet approved.** This section turns the brief above
> into concrete decisions, a data model, a visual design, and a build plan.
> Everything tagged **[DECISION]** needs a yes/pick before coding. My
> recommendation is in **bold** for each.

## A. What's easy vs what's actually hard

The "make it an entity" plumbing is a **solved, low-risk recipe** in this
codebase — notes, articles, workflows, and (Sprint 19) feedback boards all
follow the same path: a table → `models.rs` struct → `commands/*.rs` →
`ipc.ts` → store state+actions → a view → a Summary tab → a sidebar pinned
section → `{{kind:id}}` embeds + `kind:id` links → (optionally) a canvas node.
A flashcard is just one more entity on that conveyor belt. We should reuse it
verbatim so flashcards behave consistently with everything else.

The genuinely hard / novel parts — where this sprint's effort should go:
1. **The card's visual identity** (the "feel of curiosity"), and
2. **The "artwork" question**, which the brief explicitly leaves open.

So this proposal spends its words there.

## B. The artwork problem — proposed answer

The brief's tension: emoji/icons feel *flat*; real artwork feels *powerful* but
we have no art pipeline and want everything on-device. Proposal — a **three-tier
art system**, layered, so a card is never an empty flat rectangle:

1. **Generative art (default, the differentiator).** Every card gets a
   deterministic abstract artwork generated from a seed (hash of its title +
   category), rendered as an inline **SVG** — themed by the card/category color.
   Think layered translucent geometric shapes / gradient mesh / a small
   "sigil" motif. This is exactly the lesson from our existing **Kandinsky
   Activity grid** and `MapNodeCard` (crisp SVG, no raster assets, scales at any
   zoom). Result: a brand-new empty deck already looks like a *curated deck*,
   not a list of boxes — which is the whole point.
2. **Image upload (override, for real fidelity).** Reuse the existing
   `saveImageFile` plumbing (already used for pasted/inserted images in
   markdown). If the user sets an image it becomes the hero art, overriding the
   generative one. This lets them bring tarot-style / AI-generated / scanned
   artwork when they want it.
3. **Emoji + color accent (lightweight personality).** An optional emoji shown
   as a corner glyph / motif, plus a **suit color** that tints the frame. Cheap,
   expressive, complementary — not the main art.

Precedence: `image` › `generative`. `emoji` + `color` are independent accents.
Plus a **strong card frame** (rounded corners, thin inner keyline, subtle
foil-like gradient sheen on hover, a category banner) so even text-only cards
read as Tarot/Pip cards rather than UI tiles.

**[DECISION A]** Confirm the three-tier art system (generative default + image
upload + emoji/color). **Recommended: yes** — it solves "flat" without an asset
pipeline and the generative layer is what makes the deck feel alive.

## C. Card anatomy & the flip (the "curiosity" mechanic)

A flashcard has two faces — and the *flip* is the signature interaction that
creates curiosity (Pip Decks literally flip to reveal the tactic; tarot cards
turn over):

```
   FRONT (what the deck grid shows)        BACK / detail (click to flip)
   ┌────────────────────────┐             ┌────────────────────────┐
   │                        │             │  Title          [edit] │
   │     [ ART ZONE ]       │ ~55% h      │  ──────────────────────│
   │   (image | generative) │             │  Rich markdown body:   │
   │              ✦ emoji    │             │  • our {color|text},   │
   ├────────────────────────┤             │    ==highlight==,      │
   │  TITLE (display font)   │             │    > [!callout], #tags │
   │  ⬤ category pill        │             │    tables, mermaid…    │
   └────────────────────────┘             └────────────────────────┘
        fixed aspect ratio                  (front art shown small)
```

- **Front** = art + title + category pill (+ emoji). This is the browseable
  object.
- **Back** = the markdown body, rendered with all our Sprint 19 markdown powers
  (colors, callouts, badges, tables, mermaid). The body is where the knowledge
  lives.
- **Aspect ratio:** a card-like portrait ratio (**recommended ~1 : 1.4**, the
  playing-card proportion) so the grid reads as a deck. **[DECISION B]**

**Interaction model — [DECISION C]:**
- **Recommended:** click a card in the grid to **flip it in place** to read the
  body (fast browsing/curiosity); a small **Expand** button opens a larger
  detail/editor panel (the `FeedbackCardPanel` slide-in pattern) for editing
  title/body/category/art/style.
- Alternative (simpler): no in-grid flip — click always opens the detail panel,
  which itself has a front/back flip toggle.

## D. The deck view

- **Section name "Flash Deck"** (internal view `flashdeck`); a single **global
  deck** for the whole system, as the brief says (no multiple-deck entity).
  **[DECISION D]** confirm single global deck.
- A **responsive grid** of card fronts (CSS `grid-template-columns:
  repeat(auto-fill, minmax(~190px, 1fr))`), each a beautiful object — the
  "YuGiOh collection" feel.
- **Manual reordering by drag** (`position` column) — reuse the **pointer-events
  DnD** pattern we already battle-tested in the feedback kanban (WKWebView-safe,
  5px threshold, ghost, `select-none` while dragging).
- **Categories as soft grouping** — a filter bar / "group by category" toggle so
  the user can "group them as I want." Manual order persists within the deck (or
  within a category if grouped).
- Search + the standard pin/archive/delete affordances.

## E. Categories — proposed as "suits"

The brief: *"a custom category (I can create many as I need)."* Two ways:

- **[DECISION E] Recommended — a `flashcard_categories` table** (name + **color**
  + optional **emoji/icon**). Categories become *suits*: each carries a visual
  identity that themes its cards' frame color and motif. This strongly amplifies
  the Tarot/deck feel and makes the grid scannable. Managed inline (create a
  category on the fly while editing a card, like a colored tag picker).
- Simpler alternative: free-text category, color auto-derived from the name hash
  (like our `#tag` badges). Less control, zero management UI.

## F. Proposed data model

```sql
CREATE TABLE flashcard_categories (   -- only if [DECISION E] = table
  id, name, color TEXT, icon TEXT,    -- color = palette name; icon = emoji
  position INTEGER, created_at
);
CREATE TABLE flashcards (
  id, title TEXT, category_id INTEGER NULL REFERENCES flashcard_categories,
  body TEXT,                          -- markdown
  image_url TEXT NULL,                -- set ⇒ hero art (else generative)
  emoji TEXT NULL,                    -- accent glyph
  color TEXT NULL,                    -- frame theme; falls back to category color
  position INTEGER,                   -- manual deck order
  pinned INTEGER, archived INTEGER,
  created_at, updated_at
);
```
Generative art needs no stored asset — it's derived from `id`+`title` at render
time. Reuse `$lib/cardColors.ts` for the `color` palette and the `#tag` hue
trick for category colors.

## G. Reuse map (the plumbing, condensed)

| Layer | Reuse from |
|-------|-----------|
| migration | Sprint 19 `0013` (new table) — next is `0016_flashcards.sql` |
| models / commands | mirror `articles.rs` (+ category CRUD like feedback columns) |
| store + ipc | mirror articles/boards; `openFlashDeck`, card + category actions |
| view nav + shortcut | add `flashdeck` to the view union, a `TopNav` icon, **⌘7** |
| create entry point | `AddEntityModal` option **+** a quick-add in the deck |
| Summary + sidebar | a "Cards" Summary tab + pinned-cards sidebar section |
| embeds + links | `{{flashcard:id}}` + `flashcard:id` (EmbedBlock, EntityLinkPicker, both editors' regex + `navigateEntity`, IdChip, ArticleEditor `EMBED_LINE`) |
| image upload | existing `saveImageFile` |
| markdown body | existing improved markdown (Sprint 19) |
| drag reorder | feedback-kanban pointer DnD |
| generative SVG | new `$lib/cardArt.ts` (seeded abstract SVG) — the one new lib |

## H. Suggested improvements beyond the brief

- **Study / review mode (high value, optional).** Flashcards beg for a "study"
  flow: full-screen one card at a time, tap to flip, ←/→ to move, **Shuffle**,
  optional filter by category. This is where flashcards pay off as a *cognitive*
  tool, and it reuses the flip. **Recommendation: include a minimal Study mode**
  (shuffle + flip + next/prev); spaced-repetition scheduling (Leitner/SM-2) is a
  tempting rabbit hole — **defer** unless you want it.
- **Quick capture.** A keyboard-first "+ New card" (title → Enter) like the
  kanban quick-add, so breaking a concept into a card is frictionless.
- **Embedded flashcard rendering.** In notes/articles, render a `{{flashcard:id}}`
  as a small card front (art + title + category) that's clickable — visually
  richer than the current text-y embeds.
- **Canvas node — [DECISION F].** Boards just got a canvas node; flashcards could
  too (`flashcard` map kind). **Recommendation: defer to a follow-up** (it's the
  same `map_nodes` CHECK-recreate migration pattern, but not core to the deck
  experience).

## I. Decisions needed (summary)

- **[A]** Three-tier art (generative + image + emoji/color)? *(rec: yes)*
- **[B]** Card aspect ratio ~1:1.4 portrait? *(rec: yes)*
- **[C]** Flip-in-grid + expand panel, or detail-panel-only? *(rec: flip + panel)*
- **[D]** Single global deck (no multi-deck entity)? *(rec: yes, per brief)*
- **[E]** Categories as a table with color/icon ("suits"), or free-text tags?
  *(rec: table)*
- **[F]** Canvas node now or deferred? *(rec: deferred)*
- **[G]** Include a minimal Study mode this sprint? *(rec: yes, minimal)*

## J. Proposed build phases (once decisions are locked)

1. **Schema + backend** — `0016_flashcards.sql` (+ categories table), models,
   `commands/flashcards.rs` (cards + categories CRUD, reorder, color/art).
2. **ipc + store** — types, wrappers, state + actions; load deck on init.
3. **Card component + generative art** — `$lib/cardArt.ts`, `FlashCard.svelte`
   (front/back/flip), the deck **grid view** with DnD reorder + category filter,
   detail/edit panel, image upload, color/emoji/category pickers.
4. **Navigation + surfaces** — view + ⌘7 + `TopNav` icon, AddEntityModal,
   Summary tab, sidebar pinned section.
5. **Embeds + links** — `{{flashcard:id}}` + `flashcard:id` everywhere.
6. *(optional)* **Study mode**; *(deferred)* canvas node.

Risk note: Phases 1–2, 4–5 are low-risk (proven recipe). Phase 3 is the design
investment — budget the most iteration there, especially the generative art and
the flip feel.
