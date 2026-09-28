<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Tag, Todo, TodoStatus } from "$lib/ipc";
  import IdChip from "$lib/components/IdChip.svelte";
  import MarkdownEditor from "$lib/components/MarkdownEditor.svelte";
  import { fmtAge, fmtSpan, fmtWork, liveWorkSeconds, tagColor } from "$lib/tasktime";

  type Props = { todo: Todo };
  let { todo }: Props = $props();

  let textDraft = $state("");
  let tagInput = $state("");
  let highlightIdx = $state(0);
  let tagListEl: HTMLUListElement | undefined = $state();

  // Description editor instance — ⌘E toggles it (same as NoteView).
  let descEditor: MarkdownEditor | undefined = $state();

  // Manual work-time editor.
  let editingTime = $state(false);
  let timeH = $state(0);
  let timeM = $state(0);

  // Live clock so the tracked-time readout ticks while the task is in progress.
  let now = $state(Date.now());
  $effect(() => {
    if (todo.status !== "wip") return;
    now = Date.now();
    const id = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(id);
  });

  const STATUS_META: Record<TodoStatus, { label: string; cls: string }> = {
    open: {
      label: "To do",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    },
    wip: {
      label: "In progress",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    },
    done: {
      label: "Done",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    },
  };

  let workText = $derived(fmtWork(liveWorkSeconds(todo, now)));
  let ageText = $derived(
    todo.status === "done"
      ? fmtSpan(todo.createdAt, todo.completedAt)
      : fmtAge(todo.createdAt, now),
  );

  function openTimeEdit() {
    const total = Math.round(liveWorkSeconds(todo, now));
    timeH = Math.floor(total / 3600);
    timeM = Math.floor((total % 3600) / 60);
    editingTime = true;
  }
  async function saveTime() {
    const secs = Math.max(0, (Number(timeH) || 0) * 3600 + (Number(timeM) || 0) * 60);
    editingTime = false;
    await app.setTodoWorkSeconds(todo, secs);
  }

  // ⌘E toggles the description editor between edit and preview — contextual to
  // the open task, matching the note editor's shortcut. Skips while typing in
  // the title / tag / time fields so it doesn't hijack those.
  function onWindowKey(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT")) return;
      e.preventDefault();
      descEditor?.toggleEdit();
    }
  }

  // Sync the title draft from the prop. Inspector is wrapped in {#key} on the
  // parent so this effectively runs once per selected todo.
  $effect(() => {
    textDraft = todo.text;
  });

  let suggestions = $derived.by<Tag[]>(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const already = new Set(app.selectedTodoTags.map((t) => t.name));
    return app.allTags
      .filter((t) => !already.has(t.name) && t.name.toLowerCase().includes(q))
      .slice(0, 5);
  });

  $effect(() => {
    if (suggestions.length === 0) highlightIdx = 0;
    else if (highlightIdx >= suggestions.length)
      highlightIdx = suggestions.length - 1;
  });

  function close() {
    app.selectTodo(null);
  }

  async function commitText() {
    const next = textDraft.trim();
    if (!next || next === todo.text) {
      textDraft = todo.text;
      return;
    }
    await app.updateSelectedText(next);
  }

  async function commitNotes(next: string) {
    if ((next ?? "") === (todo.notes ?? "")) return;
    await app.updateSelectedNotes(next);
  }

  async function commitTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await app.addTagToSelected(trimmed);
    tagInput = "";
    highlightIdx = 0;
  }

  async function onTagKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length > 0) {
        const chosen = suggestions[highlightIdx] ?? suggestions[0];
        await commitTag(chosen.name);
      } else if (tagInput.trim()) {
        await commitTag(tagInput);
      }
    } else if (e.key === "ArrowDown") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      highlightIdx = (highlightIdx + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      e.preventDefault();
      highlightIdx =
        (highlightIdx - 1 + suggestions.length) % suggestions.length;
    } else if (e.key === "Escape") {
      if (tagInput) {
        e.preventDefault();
        e.stopPropagation();
        tagInput = "";
      }
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<!-- Task detail modal (was a right sidebar). Esc closes it via the global
     handler in +page.svelte; backdrop click closes here. -->
<div
  role="dialog"
  aria-modal="true"
  aria-label="Task details"
  class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-sm dark:bg-black/50"
>
  <button
    type="button"
    class="absolute inset-0 cursor-default"
    aria-label="Close"
    onclick={close}
  ></button>

  <div
    class="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-neutral-200/80 bg-white shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900"
  >
    <header
      class="flex shrink-0 items-center gap-2 border-b border-neutral-200/60 px-5 py-3 dark:border-neutral-700/60"
    >
      <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
        Task
      </h2>
      <IdChip kind="todo" id={todo.id} />
      <span class="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide {STATUS_META[todo.status].cls}">
        {STATUS_META[todo.status].label}
      </span>
      <button
        type="button"
        class="ml-auto rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
        aria-label="Close details"
        onclick={close}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <!-- Title -->
      <input
        bind:value={textDraft}
        onblur={commitText}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") {
            e.stopPropagation();
            textDraft = todo.text;
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Task title"
        class="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold tracking-tight text-neutral-900 outline-none transition-colors hover:bg-neutral-100/60 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/20 dark:text-neutral-100 dark:hover:bg-neutral-800/60 dark:focus:bg-neutral-900"
        class:line-through={todo.status === "done"}
      />

      <!-- Status controls + flow time (Sprint 69) -->
      <div class="mt-3 flex flex-wrap items-center gap-2">
        {#if todo.status === "open"}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600"
            onclick={() => app.setTodoStatus(todo, "wip")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path d="M6.3 3.84A1 1 0 004.8 4.7v10.6a1 1 0 001.5.86l9-5.3a1 1 0 000-1.72l-9-5.3z"/></svg>
            Start
          </button>
        {:else if todo.status === "wip"}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300"
            onclick={() => app.setTodoStatus(todo, "open")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path d="M6 4a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1zm8 0a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1z"/></svg>
            Pause
          </button>
        {/if}
        {#if todo.status !== "done"}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
            onclick={() => app.setTodoStatus(todo, "done")}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            Mark done
          </button>
        {:else}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            onclick={() => app.setTodoStatus(todo, "open")}
          >
            Reopen
          </button>
        {/if}

        {#if editingTime}
          <span class="ml-auto inline-flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <input
              type="number" min="0" bind:value={timeH}
              onkeydown={(e) => { if (e.key === "Enter") saveTime(); else if (e.key === "Escape") { e.stopPropagation(); editingTime = false; } }}
              class="w-12 rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-right tabular-nums outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />h
            <input
              type="number" min="0" max="59" bind:value={timeM}
              onkeydown={(e) => { if (e.key === "Enter") saveTime(); else if (e.key === "Escape") { e.stopPropagation(); editingTime = false; } }}
              class="w-12 rounded-md border border-neutral-200 bg-white px-1.5 py-1 text-right tabular-nums outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />m
            <button type="button" class="rounded-md bg-blue-600 px-2 py-1 font-medium text-white hover:bg-blue-700" onclick={saveTime}>Save</button>
            <button type="button" class="rounded-md px-1.5 py-1 hover:text-neutral-800 dark:hover:text-neutral-100" aria-label="Cancel" onclick={() => (editingTime = false)}>✕</button>
          </span>
        {:else}
          <span class="ml-auto flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-500">
            {#if ageText}
              <span class="tabular-nums">
                {todo.status === "done" ? `lived ${ageText}` : `${ageText} old`}
              </span>
            {/if}
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md px-1 py-0.5 tabular-nums transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Edit tracked time"
              onclick={openTimeEdit}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 opacity-70"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V6z" clip-rule="evenodd"/></svg>
              {workText || "add time"}
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-2.5 w-2.5 opacity-50"><path d="M13.586 3.586a2 2 0 112.828 2.828l-8.5 8.5a2 2 0 01-.878.506l-3.02.86.86-3.02a2 2 0 01.506-.878l8.5-8.5z"/></svg>
            </button>
          </span>
        {/if}
      </div>

      <!-- Description — same click-to-edit markdown editor as notes/articles. -->
      <div class="mt-4">
        <p class="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Description
        </p>
        {#key todo.id}
          <MarkdownEditor
            bind:this={descEditor}
            value={todo.notes ?? ""}
            minHeight="9rem"
            placeholder="Add a description — click Edit (or ⌘E) to write markdown. Links, ```mermaid diagrams and - [ ] checklists all work."
            onCommit={commitNotes}
            floatingEdit
            floatingContained
          />
        {/key}
      </div>

      <!-- Tags -->
      <div class="relative mt-6">
        <p class="mb-1.5 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          Tags
        </p>
        <div class="mb-2 flex flex-wrap gap-1">
          {#each app.selectedTodoTags as tag (tag.id)}
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
              style="background-color: {tagColor(tag)}1f; color: {tagColor(tag)};"
            >
              <span class="h-1.5 w-1.5 rounded-full" style="background-color: {tagColor(tag)};"></span>
              {tag.name}
              <button
                type="button"
                class="opacity-70 transition-opacity hover:opacity-100"
                aria-label="Remove tag"
                onclick={() => app.removeTagFromSelected(tag.id)}
              >
                ×
              </button>
            </span>
          {/each}
        </div>
        <input
          bind:value={tagInput}
          onkeydown={onTagKey}
          placeholder="Add tag and press Enter"
          autocomplete="off"
          class="w-full rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1 text-xs outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
        />
        {#if suggestions.length > 0}
          <ul
            bind:this={tagListEl}
            class="absolute bottom-full left-0 right-0 z-10 mb-1 overflow-hidden rounded-md border border-neutral-200/80 bg-white/95 py-1 text-xs shadow-lg backdrop-blur dark:border-neutral-700/80 dark:bg-neutral-900/95"
          >
            {#each suggestions as s, i (s.id)}
              <li>
                <button
                  type="button"
                  class="block w-full px-2 py-1 text-left text-neutral-700 dark:text-neutral-200"
                  class:bg-blue-100={highlightIdx === i}
                  class:dark:bg-blue-900={highlightIdx === i}
                  onmouseenter={() => (highlightIdx = i)}
                  onclick={() => commitTag(s.name)}
                >
                  #{s.name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
</div>
