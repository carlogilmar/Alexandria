<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";

  let editor: MarkdownEditor | undefined = $state();
  let activePage = $derived(app.hubPages.find((p) => p.id === app.hubActiveId) ?? null);

  // ⌘E toggles edit/preview on the active page.
  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
      const el = document.activeElement as HTMLElement | null;
      if (el && el.isContentEditable) return;
      e.preventDefault();
      editor?.toggleEdit();
    }
  }

  // Shared inline (contentEditable) rename — prompt() is a no-op in the webview.
  function inlineEdit(el: HTMLElement, onSave: (v: string) => void) {
    const orig = el.textContent ?? "";
    el.contentEditable = "true";
    el.spellcheck = false;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      el.contentEditable = "false";
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("blur", onBlur);
      const v = (el.textContent ?? "").trim();
      if (save && v && v !== orig) onSave(v);
      else el.textContent = orig;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    };
    const onBlur = () => finish(true);
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", onBlur);
  }

  function editHeroTitle(e: MouseEvent) {
    inlineEdit(e.currentTarget as HTMLElement, (v) => app.saveHubMeta(v, app.hubMeta.subtitle));
  }
  function editHeroSub(e: MouseEvent) {
    inlineEdit(e.currentTarget as HTMLElement, (v) => app.saveHubMeta(app.hubMeta.title, v));
  }
  function startRename(e: Event, id: number) {
    inlineEdit(e.currentTarget as HTMLElement, (v) => app.renameHubPage(id, v));
  }

  const DOTS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1"];

  // ----- drag reorder (pointer, like the kanban/planner) -----
  let dragId = $state<number | null>(null);
  function onPillDown(e: PointerEvent, id: number) {
    if ((e.target as HTMLElement).closest("[data-x],[contenteditable='true']")) return;
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) {
        moved = true;
        dragId = id;
      }
      if (!moved) return;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-pill]");
      const overId = over ? Number(over.dataset.pill) : null;
      if (overId !== null && overId !== id) {
        const ids = app.hubPages.map((p) => p.id);
        const from = ids.indexOf(id), to = ids.indexOf(overId);
        if (from >= 0 && to >= 0 && from !== to) {
          ids.splice(to, 0, ids.splice(from, 1)[0]);
          const byId = new Map(app.hubPages.map((p) => [p.id, p] as const));
          app.hubPages = ids.map((i) => byId.get(i)!);
        }
      }
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (moved) void app.reorderHubPages(app.hubPages.map((p) => p.id));
      else app.hubActiveId = id;
      dragId = null;
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<main class="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
  <!-- Hero (editable: double-click the title/subtitle) -->
  <div class="md-hero mb-5">
    <div class="md-hero-ico" aria-hidden="true">🗂️</div>
    <div class="md-hero-eyebrow">Knowledge base</div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="md-hero-title" title="Double-click to edit" ondblclick={editHeroTitle}>{app.hubMeta.title}</div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="md-hero-sub" title="Double-click to edit" ondblclick={editHeroSub}>{app.hubMeta.subtitle}</div>
  </div>

  <!-- Tab bar -->
  <div class="mb-4 flex flex-wrap items-center gap-2">
    {#each app.hubPages as p, i (p.id)}
      {@const on = p.id === app.hubActiveId}
      <button
        type="button"
        data-pill={p.id}
        class="inline-flex cursor-grab select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors {dragId === p.id ? 'opacity-40' : ''} {on ? 'border-transparent text-white' : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'}"
        style={on ? "background-color: var(--accent, #4f46e5)" : ""}
        onpointerdown={(e) => onPillDown(e, p.id)}
        title="Click to open · double-click to rename · drag to reorder"
      >
        <span class="h-2 w-2 shrink-0 rounded-full" style="background:{DOTS[i % DOTS.length]}"></span>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span class="hub-tab-name" ondblclick={(e) => startRename(e, p.id)}>{p.title}</span>
        {#if on}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span data-x role="button" tabindex="-1" class="ml-1 grid h-4 w-4 place-items-center rounded-full text-[10px] text-white/70 hover:bg-white/25 hover:text-white" title="Remove tab" onclick={(e) => { e.stopPropagation(); app.removeHubPage(p.id); }}>✕</span>
        {/if}
      </button>
    {/each}
    <button
      type="button"
      class="rounded-full border border-dashed border-neutral-300 px-3 py-1.5 text-sm font-bold text-neutral-400 transition-colors hover:border-[color-mix(in_srgb,var(--accent,#4f46e5)_50%,transparent)] hover:text-[var(--accent,#4f46e5)] dark:border-neutral-600"
      onclick={() => app.addHubPage()}
      title="Add a tab"
    >＋ Tab</button>
  </div>

  <!-- Active page content -->
  {#if activePage}
    {#key activePage.id}
      <MarkdownEditor
        bind:this={editor}
        value={activePage.body}
        minHeight="52vh"
        placeholder={`Write “${activePage.title}” — full markdown & blocks (marquee, chart, mermaid, timeline…). Click Edit (⌘E) to start.`}
        onCommit={(b) => app.saveHubPageBody(activePage.id, b)}
        floatingEdit
        noBlockEdit
        outline
      />
    {/key}
  {:else}
    <div class="rounded-2xl border border-dashed border-neutral-300 bg-white/40 py-16 text-center text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/30">
      <p class="text-sm font-medium">No tabs yet</p>
      <p class="mt-1 text-xs">Click <b>＋ Tab</b> to create your first category.</p>
    </div>
  {/if}
</main>
