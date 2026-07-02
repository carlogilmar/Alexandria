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
        { syntax: "**bold**  *italic*  ~~strike~~  `code`", does: "Basic emphasis" },
        { syntax: "{blue|colored text}", does: "Colored text (red, orange, amber, green, teal, blue, violet, pink, gray)" },
        { syntax: "==highlight==", does: "Yellow highlighter" },
        { syntax: "## {blue|Heading}", does: "Color works inside headings too" },
      ],
    },
    {
      title: "Blocks",
      rows: [
        { syntax: "# H1  ## H2  ### H3", does: "Headings" },
        { syntax: "- item / 1. item (indent to nest)", does: "Lists — nested get distinct bullets / a,b,c" },
        { syntax: "| A | B |\\n| --- | --- |", does: "Tables (header row is styled)" },
        { syntax: "> [!NOTE]  (or TIP / WARNING / COMMENT)", does: "Callout panels — a blockquote whose first line is [!TYPE]" },
        { syntax: "- [ ] task  /  - [x] done", does: "Task checkbox — click it in the preview to toggle; done tasks strike through" },
        { syntax: "```elixir … ```", does: "Code block with syntax highlighting (elixir, js, ts, python, rust, sql, bash, json, html, css, yaml)" },
        { syntax: "```mermaid … ```", does: "Renders a diagram inline" },
        { syntax: "--- ", does: "A divider line" },
      ],
    },
    {
      title: "Links & embeds",
      rows: [
        { syntax: "[label](note:5)", does: "Link to a note / article / workflow / list / flashcard / blueprint (use the link button)" },
        { syntax: "{{note:5}}  (articles only, own line)", does: "Embed a note / article / workflow / list / todo / flashcard inline" },
        { syntax: "![alt](url)  or paste an image", does: "Image (also via Insert image)" },
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
