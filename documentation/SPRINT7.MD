# Sprint 7 — Suggestions: from TODO list to knowledge system

This sprint isn't a checklist — it's a menu of next directions. The app is now a polished daily TODO tool with workflows. To grow it into a knowledge system, here are the ideas I'd suggest, grouped by theme. Each item has a one-line rationale so you can pick the threads you find most valuable.

At the bottom there's a **recommended order** if you'd like a path through them.

---

## 1. Capture: turn the app into a place ideas land before they're TODOs

A knowledge system has to swallow input fast. Right now the only way to write something down is "create a todo on a list." That's not enough.

- **Daily journal field** — a single free-text note attached to each day's list (markdown body). Distinct from todos; for the things that aren't tasks. *Why:* most of "knowledge" is observations, not actions.
- **Quick-capture from anywhere** — a global hotkey (e.g. `⌥Space`) that opens a tiny "drop it here" window from any app. Lands in today's list as a todo or in an Inbox. *Why:* if capturing has friction, people don't capture.
- **Inbox list** — a special un-dated list where uncategorized captures pile up until you sort them. Acts as the buffer for the quick-capture hotkey.
- **Markdown in notes** — `markdown-it` is already in the dependencies. Hook it up to render the notes field in the Inspector as formatted markdown when not editing. *Why:* the data model already supports notes; we're just not rendering it.

## 2. Links: connect related thinking across days

This is the single biggest move from "list app" to "knowledge system." Things need to refer to each other.

- **Wiki-style links — `[[some item]]`** — autocomplete suggests existing todos / lists / workflows; clicking the rendered link jumps there. *Why:* the unit of knowledge is the *connection* between two notes.
- **Backlinks panel** — when viewing a todo or list, show "X items reference this." Always-on bottom drawer in the Inspector. *Why:* the value of links is bidirectional discovery.
- **Tags as first-class entities** — clicking a `#tag` opens a "tag page" listing every todo with that tag, across all lists, sortable by date. We already have the `tags` table; the schema is ready. *Why:* tags become a cross-cutting index of the database.
- **Apply a workflow into a list** — one click turns a workflow's steps into todos in the current day. Optionally tracks "workflow instances" so you can see how many times you've run "Weekly review." *Why:* workflows become reusable scripts for thought.

## 3. Retrieval: surface what you already know

Search is the second pillar of a knowledge system. The current LIKE-based search is fine for short queries but won't scale to a year of dense notes.

- **SQLite FTS5** — switch the `search_todos` command to a real full-text index. Same SQL surface, much better ranking, handles phrase queries and stemming. *Why:* relevance over substring match.
- **Search notes, not just todo text** — extend the same index to `notes` and (later) journal entries. *Why:* most of the knowledge is in the long-form fields.
- **Saved searches / smart lists** — name a query and pin it to the sidebar (e.g. "All open #q2-roadmap"). Lives as a row in a new `saved_searches` table. *Why:* turns ad-hoc queries into a permanent view.
- **"On this day" panel** — Welcome page widget: "1 year ago today you did X." Shallow but motivating. *Why:* surfaces forgotten context with zero effort.
- **(Stretch) Semantic search via local embeddings** — use a small local model (e.g. bge-small-en) and a vector column. Lets you find "things about caching" without the word "cache" appearing. *Why:* the qualitative jump from search to *recall*. Big undertaking — only worth it once the corpus is large.

## 4. Reflection: turn data into insight

Knowledge systems compound when you periodically look at them.

- **Weekly review template** — a workflow-like template that opens every Friday with prompts: "What got done?", "What's blocked?", "What's coming up?" Generates a list pre-seeded with todos pulled from the past 7 days. *Why:* forces synthesis, the act that creates knowledge from data.
- **Tag trends** — small charts showing volume per tag over time. Reveal which themes are gaining or fading. *Why:* you can't see drift in your own focus without aggregation.
- **Workflow instance history** — every time you apply a workflow, log it. View past runs to learn "the onboarding playbook took ~3 days each of the last four hires." *Why:* workflows become measurable.

## 5. Structure: lists are too flat for everything

