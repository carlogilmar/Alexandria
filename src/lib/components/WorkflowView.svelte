<script lang="ts">
  import { fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { app } from "$lib/stores/app.svelte";
  import type { WorkflowStep } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";

  let newStepText = $state("");
  let newStepInput: HTMLInputElement | undefined = $state();
  let dragId = $state<number | null>(null);

  // Stage 1 renders only the top-level chain.
  let topLevelSteps = $derived<WorkflowStep[]>(
    app.workflowSteps.filter((s) => s.parentStepId === null),
  );

  // ----- Title rename -----
  let editingTitle = $state(false);
  let titleDraft = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  function startTitleEdit() {
    if (!app.selectedWorkflow) return;
    titleDraft = app.selectedWorkflow.title;
    editingTitle = true;
    queueMicrotask(() => titleInput?.focus());
  }

  async function commitTitleEdit() {
    editingTitle = false;
    const next = titleDraft.trim();
    if (!next || !app.selectedWorkflow || next === app.selectedWorkflow.title) {
      return;
    }
    await app.renameSelectedWorkflow(next);
  }

  function onTitleKey(e: KeyboardEvent) {
    if (e.key === "Enter") commitTitleEdit();
    else if (e.key === "Escape") {
      editingTitle = false;
    }
  }

  async function commitDescription(next: string) {
    await app.updateSelectedDescription(next);
  }

  function onDescriptionLinkClick(href: string): boolean | void {
    const m = href.match(/^(note|list|workflow):(\d+)$/);
    if (!m) return;
    const id = Number(m[2]);
    if (!Number.isFinite(id)) return;
    if (m[1] === "note") app.selectNote(id);
    else if (m[1] === "list") app.select(id);
    else if (m[1] === "workflow") app.selectWorkflow(id);
    return true;
  }

  // ----- Last updated -----
  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC.
  function formatUpdatedAt(raw: string): string {
    const d = new Date(raw.replace(" ", "T") + "Z");
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  // ----- Add step -----
  $effect(() => {
    if (app.selectedWorkflow) {
      queueMicrotask(() => newStepInput?.focus());
    }
  });

  async function handleAddStep(e: SubmitEvent) {
    e.preventDefault();
    const text = newStepText.trim();
    if (!text) return;
    await app.addWorkflowStep(text);
    newStepText = "";
    queueMicrotask(() => newStepInput?.focus());
  }

  // ----- Pointer-based reorder (same pattern as todos) -----
  function handlePointerDown(id: number, e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    dragId = id;
  }

  function findStepIdUnderPointer(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const li = el?.closest("li[data-step-id]");
    if (!li) return null;
    const id = Number(li.getAttribute("data-step-id"));
    return Number.isFinite(id) ? id : null;
  }

  function handlePointerMove(e: PointerEvent) {
    if (dragId === null) return;
    const targetId = findStepIdUnderPointer(e.clientX, e.clientY);
    if (targetId === null || targetId === dragId) return;
    const fromIdx = topLevelSteps.findIndex((s) => s.id === dragId);
    const toIdx = topLevelSteps.findIndex((s) => s.id === targetId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    const next = topLevelSteps.slice();
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    app.reorderWorkflowStepsLocal(next.map((s) => s.id));
  }

  async function handlePointerUp() {
    if (dragId === null) return;
    dragId = null;
    await app.commitWorkflowReorder();
  }

  $effect(() => {
    if (dragId === null) return;
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  // ----- Inline step edit -----
  let editingStepId = $state<number | null>(null);
  let editingStepInput: HTMLInputElement | undefined = $state();

  function startStepEdit(id: number) {
    editingStepId = id;
    queueMicrotask(() => {
      editingStepInput?.focus();
      editingStepInput?.select();
    });
  }

  async function commitStepEdit(step: WorkflowStep, draft: string) {
    editingStepId = null;
    const next = draft.trim();
    if (!next || next === step.text) return;
    await app.editWorkflowStep(step.id, next);
  }

  function onStepKey(step: WorkflowStep, e: KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      (e.target as HTMLInputElement).value = step.text;
      editingStepId = null;
    }
  }

  // ----- Backtick-tag parser -----
  // "review `Q2 budget` with `Sam`" → [text, tag, text, tag]
  type Segment = { type: "text" | "tag"; value: string };

  function parseSegments(text: string): Segment[] {
    const segments: Segment[] = [];
    const regex = /`([^`]+)`/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      if (m.index > lastIndex) {
        segments.push({ type: "text", value: text.slice(lastIndex, m.index) });
      }
      segments.push({ type: "tag", value: m[1] });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", value: text.slice(lastIndex) });
    }
    if (segments.length === 0) {
      segments.push({ type: "text", value: text });
    }
    return segments;
  }
</script>

{#if app.selectedWorkflow}
  <main class="mx-auto flex min-h-screen w-full max-w-2xl flex-col px-8 py-10">
    <header class="mb-6 flex items-start justify-between gap-4">
      <div class="min-w-0 flex-1">
        <p
          class="mb-1 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
        >
          Workflow
        </p>
        {#if editingTitle}
          <input
            bind:this={titleInput}
            bind:value={titleDraft}
            onblur={commitTitleEdit}
            onkeydown={onTitleKey}
            class="w-full rounded-md border-none bg-transparent px-1 py-0 text-2xl font-semibold tracking-tight text-neutral-900 outline-none ring-2 ring-blue-500/40 focus:ring-blue-500 dark:text-neutral-100"
          />
        {:else}
          <button
            type="button"
            class="truncate rounded-md text-left text-2xl font-semibold tracking-tight text-neutral-900 transition-colors hover:bg-neutral-200/40 dark:text-neutral-100 dark:hover:bg-neutral-700/30"
            onclick={startTitleEdit}
          >
            {app.selectedWorkflow.title}
          </button>
        {/if}
        <p class="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
          <span>
            {topLevelSteps.length}
            {topLevelSteps.length === 1 ? "step" : "steps"}
          </span>
          <span aria-hidden="true">·</span>
          <span>Updated {formatUpdatedAt(app.selectedWorkflow.updatedAt)}</span>
          <IdChip kind="workflow" id={app.selectedWorkflow.id} />
        </p>
      </div>
      <button
        type="button"
        class="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        aria-label="Delete this workflow"
        onclick={() => app.deleteSelectedWorkflow()}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path
            fill-rule="evenodd"
            d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </header>

    {#if topLevelSteps.length === 0}
      <div
        class="mb-6 rounded-xl border border-dashed border-neutral-300/60 px-6 py-8 text-center text-neutral-400 dark:border-neutral-700/60 dark:text-neutral-500"
      >
        <p class="text-sm">No steps yet.</p>
        <p class="mt-1 text-xs">
          Add the first link in the chain below. Wrap words in
          <code class="rounded bg-neutral-200/60 px-1 dark:bg-neutral-700/60">`backticks`</code>
          to render them as tags.
        </p>
      </div>
    {:else}
      <ol class="chain mb-6">
        {#each topLevelSteps as step, i (step.id)}
          <li
            data-step-id={step.id}
            animate:flip={{ duration: 200 }}
            in:fade={{ duration: 150 }}
            out:fade={{ duration: 120 }}
            class="chain-item group flex items-start gap-3 pb-5"
            class:opacity-40={dragId === step.id}
          >
            <span
              role="button"
              tabindex="-1"
              aria-label="Drag to reorder"
              title="Drag to reorder"
              onpointerdown={(e) => handlePointerDown(step.id, e)}
              class="bullet relative z-10 mt-0.5 flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white shadow-sm transition-colors active:cursor-grabbing dark:bg-blue-500"
              style="cursor: grab;"
            >
              {i + 1}
            </span>
            <div class="min-w-0 flex-1 pt-1">
              {#if editingStepId === step.id}
                <input
                  bind:this={editingStepInput}
                  value={step.text}
                  onblur={(e) =>
                    commitStepEdit(step, (e.target as HTMLInputElement).value)}
                  onkeydown={(e) => onStepKey(step, e)}
                  class="w-full rounded-md border-none bg-transparent px-1 py-0.5 text-[15px] leading-snug text-neutral-800 outline-none ring-2 ring-blue-500/30 focus:ring-blue-500/50 dark:text-neutral-100"
                />
              {:else}
                <button
                  type="button"
                  onclick={() => startStepEdit(step.id)}
                  class="block w-full rounded-md px-1 py-0.5 text-left text-[15px] leading-snug text-neutral-800 transition-colors hover:bg-neutral-200/30 dark:text-neutral-100 dark:hover:bg-neutral-700/30"
                >
                  {#each parseSegments(step.text) as seg, j (j)}
                    {#if seg.type === "tag"}
                      <span
                        class="mx-0.5 inline-flex items-center rounded-md bg-blue-100/70 px-1.5 py-0.5 text-[13px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        >{seg.value}</span
                      >
                    {:else}<span>{seg.value}</span>{/if}
                  {/each}
                </button>
              {/if}
            </div>
            <button
              type="button"
              class="mt-1 rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              aria-label="Remove step"
              onclick={() => app.removeWorkflowStep(step.id)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </li>
        {/each}
      </ol>
    {/if}

    <form onsubmit={handleAddStep} class="flex items-center gap-3">
      <span
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-neutral-300 text-xs font-semibold text-neutral-400 dark:border-neutral-600 dark:text-neutral-500"
      >
        +
      </span>
      <input
        bind:this={newStepInput}
        bind:value={newStepText}
        type="text"
        placeholder="Add a step… (wrap parts in `backticks` to tag them)"
        class="flex-1 rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 text-[15px] outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      />
    </form>

    <section class="mt-10 border-t border-neutral-200/60 pt-6 dark:border-neutral-700/60">
      <h2
        class="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      >
        Notes about this workflow
      </h2>
      {#key app.selectedWorkflow.id}
        <MarkdownEditor
          value={app.selectedWorkflow.description ?? ""}
          placeholder="Add context, links, or longer notes… (markdown supported, click outside to render)"
          minHeight="8rem"
          onCommit={commitDescription}
          onLinkClick={onDescriptionLinkClick}
        />
      {/key}
    </section>
  </main>
{/if}

<style>
  /* Vertical chain connector between bullets. The line is anchored to the
     left of each item and reaches into the next sibling. */
  .chain-item {
    position: relative;
  }
  .chain-item:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 13px; /* bullet center: padding + half of 28px */
    top: 30px; /* below the bullet */
    bottom: -4px;
    width: 2px;
    background: linear-gradient(
      to bottom,
      rgb(59 130 246 / 0.6),
      rgb(59 130 246 / 0.25)
    );
    border-radius: 1px;
  }
  @media (prefers-color-scheme: dark) {
    .chain-item:not(:last-child)::before {
      background: linear-gradient(
        to bottom,
        rgb(96 165 250 / 0.55),
        rgb(96 165 250 / 0.2)
      );
    }
  }
</style>
