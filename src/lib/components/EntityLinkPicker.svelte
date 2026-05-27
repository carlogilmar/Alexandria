<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

  type LinkKind = "note" | "list" | "workflow" | "article";
  type Item = { kind: LinkKind; id: number; title: string; sub: string };

  type Props = {
    // Receives the markdown link snippet to insert, e.g. "[My note](note:5)".
    onPick: (snippet: string) => void;
    onClose: () => void;
  };
  let { onPick, onClose }: Props = $props();

  let query = $state("");
  let searchInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    queueMicrotask(() => searchInput?.focus());
  });

  const KIND_HUE: Record<LinkKind, number> = {
    note: 217,
    article: 268,
    workflow: 32,
    list: 152,
  };

  // Flatten the store's entity summaries into one searchable list. Archived
  // items are excluded — you don't link to something you've filed away.
  let items = $derived.by<Item[]>(() => {
    const out: Item[] = [];
    for (const n of app.notes) {
      if (n.archived) continue;
      out.push({ kind: "note", id: n.id, title: n.title, sub: n.date });
    }
    for (const a of app.articles) {
      if (a.archived) continue;
      out.push({ kind: "article", id: a.id, title: a.title, sub: "article" });
    }
    for (const w of app.workflows) {
      if (w.archived) continue;
      out.push({
        kind: "workflow",
        id: w.id,
        title: w.title,
        sub: `${w.stepCount} ${w.stepCount === 1 ? "step" : "steps"}`,
      });
    }
    for (const l of app.lists) {
      if (l.archived) continue;
      out.push({ kind: "list", id: l.id, title: l.title, sub: l.date });
    }
    return out;
  });

  let filtered = $derived.by<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? items.filter(
          (it) =>
            it.title.toLowerCase().includes(q) ||
            it.kind.includes(q) ||
            `${it.kind}:${it.id}`.includes(q),
        )
      : items;
    return base.slice(0, 50);
  });

  function choose(it: Item) {
    const label = it.title.trim() || `${it.kind} ${it.id}`;
    onPick(`[${label}](${it.kind}:${it.id})`);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) choose(filtered[0]);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  role="dialog"
  aria-modal="true"
  aria-label="Insert link to an item"
  class="fixed inset-0 z-50 flex items-start justify-center bg-neutral-900/40 px-4 pt-24 backdrop-blur-sm dark:bg-neutral-950/60"
>
  <button
    type="button"
    aria-label="Close"
    class="absolute inset-0 cursor-default"
    onclick={onClose}
  ></button>

  <div
    class="relative flex max-h-[60vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900"
  >
    <div class="border-b border-neutral-200/70 p-3 dark:border-neutral-700/70">
      <input
        bind:this={searchInput}
        bind:value={query}
        type="text"
        placeholder="Link to a note, list, workflow, or article…"
        class="w-full rounded-md border border-neutral-300/70 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
      />
    </div>

    <div class="flex-1 overflow-y-auto p-1.5">
      {#if filtered.length === 0}
        <p class="px-2 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
          Nothing matches "{query}".
        </p>
      {:else}
        <ul class="flex flex-col">
          {#each filtered as it (it.kind + "-" + it.id)}
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onclick={() => choose(it)}
              >
                <span
                  class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style="background: hsl({KIND_HUE[it.kind]} 70% 55%);"
                ></span>
                <span class="min-w-0 flex-1 truncate text-sm text-neutral-800 dark:text-neutral-200">
                  {it.title.trim() || `${it.kind} ${it.id}`}
                </span>
                <span class="shrink-0 text-[11px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                  {it.kind} · {it.sub}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</div>
