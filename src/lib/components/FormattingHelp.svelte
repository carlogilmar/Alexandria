<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

  function close() {
    app.formattingHelpOpen = false;
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  type Row = { syntax: string; does: string };
  type Section = { title: string; rows: Row[] };

  const sections: Section[] = [
    {
      title: "Text",
      rows: [
        { syntax: "**bold**  *italic*  ~~strike~~  ++underline++  `code`", does: "Basic emphasis" },
        { syntax: "{blue|colored text}", does: "Colored text (red, orange, amber, green, teal, blue, violet, pink, gray)" },
        { syntax: "==highlight==", does: "Yellow highlighter" },
        { syntax: "## {blue|Heading}", does: "Color works inside headings too" },
        { syntax: ":jira:  :database:  :docker:", does: "Inline icon — concept line icons + brand logos. See “Icons” below (or the Insert icon button)." },
      ],
    },
    {
      title: "Blocks",
      rows: [
        { syntax: "# H1  ## H2  ### H3", does: "Headings" },
        { syntax: "- item / 1. item (indent to nest)", does: "Lists — nested get distinct bullets / a,b,c" },
        { syntax: "| A | B |\\n| --- | --- |", does: "Tables (header row is styled)" },
        { syntax: "> [!NOTE]  (or TIP / WARNING / COMMENT)", does: "Callout panels — a blockquote whose first line is [!TYPE]" },
        { syntax: "## > Section title", does: "Toggle section — a heading starting with `>` becomes a collapsible block (collapsed by default). Its body is everything down to the next same-or-higher heading. Click the heading to expand/collapse. Slash command: Toggle section." },
        { syntax: "- [ ] task  /  - [x] done", does: "Task checkbox — click it in the preview to toggle; done tasks strike through" },
        { syntax: "```elixir … ```", does: "Code block with syntax highlighting (elixir, js, ts, python, rust, sql, bash, json, html, css, yaml)" },
        { syntax: "```mermaid … ```", does: "Renders a diagram inline" },
        { syntax: "```cards … ```", does: "Grid of link cards — build dashboards. See “Cards” below (or the Insert cards button)" },
        { syntax: "```chart … ```", does: "Inline bar / donut / line chart — `type: bar|donut|line`, `title:`, then `Label: number` lines. See “Charts” below." },
        { syntax: "```marquee blue fast … ```", does: "Scrolling colored banner — see “Marquee banner” (speeds) and “Colors & gradients” below." },
        { syntax: "```progress … ```", does: "Labeled progress bars, with live −/+ counters — see “Progress bars” below." },
        { syntax: "```treemap … ```", does: "Squares sized by value — see “Treemap” below." },
        { syntax: "```lettering blue … ```", does: "Big, centered display-type title (Oswald) for announcements. Optional color/gradient (a gradient becomes gradient text). Each line is centered." },
        { syntax: "```workflow … ```", does: "A numbered chain of steps (one per line). Wrap parts in `backticks` to tag them. Slash command: Workflow." },
        { syntax: "```files … ```", does: "Changed-files list for PR/code docs — one file per line: `M path — note`. Status A/M/D/R → a colored `new`/`edit`/`delete`/`rename` label; path shows dir/name; the note is a black description row with inline markdown. End a line with `pulse` to make that file breathe. Slash command: Changed files." },
        { syntax: "```stats [theme] … ```", does: "A row of metric cards — one `Label: value` per line (`+N`/`-N` colored). Optional surface theme (github [default] · light · dark · midnight · slate) + a `heading:` line adds a GitHub-style header bar. End a line with `pulse` to make that card breathe. Slash command: Stat cards." },
        { syntax: "```spec [theme] … ```", does: "A spec sheet — one `Label: value` per line; values take inline markdown (`code`, **bold**, links). Optional surface theme (github [default] · light · dark · midnight · slate) + a `heading:` line adds a header bar. End a line with `pulse` to make that row breathe. Slash command: Spec sheet." },
        { syntax: "```terminal <title> … ```", does: "A console window (title bar = the fence text); lines starting with `$` are commands. Add `animated` to stream the lines in (GIF). Slash command: Terminal." },
        { syntax: "```tree <title> … ```", does: "A file/directory tree — indent = depth; tag a line with `- new` (green) or `- edit` (amber). End a line with `pulse` and its text breathes (GIF). Slash command: File tree." },
        { syntax: "```flow <title> … ```", does: "A linear pipeline — one node per line `Name: sublabel`. ≤4 nodes go horizontal, 5+ vertical; a marker traces the path (GIF). Slash command: Flow." },
        { syntax: "```compare <title> … ```", does: "Before / after, split by a `---` line — cross-fades in place (GIF). Great for a query / config change. Slash command: Before / after." },
        { syntax: "hover a block → 📷 / GIF", does: "files / stats / spec / cards / terminal / tree / flow / compare show a “copy as image” (PNG) button; motion blocks also show a “GIF” button that saves the looping animation to drag into a PR." },
        { syntax: "--- ", does: "A divider line" },
      ],
    },
    {
      title: "Links & embeds",
      rows: [
        { syntax: "[label](note:5)", does: "Link to a note / list / flashcard / blueprint (use the link button)" },
        { syntax: "{{note:5}}  (own line)", does: "Embed a note / list / todo / flashcard inline" },
        { syntax: "![alt](url)  or paste an image", does: "Image (also via Insert image)" },
      ],
    },
    {
      title: "Cards (dashboards)",
      rows: [
        { syntax: "```cards … ```", does: "A grid of clickable tiles. One card per block, blocks separated by a --- line. Use the Insert cards button for a template." },
        { syntax: "heading: … (first block)", does: "Optional GitHub-style header bar above the grid — a `heading:` (+ optional `desc:`) as the very first block, before the first ---. Shows the title, subtitle, and card count; wraps the grid in a panel." },
        { syntax: "title: My site", does: "Card heading (the only required field)" },
        { syntax: "desc: Short description", does: "Small description line" },
        { syntax: "link: https://…  or  blueprint:12", does: "External URL (opens in browser) or an internal entity note/list/flashcard/blueprint:id (opens in-app). Omit for a non-clickable card." },
        { syntax: "color: blue", does: "Tint: red · orange · amber · green · teal · blue · violet · pink · gray · black.  Gradients: sunset · ocean · forest · dusk · candy" },
        { syntax: "filled: true", does: "Bold, darker saturated background with white text (solid colors only)" },
        { syntax: "icon: 📊", does: "Any emoji, shown top-left" },
      ],
    },
    {
      title: "Charts",
      rows: [
        { syntax: "```chart … ```", does: "An inline chart from a few lines. Config lines + `Label: number` data lines. Use the Bar / Donut chart slash commands for a template." },
        { syntax: "type: bar", does: "Chart kind: bar · donut (alias pie) · line. Default bar." },
        { syntax: "title: Weekly commits", does: "Optional heading above the chart" },
        { syntax: "color: blue", does: "Accent for bar / line — any shared color or gradient (see “Colors & gradients”). Donut colors each slice automatically." },
        { syntax: "Mon: 5", does: "A data point — any `Label: number` line. Order is preserved; negatives / non-numbers are skipped." },
      ],
    },
    {
      title: "Marquee banner",
      rows: [
        { syntax: "```marquee <color> <speed> … ```", does: "A scrolling colored banner (right→left). Put the options after `marquee`; the fence body is the text. Both options are optional." },
        { syntax: "speeds", does: "slow · normal · fast. Default normal." },
        { syntax: "```marquee candy fast … ```", does: "Example — a candy gradient scrolling fast. Hover to pause." },
      ],
    },
    {
      title: "Progress bars",
      rows: [
        { syntax: "```progress … ```", does: "One labeled bar per `Label: value` line. Use the Progress bars slash command for a template." },
        { syntax: "Tasks: 4/10", does: "Value as a fraction (4/10), a percent (60%), or a bare 0–100." },
        { syntax: "Reading: 60% teal", does: "Optional trailing color or gradient (see “Colors & gradients”)." },
        { syntax: "−  /  +  (fraction bars)", does: "In notes a `n/d` bar shows −/+ buttons — click to step the count; it saves." },
        { syntax: "at 100%", does: "The bar turns solid green and shows COMPLETE." },
      ],
    },
    {
      title: "Treemap",
      rows: [
        { syntax: "```treemap <color> … ```", does: "Squares sized by value; one `Label: value` per line. Slash command: Treemap." },
        { syntax: "```treemap violet animated", does: "Fence options: a color/gradient + `animated` (pulse every cell)." },
        { syntax: "Tests: 18 amber", does: "Per line: a color/gradient recolors just that square." },
        { syntax: "Frontend: 42 highlight", does: "`highlight` (or `accent`) gives that square an automatic distinct color." },
        { syntax: "Config: 5 animated", does: "`animated` pulses just that square. Flags combine, e.g. `highlight animated`." },
      ],
    },
    {
      title: "Colors & gradients",
      rows: [
        { syntax: "the shared palette", does: "The SAME names work in cards, charts, marquee, progress & treemap." },
        { syntax: "solid colors", does: "red · orange · amber · green · teal · blue · violet · pink · gray · black. Default blue." },
        { syntax: "gradients", does: "sunset · ocean · forest · dusk · candy — use any one in place of a color." },
      ],
    },
    {
      title: "Icons",
      rows: [
        { syntax: ":name:", does: "Inline icon, sized to the text and tinting with it. Use the Insert icon button (or the / menu) to browse & search — it inserts the shortcode for you." },
        { syntax: "concepts", does: "Line icons that follow the text color: database, server, git-branch, terminal, cloud, bug, ticket, kanban, flag, bell, calendar, check, tag … (the Concepts tab)." },
        { syntax: "logos", does: "Full-color brand marks: jira, confluence, trello, slack, figma, gitlab, bitbucket, docker, elixir … (the Logos tab)." },
        { syntax: "unknown :x:", does: "An unrecognized name is left as plain text — so URLs and times (`10:30`) are untouched." },
      ],
    },
  ];
</script>

<svelte:window onkeydown={onKey} />

<button type="button" aria-label="Close" class="fixed inset-0 z-[82] cursor-default bg-neutral-900/40 backdrop-blur-sm dark:bg-neutral-950/60" onclick={close}></button>
<div class="fixed left-1/2 top-[10vh] z-[83] w-full max-w-lg -translate-x-1/2 px-4">
  <div class="overflow-hidden rounded-xl border border-neutral-200/70 bg-white shadow-2xl dark:border-neutral-700/70 dark:bg-neutral-900">
    <header class="flex items-center justify-between border-b border-neutral-200/70 px-5 py-3 dark:border-neutral-700/70">
      <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Formatting</h2>
      <button type="button" class="rounded-md p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-700/40" aria-label="Close" onclick={close}>
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
      </button>
    </header>
    <div class="max-h-[68vh] overflow-y-auto px-5 py-3">
      {#each sections as s (s.title)}
        <h3 class="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500 first:mt-0">{s.title}</h3>
        <ul class="flex flex-col gap-1.5">
          {#each s.rows as r (r.syntax)}
            <li class="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
              <code class="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[12px] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">{r.syntax}</code>
              <span class="text-xs text-neutral-500 dark:text-neutral-400">{r.does}</span>
            </li>
          {/each}
        </ul>
      {/each}
    </div>
  </div>
</div>
