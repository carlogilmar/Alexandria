# Knowledge systems & visualizing knowledge *state* — research → Alexandria roadmap

> An amplified research report to inform Alexandria's next features, focused on
> the author's stated frontier: **better ways to visualize the state/health of a
> personal knowledge base.** Produced by a fan-out research harness (107 agents,
> 24 sources fetched, 109 candidate claims → 25 adversarially verified: **21
> confirmed, 4 refuted**). Confidence is marked per finding; citations inline.
>
> Companion to `researching/readme.md` (the app's manifesto). Reading that first
> frames *why* these recommendations fit: Alexandria exists to give a person
> **orientation** ("a big picture") and to **augment learning alongside AI**,
> while staying **simpler than Notion/Obsidian/Logseq** and **local-first**.

---

## TL;DR — the three evidence-backed bets

1. **Make memory a first-class loop, scheduled by FSRS.** Active *retrieval*
   (being tested) beats re-reading; spacing + repeated testing sharply slow
   forgetting. You already have flashcards + a study mode — upgrade the scheduler
   to **FSRS** and let cards be made in one click from a note/article. *(High
   confidence.)*
2. **Visualize knowledge as *retrieval health*, not raw counts.** Memory has two
   independent strengths — **storage** (only grows) and **retrieval** (decays).
   A "what's fading" view (per-item retrievability, a decaying-items list, topic
   decay) is the **most defensible novel visualization** for Alexandria and
   directly serves the author's goal. *(High confidence on the science; medium on
   the exact UI.)*
3. **Design against the collector's fallacy.** Saving ≠ knowing. Gate notes
   through **maturity stages** (seedling → developing → evergreen) earned by
   paraphrase/summary/connection, and visualize **processed-vs-raw ratio** rather
   than glorifying volume or streaks. *(Medium-high confidence.)*

And four things the research **refuted** — *do not* build on these (see §5).

---

## 1. How personal knowledge is organized — methods & their evidence

### The learning-science backbone (the strongest evidence we have)

This is where the literature is genuinely *robust* (primary sources, replicated):

- **Retrieval practice (the "testing effect") beats restudy.** Being tested
  produces greater long-term retention than spending the same time re-reading —
  even *without* feedback. *(3-0 confirmed.* Roediger & Karpicke 2006,
  *Perspectives on Psychological Science* —
  http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Karpicke-2006_PPS.pdf)*
- **Important nuance:** massed **restudy can win on an *immediate* test**;
  testing's advantage shows up on **delayed** tests. So a study loop should
  emphasize delay/spacing, and *give feedback* so users can actually recall.
  *(3-0 confirmed.)*
- **Repeated/spaced testing slows forgetting a lot.** Classic figures: ~**46% /
  27% / 13%** forgetting after **0 / 1 / 3** tests (Wheeler & Roediger 1992;
  Thompson, Wenger & Bartling 1978). *(2-1 confirmed — directionally solid, exact
  numbers study-specific.)*
- **Two-strength memory model (the key to visualization).** Bjork & Bjork's
  "New Theory of Disuse": every memory has **storage strength** (how well learned
  — only ever *increases*) and **retrieval strength** (how accessible *right now*
  — *declines* with time and competing cues). *(3-0 confirmed —* Bjork & Bjork,
  "desirable difficulties," UNH PDF:
  https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf)*
- **"Desirable difficulties."** Forgetting and effortful recall, paradoxically,
  *enhance* later learning; the term was coined by Robert Bjork. *(3-0
  confirmed.)*
