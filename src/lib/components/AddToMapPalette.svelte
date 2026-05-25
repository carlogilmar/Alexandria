<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import type { MapEntityKind } from "$lib/ipc";

  // Receives client (screen) coords or nulls — MapEditor converts to flow coords.
  type Props = {
    onAddEntity: (
      kind: MapEntityKind,
      entityId: number,
      clientX: number | null,
      clientY: number | null,
    ) => void;
  };
  let { onAddEntity }: Props = $props();

  // Start collapsed — the palette takes a big chunk of canvas; the user opens
  // it deliberately when they want to add something.
  let collapsed = $state(true);
  let search = $state("");
  let kindFilter = $state<MapEntityKind | "all">("all");

  // light-dark() needs `color-scheme` set on the page (we don't), so compute
  // the tint manually from theme.resolved.
  let isDark = $derived(theme.resolved === "dark");
  function tintFor(kind: MapEntityKind): string {
    const tints: Record<MapEntityKind, [string, string]> = {
      note: ["hsl(217 80% 92%)", "hsl(217 35% 22%)"],
      article: ["hsl(268 80% 94%)", "hsl(268 35% 22%)"],
      workflow: ["hsl(32 80% 90%)", "hsl(32 35% 22%)"],
    };
    return isDark ? tints[kind][1] : tints[kind][0];
  }

  // Set of (kind, entityId) already on the map, derived from store state.
  let placed = $derived.by(() => {
    const s = new Set<string>();
    for (const n of app.mapNodes) s.add(`${n.kind}:${n.entityId}`);
    return s;
  });

  type Candidate = { kind: MapEntityKind; entityId: number; title: string };

  let candidates = $derived.by<Candidate[]>(() => {
    const out: Candidate[] = [];
    for (const a of app.articles) {
      if (placed.has(`article:${a.id}`)) continue;
      out.push({ kind: "article", entityId: a.id, title: a.title });
    }
    for (const n of app.notes) {
      if (placed.has(`note:${n.id}`)) continue;
      out.push({ kind: "note", entityId: n.id, title: n.title });
    }
    for (const w of app.workflows) {
      if (placed.has(`workflow:${w.id}`)) continue;
      out.push({ kind: "workflow", entityId: w.id, title: w.title });
    }
    const q = search.trim().toLowerCase();
    return out.filter(
      (c) =>
        (kindFilter === "all" || c.kind === kindFilter) &&
        (!q || c.title.toLowerCase().includes(q)),
    );
  });

  function onDragStart(e: DragEvent, c: Candidate) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/x-bigpicture-map-item",
      JSON.stringify({ kind: c.kind, entityId: c.entityId }),
    );
    // Do NOT collapse the palette here — collapsing removes the dragged
    // <li> from the DOM mid-drag and some browsers cancel the drag when
    // the source element disappears. The palette will refresh naturally
    // after the drop because the candidate is now placed.
  }

  function addAtCenter(c: Candidate) {
    onAddEntity(c.kind, c.entityId, null, null);
    // Auto-collapse after a successful "+" add so the canvas isn't blocked.
    collapsed = true;
  }

</script>

{#if collapsed}
  <!-- Collapsed: a compact pill so the canvas stays mostly free.
       Positioning is owned by the parent (MapEditor's add-cluster). -->
  <button
    type="button"
    onclick={() => (collapsed = false)}
    class="inline-flex items-center gap-1.5 rounded-md border border-neutral-300/70 bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm backdrop-blur hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800"
    title="Open the palette to drop entities onto the canvas"
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
    </svg>
    Add entity
  </button>
{:else}
<aside
  class="flex max-h-[80vh] w-72 flex-col rounded-lg border border-neutral-200/80 bg-white/95 shadow-xl backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95"
>
  <header class="flex items-center justify-between border-b border-neutral-200/70 px-3 py-2 dark:border-neutral-700/70">
    <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
      Add to map
    </h3>
    <button
      type="button"
      class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
      aria-label="Collapse"
      onclick={() => (collapsed = true)}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
      </svg>
    </button>
  </header>
    <div class="border-b border-neutral-200/70 px-3 py-2 dark:border-neutral-700/70">
      <input
        type="search"
        bind:value={search}
        placeholder="Search title…"
        class="mb-2 w-full rounded-md border border-neutral-300/70 bg-white/70 px-2 py-1 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
      />
      <div class="flex flex-wrap gap-1">
        {#each (["all", "article", "note", "workflow"] as Array<MapEntityKind | "all">) as k}
          <button
            type="button"
            class="rounded-full border px-2 py-0.5 text-[11px] font-medium"
            class:bg-emerald-600={kindFilter === k}
            class:text-white={kindFilter === k}
            class:border-emerald-600={kindFilter === k}
            class:bg-white={kindFilter !== k}
            class:text-neutral-500={kindFilter !== k}
            class:border-neutral-300={kindFilter !== k}
            class:dark:bg-emerald-700={kindFilter === k}
            class:dark:border-emerald-700={kindFilter === k}
            class:dark:bg-neutral-900={kindFilter !== k}
            class:dark:border-neutral-700={kindFilter !== k}
            class:dark:text-neutral-400={kindFilter !== k}
            onclick={() => (kindFilter = k)}
          >
            {k === "all" ? "all" : `${k}s`}
          </button>
        {/each}
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 py-2">
      {#if candidates.length === 0}
        <p class="px-2 py-3 text-center text-xs italic text-neutral-400 dark:text-neutral-500">
          Nothing left to add.
        </p>
      {:else}
        <ul class="flex flex-col gap-1">
          {#each candidates as c (c.kind + ":" + c.entityId)}
            <li
              draggable="true"
              ondragstart={(e) => onDragStart(e, c)}
              class="group flex cursor-grab items-center justify-between gap-2 rounded-md border border-neutral-200/60 px-2 py-1.5 transition-colors hover:border-neutral-300 dark:border-neutral-700/60 dark:hover:border-neutral-600"
              style="background-color: {tintFor(c.kind)};"
            >
              <div class="min-w-0 flex-1">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                  {c.kind}
                </p>
                <p class="truncate text-xs text-neutral-800 dark:text-neutral-200">
                  {c.title}
                </p>
              </div>
              <button
                type="button"
                class="rounded p-1 text-neutral-500 opacity-0 transition-opacity hover:bg-emerald-100 hover:text-emerald-700 group-hover:opacity-100 dark:text-neutral-400 dark:hover:bg-emerald-900 dark:hover:text-emerald-300"
                aria-label="Add to map"
                onclick={() => addAtCenter(c)}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                  <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <footer class="border-t border-neutral-200/70 px-3 py-1.5 text-[11px] text-neutral-400 dark:border-neutral-700/70 dark:text-neutral-500">
      Drag onto the canvas, or press + to drop at center.
    </footer>
</aside>
{/if}
