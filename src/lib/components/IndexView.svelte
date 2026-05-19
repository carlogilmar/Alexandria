<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";

  async function commitBody(next: string) {
    await app.saveIndex(next);
  }

  // Internal link handling: support links like "note:<id>", "list:<id>",
  // "workflow:<id>", "article:<id>" to jump to those records inside the app.
  function onLinkClick(href: string): boolean | void {
    const m = href.match(/^(note|list|workflow|article):(\d+)$/);
    if (!m) return;
    const kind = m[1];
    const id = Number(m[2]);
    if (!Number.isFinite(id)) return;
    if (kind === "note") app.selectNote(id);
    else if (kind === "list") app.select(id);
    else if (kind === "workflow") app.selectWorkflow(id);
    else if (kind === "article") app.selectArticle(id);
    return true;
  }
</script>

<main class="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-8 py-10">
  <header class="mb-6">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
      Index
    </h1>
    <p class="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
      One place to summarize what matters. Edit in markdown; link to lists,
      notes, workflows, and articles with <code class="rounded bg-neutral-200/60 px-1 py-0.5 text-[12px] dark:bg-neutral-700/40">list:&lt;id&gt;</code>,
      <code class="rounded bg-neutral-200/60 px-1 py-0.5 text-[12px] dark:bg-neutral-700/40">note:&lt;id&gt;</code>,
      <code class="rounded bg-neutral-200/60 px-1 py-0.5 text-[12px] dark:bg-neutral-700/40">workflow:&lt;id&gt;</code>,
      <code class="rounded bg-neutral-200/60 px-1 py-0.5 text-[12px] dark:bg-neutral-700/40">article:&lt;id&gt;</code>.
    </p>
  </header>

  <MarkdownEditor
    value={app.indexDoc.body}
    placeholder="Start your index — e.g. `## Active workflows` followed by [Onboarding](workflow:1)"
    minHeight="60vh"
    onCommit={commitBody}
    {onLinkClick}
  />
</main>