Days work for daily TODOs. They don't work for ongoing projects or reference notes.

- **Non-dated lists ("Projects")** — a list type without a `date`, that lives in a separate sidebar section. Same data model, optional `date` column. *Why:* not all thinking is anchored to a day.
- **Pinning** — pin individual lists, todos, or workflows to the top of the sidebar. Stored as a `pinned_at` timestamp. *Why:* recency-only ordering loses important-but-old items.
- **Nested workflow steps** — `workflow_steps.parent_step_id` already exists in the schema (sprint 4 migration). The UI only renders top-level today. Render the tree. *Why:* the data's already there; you bought the indentation when you designed the table.
- **Markdown-style headings inside notes** — turn `## Section` lines into structured navigation within long notes. *Why:* lets a single note hold a small wiki.

## 6. Export & interop: don't trap the data

The system is more valuable if its outputs are portable.

- **Markdown export of a tag** — "everything with #q2" → single .md file. We have per-list and per-range; add per-tag. *Why:* people sometimes need to hand a topic to someone else.
- **Obsidian/Logseq export** — write the same content as a folder of `.md` files with wikilinks preserved. *Why:* hedges against tool lock-in, which is a real worry for people considering a knowledge system.
- **iCloud Drive sync (optional)** — let the user point the database at a path under `~/Library/Mobile Documents/`. SQLite isn't multi-writer safe across iCloud, but for a single-user app it works in practice. Document the trade-offs. *Why:* desktop-only is a hard sell for note-taking long-term.

## 7. UX: small frictions that compound

Knowledge tools live or die by ergonomics. A few small things:

- **Command palette (`⌘K`)** — fuzzy search over actions and entities. Hit `⌘K`, type "weekly", press Enter — opens the most recent Weekly review. *Why:* power users navigate by name, not by clicking.
- **Quick switcher (`⌘P`)** — same idea but scoped to lists and workflows only. *Why:* a focused-mode shortcut beats general search for navigation.
- **Pin-to-Inspector** — keep the Inspector open even when no todo is selected, dock it to a recent note or a "scratchpad." *Why:* avoids the modal feeling of the current Inspector.

## 8. Extensibility: leave room for future you

If the app becomes the daily home, you'll inevitably want to do things its core doesn't cover.

- **Plugin API via Tauri commands** — let user-supplied JS run with a sandboxed handle to the database (read-only at first). *Why:* the long tail of "I just want to count words in completed todos" never makes it into core.
- **Custom views** — a registry where a plugin can register a new sidebar entry that renders arbitrary content. *Why:* unblocks experiments without bloating the main app.

---

## Recommended order

If I had to pick, I'd attack these in this order. The early items unlock the later ones.

1. **Markdown rendering in notes** + **daily journal field** *(Sprint 7)*
   Smallest changes, biggest jump in what the app can hold.
2. **Wiki-style links + backlinks** *(Sprint 8)*
   The defining feature of a knowledge system. Worth doing before the data set grows.
3. **SQLite FTS5 + saved searches** *(Sprint 9)*
   Now that there's more text and links, search needs to keep up.
4. **Apply-a-workflow into a list + workflow instance history** *(Sprint 10)*
   Workflows graduate from templates to a measurable practice.
5. **Weekly review + "On this day"** *(Sprint 11)*
   Reflection rituals — the things that turn captured information into useful knowledge.
6. **Non-dated projects + pinning + command palette** *(Sprint 12)*
   Quality-of-life polish once the foundations are in place.

Everything else (semantic search, plugins, Obsidian export, iCloud sync) is worth doing if and when a real need shows up — they're meaningful investments and pulling them in early risks complicating the core before it's earned the complexity.

---

## Out-of-scope reminders

A few things to *avoid* even as the app grows:

- **No accounts, no cloud.** Local-first is the soul of this tool — adding a backend would change the product fundamentally.
- **No mobile in v1 of this knowledge phase.** A real mobile app is its own project. Solve the desktop side first.
- **No AI features without a clear, local story.** If they go in, they go in via on-device models or user-supplied keys to a model the user controls. The data shouldn't leave the machine by default.

These constraints are the reason this tool is worth building — keep them.