- **FSRS (Free Spaced Repetition Scheduler)** models memory with three plottable
  per-item variables — **Retrievability** (recall probability now), **Stability**
  (days until R falls to 90%), **Difficulty** — and is **built into Anki since
  v23.10** alongside legacy SM-2. It needs **~20–30% fewer reviews than SM-2** for
  the same retention. *(3-0 confirmed; the 20–30% is **simulation-derived, not an
  RCT**, and FSRS moves fast (FSRS-6) — treat as approximate.* abc-of-FSRS:
  https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs ; Anki FAQ:
  https://faqs.ankiweb.net/what-spaced-repetition-algorithm )*

**Implication:** the single highest-evidence thing Alexandria can do for
*learning* is lean into retrieval + spacing — which it already has the bones for
(flashcards + study mode). FSRS is the upgrade, and it *also* produces the data a
"knowledge health" visualization needs (see §2).

### Note-taking methodologies (weaker evidence — mostly expert practice/blogs)

- **Zettelkasten / atomic linked notes & evergreen notes.** Andy Matuschak:
  *maintaining* densely-linked evergreen notes **approximates spaced repetition**
  — revisiting and revising notes is itself retrieval practice. *(3-0 confirmed —*
  https://notes.andymatuschak.org/Evergreen_note_maintenance_approximates_spaced_repetition )*
  This is a lovely bridge: Alexandria's notes + its (future) review loop are the
  same mechanism.
- **PARA / Building a Second Brain (CODE, progressive summarization).** Action-
  oriented capture-and-distill. **The research declined to treat Zettelkasten and
  BASB as incompatible opposites** (that claim was *refuted*, §5) — they're
  complementary lenses, so Alexandria needn't "pick a camp."
- **Digital gardens.** Maggie Appleton's widely-cited framing: notes grow through
  **maturity stages** (commonly *seedling → budding → evergreen*), favoring
  "learn in public / always improving" over the polished blog post. *(Source:*
  https://maggieappleton.com/garden/ )* This maps cleanly onto a `maturity` field
  for Alexandria notes/articles.
- **Over-engineering is an anti-pattern.** Perfecting your Dataview queries /
  tooling while the notes stay shallow is **procrastination dressed as work.**
  *(3-0 confirmed —* https://www.dsebastien.net/ai-wiki-pkm-pkm-anti-patterns/ ,
  https://thoughtfulatlas.substack.com/p/stop-over-complicating-note-taking )*
  → A direct mandate to keep Alexandria *simple* (its founding value).

---

## 2. Visualizing the STATE of a knowledge base (the main event)

### What's eye-candy: the raw link graph

- Obsidian's global graph is the canonical "looks cool, low day-to-day utility"
  feature — beautiful, but it becomes **hairball noise** at scale and rarely
  drives real work. Even its *defenders* concede the **global** view is mostly
  decorative; the **local** graph (one note's immediate neighbors) is where the
  utility is. *(Sources, contested:* in-defense:
  https://www.eleanorkonik.com/p/its-not-just-a-pretty-gimmick-in-defense-of-obsidians-graph-view
  ; critique: https://knowledgestuck.substack.com/p/obsidiangraph ;
  https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful )*
- **Implication for Alexandria's force-directed "Visualization":** don't invest
  in making the *global* graph prettier. Either (a) pivot it to a **local /
  focused** graph around the current entity, or (b) **repurpose the canvas you
  already have** to carry *meaning* (decay, maturity — below). An open question
  the author should decide (§6).

### What helps: feedback tied to memory and meaning

- **Retrieval-health view (the recommendation).** Because storage only grows and
  retrieval decays, the honest picture of "what you know" is **what you can still
  retrieve.** Concretely, using FSRS data:
  - a **per-item / per-note forgetting-curve sparkline** (R over time),
  - a **"fading" list** — high-stability *but* low-retrievability items (things
    you learned well and are now slipping) → the highest-value review targets,
  - **topic-level decay aggregates** (which categories/areas are going cold).
  This is *novel, tasteful, and evidence-grounded* — and nothing in the
  comparable-app set does it well. *(High confidence on the model; the UI is the
  design work.)*
- **Maturity, not volume.** Show the **processed-vs-raw ratio** (how much of what
  you saved you've actually digested) and the distribution across maturity stages
  — a far truer "state of knowledge" than a note count. *(Ties to §3 collector's
  fallacy.)*
- **Activity heatmaps (your GitHub calendar + Kandinsky grid): keep, but frame
  honestly.** Contribution-style heatmaps are motivating *streak* mechanics, but
  the research is blunt that they **measure activity, not value** — they can be
  trivially gamed and can induce **streak anxiety**. *(Sources:*
  https://dev.to/sylwia-lask/your-github-contribution-graph-means-absolutely-nothing-and-heres-why-2kjc
  ; https://github.com/isaacs/github/issues/627 )* Keep them as *liveness/habit*
  signals, **secondary** to the knowledge-health view — and avoid punitive streak
  framing for a solo user.
- **Anchor dashboards to a goal.** Self-tracking is more valued when tied to a
  **specific, explicit goal** vs. open-ended numbers. *(3-0 confirmed but
  suggestive — Hamari et al. 2018, N=167, an exercise app:*
  https://link.springer.com/article/10.1007/s11257-018-9200-2 )* → If Alexandria
  adds a knowledge dashboard, let the user name what they're trying to learn and
  measure against *that*, not vanity totals.

---

## 3. Comparable apps — what to borrow, staying simpler

| App | Organization | Feedback on knowledge *state* | Take for Alexandria |
|---|---|---|---|
| **Obsidian** | Local md + `[[links]]`, plugins | Global+local **graph** (contested), heatmap plugins | Borrow *local* graph idea; skip global-graph polish |
| **Logseq** | Outliner, block refs, daily notes | Graph (same critique) | Daily-notes habit ≈ your Home; outlining not needed |
| **Roam** | Bidirectional links, daily notes | Graph | Influential but heavy; not the simplicity you want |
| **Notion** | Databases/pages, nested | Dashboards via databases | The "easy to lose nested embeds" the author rejects |
| **Tana / Capacities / Mem** | Schema/"objects", AI assists | Mostly counts/queries | "Typed objects" idea ≈ your entity kinds (already have) |
| **RemNote** | Notes **+ built-in SRS** | SRS queue/stats | Closest kin — notes that become flashcards; your direction |
| **Anki** | Decks/cards | **FSRS scheduler + retention stats** | The gold standard to adopt for §1/§2 |
| **Heptabase** | **Whiteboard-first**, cards on canvas | Spatial arrangement = the feedback | Validates your Alexandria *canvas* as a sense-making surface |
| **Digital gardens** (Appleton et al.) | Maturity-staged notes | Visible **maturity badges** | Adopt seedling→evergreen maturity |

**Pattern:** the tools that give *real* knowledge-state feedback do it through
**spaced-repetition stats (Anki/RemNote)** or **spatial sense-making
(Heptabase ≈ your canvas)** — not pretty global graphs. Alexandria already owns a
canvas and flashcards; the gap is **memory scheduling + a health view**, which
none of the "notes apps" do well. That's the white space.

---

## 4. Prioritized recommendations for Alexandria

Each tied to evidence, with effort/risk and fit to "simple, local-first,
augment-don't-replace."

### P1 — FSRS-scheduled review loop *(high evidence, high value)*
- Upgrade the flashcard **study mode** into a **due-queue** scheduled by **FSRS**;
  persist per-card **R/S/D** + review history in SQLite. Grade on recall
  (again/hard/good/easy), *give feedback*, and emphasize spacing.
- **One-click card from a note/article** (select text → "make card"), and
  resurface Matuschak's insight: *reviewing notes is itself retrieval*.
- *Effort:* medium (a Rust FSRS implementation/crate + schema + a due view).
  *Risk:* low-moderate; FSRS is well-documented but evolving (use sensible
  defaults; the 20–30% efficiency is approximate). *Fit:* perfect — it's the
  highest-leverage learning feature and stays local.

### P2 — "Knowledge health" view *(the author's frontier; the novel bet)*
- A view that answers **"what do I actually still know, and what's fading?"** from
  FSRS data: forgetting-curve sparklines, a **fading-items** list (high stability,
  low retrievability), and **topic decay** aggregates by flashcard category /
  note tag.
- **Repurpose the existing force-graph/canvas** to *encode* this (node warmth =
  retrievability, size = stability) instead of being a raw link hairball — turning
  an "eye-candy" surface into a meaningful one.
- *Effort:* medium (depends on P1's data). *Risk:* design risk (must avoid
  becoming another pretty-but-useless graph — validate it answers a real
  question). *Fit:* this is the differentiator no comparable app nails.

### P3 — Maturity gating against the collector's fallacy *(medium-high evidence)*
- Add a lightweight **maturity** field to notes/articles (seedling → developing →
  evergreen), **promoted by an action** (paraphrase/summarize/connect), shown as a
  small badge. Surface a **processed-vs-raw ratio** on Home/Summary.
- Keep the GitHub calendar + Kandinsky grid as **secondary liveness** signals,
  reframed away from punitive streaks.
- Optional **AI assist** (augment, not replace): suggest a one-line summary or a
  candidate connection when promoting a note — *the* place AI fits the ethos,
  *if* it removes busywork rather than adding it.
- *Effort:* low–medium. *Risk:* low. *Fit:* directly enforces the app's "simple +
  augment" values and counters PKM's #1 failure mode.

---

## 5. What the research REFUTED — do **not** design around these

The adversarial pass killed four plausible-sounding claims (≥2/3 refuted). Worth
internalizing because each could have misled a roadmap:

1. **"Mastery-oriented users prefer dashboards over gamification/social."** *(1-2
   ✗)* — Don't assume your serious-learner persona wants quantified-self dashboards
   *more* than other feedback. Validate the health view with use, don't presume.
2. **"Passive collection yields *zero* learning."** *(0-3 ✗)* — Collecting isn't
   worthless; the real risk is *mistaking* collecting for understanding
   (collector's fallacy). So **don't punish capture** — just make digestion easy
   and visible.
3. **"Zettelkasten and BASB are fundamentally incompatible."** *(1-2 ✗)* —
   Alexandria needn't pick a methodology camp; blend action-capture and atomic
   linking freely (it already does).
4. **"PARA's folder instability is a critical weakness."** *(0-3 ✗)* — Items
   moving between buckets as priorities change isn't a fatal flaw; don't
   over-engineer rigid placement to "fix" a non-problem.

---

## 6. Open questions / decisions for future sprints
- **Lowest-friction promotion/card-making UX** — can AI auto-suggest a paraphrase
  or connection without adding busywork? (Determines whether P3's AI assist helps
  or hurts.)
- **Topic/coverage gap analysis** for a single-user corpus — worth the complexity,
  or is the simpler retrieval-health view enough? *(Lean: start simple.)*
- **Heatmaps** — do they sustain a *solo* user's motivation, or breed
  streak-anxiety? (Consider making streaks opt-in / non-punitive.)
- **The force-directed graph** — keep, repurpose as a decay/health visualization,
  or de-emphasize? *(Lean: repurpose — see P2.)*
- **FSRS in Rust/SQLite** — which crate/defaults/cadence; how to store review logs
  efficiently.

## 7. Confidence & caveats
- **High confidence:** the learning-science core (retrieval practice, spacing,
  dual-strength storage/retrieval, desirable difficulties) — primary, replicated
  sources.
- **Approximate:** FSRS's "20–30% fewer reviews" is **simulation-derived, not an
  RCT**, and FSRS is fast-moving.
- **Medium confidence:** PKM methodology findings lean on expert blogs, partly
  corroborated by fluency-illusion research; the goal-specificity result is one
  2018 survey (N=167) on an exercise app — suggestive, not definitive.
- **Method:** 6 search angles → 24 sources → 109 claims → 25 verified by 3-vote
  adversarial check (need 2/3 to refute). 21 confirmed, 4 killed, 3 merged
  headline findings.

## 8. Source list (verified set)
**Primary:** Roediger & Karpicke 2006 (testing effect) ·
http://psychnet.wustl.edu/memory/wp-content/uploads/2018/04/Roediger-Karpicke-2006_PPS.pdf
· Bjork & Bjork, desirable difficulties (UNH PDF) ·
https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf
· FSRS "abc" · https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs
· Anki scheduler FAQ · https://faqs.ankiweb.net/what-spaced-repetition-algorithm
· Hamari et al. 2018 (self-tracking & goals) ·
https://link.springer.com/article/10.1007/s11257-018-9200-2
**Practice/blogs:** Zettelkasten — collector's fallacy ·
https://zettelkasten.de/posts/collectors-fallacy/ · Matuschak — evergreen ≈ SRS ·
https://notes.andymatuschak.org/Evergreen_note_maintenance_approximates_spaced_repetition
· PKM anti-patterns · https://www.dsebastien.net/ai-wiki-pkm-pkm-anti-patterns/ ·
stop over-complicating · https://thoughtfulatlas.substack.com/p/stop-over-complicating-note-taking
· Appleton — digital gardens · https://maggieappleton.com/garden/
**Graph view (contested):** in defense ·
https://www.eleanorkonik.com/p/its-not-just-a-pretty-gimmick-in-defense-of-obsidians-graph-view
· critique · https://knowledgestuck.substack.com/p/obsidiangraph ·
https://codeculture.store/blogs/developer-culture/obsidian-graph-view-useful
**Heatmaps (critique):**
https://dev.to/sylwia-lask/your-github-contribution-graph-means-absolutely-nothing-and-heres-why-2kjc
· https://github.com/isaacs/github/issues/627
**Comparable apps:** https://otio.ai/blog/heptabase-vs-obsidian ·
https://www.lindy.ai/blog/obsidian-alternatives ·
https://markmcelroy.com/choosing-between-logseq-and-obsidian/ · FSRS benchmark ·
https://expertium.github.io/Benchmark.html
