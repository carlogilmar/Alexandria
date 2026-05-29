<script lang="ts">
  import MarkdownIt from "markdown-it";
  import { app } from "$lib/stores/app.svelte";
  import {
    articleById,
    listById,
    listTodos,
    listWorkflowSteps,
    noteById,
    workflowById,
    type Article,
    type List,
    type Note,
    type Todo,
    type Workflow,
    type WorkflowStep,
  } from "$lib/ipc";

  type Props = {
    kind: "note" | "list" | "workflow" | "todo" | "article";
    id: number;
  };
  let { kind, id }: Props = $props();

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  });

  let loading = $state(true);
  let error = $state<string | null>(null);

  // Per-kind data
  let note = $state<Note | null>(null);
  let list = $state<List | null>(null);
  let listTodosData = $state<Todo[]>([]);
  let workflow = $state<Workflow | null>(null);
  let workflowSteps = $state<WorkflowStep[]>([]);
  let todo = $state<Todo | null>(null);
  let todoListTitle = $state<string | null>(null);
  let article = $state<Article | null>(null);

  $effect(() => {
    loading = true;
    error = null;
    note = null;
    list = null;
    listTodosData = [];
    workflow = null;
    workflowSteps = [];
    todo = null;
    todoListTitle = null;
    article = null;

    (async () => {
      try {
        if (kind === "note") {
          note = await noteById(id);
        } else if (kind === "list") {
          list = await listById(id);
          listTodosData = await listTodos(id);
        } else if (kind === "workflow") {
          workflow = await workflowById(id);
          workflowSteps = await listWorkflowSteps(id);
        } else if (kind === "todo") {
          // Find via the cached hit list — gives us the list context.
          const hit = app.allTodos.find((t) => t.id === id);
          if (hit) {
            todoListTitle = hit.listTitle;
            todo = {
              id: hit.id,
              listId: hit.listId,
              text: hit.text,
              notes: null,
              completed: hit.completed,
              position: 0,
              createdAt: "",
              updatedAt: "",
            };
          } else {
            error = `todo ${id} not found`;
          }
        } else if (kind === "article") {
          article = await articleById(id);
        }
      } catch (e) {
        error = String(e);
      } finally {
        loading = false;
      }
    })();
  });

  let topLevelSteps = $derived(
    workflowSteps.filter((s) => s.parentStepId === null),
  );

  function open() {
    if (kind === "note") app.selectNote(id);
    else if (kind === "list") app.select(id);
    else if (kind === "workflow") app.selectWorkflow(id);
    else if (kind === "article") app.selectArticle(id);
    else if (kind === "todo" && todo) app.select(todo.listId);
  }
</script>

<aside
  class="my-3 overflow-hidden rounded-lg border border-blue-200/70 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20"
>
  <header
    class="flex items-center justify-between gap-2 border-b border-blue-200/60 bg-blue-100/40 px-3 py-1.5 text-[11px] uppercase tracking-widest text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/40 dark:text-blue-300"
  >
    <span class="font-mono">{kind}:{id}</span>
    <button
      type="button"
      class="rounded-md px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-blue-700 transition-colors hover:bg-blue-200/60 dark:text-blue-300 dark:hover:bg-blue-900/40"
      onclick={open}
    >
      Open →
    </button>
  </header>

  <div class="px-3 py-2">
    {#if loading}
      <p class="text-xs text-neutral-400 dark:text-neutral-500">Loading…</p>
    {:else if error}
      <p class="text-xs text-red-500">{error}</p>
    {:else if kind === "note" && note}
      <h4 class="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {note.title}
      </h4>
      <p class="mb-2 text-[11px] text-neutral-400 dark:text-neutral-500">{note.date}</p>
      {#if note.body.trim()}
        <div class="markdown-body text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          {@html md.render(note.body)}
        </div>
      {:else}
        <p class="text-xs italic text-neutral-400 dark:text-neutral-500">(empty note)</p>
      {/if}
    {:else if kind === "list" && list}
      <h4 class="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {list.title}
      </h4>
      <p class="mb-2 text-[11px] text-neutral-400 dark:text-neutral-500">{list.date}</p>
      {#if listTodosData.length === 0}
        <p class="text-xs italic text-neutral-400 dark:text-neutral-500">(empty list)</p>
      {:else}
        <ul class="flex flex-col gap-0.5">
          {#each listTodosData as t (t.id)}
            <li class="flex items-start gap-2 text-sm">
              <span class="mt-[3px] inline-block h-3 w-3 shrink-0 rounded border border-neutral-400 dark:border-neutral-500" class:bg-emerald-500={t.completed} class:border-emerald-500={t.completed}>
                {#if t.completed}
                  <svg viewBox="0 0 12 12" fill="white" class="h-3 w-3"><path d="M4.5 8.5L2.5 6.5l-1 1L4.5 10.5l6-6-1-1z"/></svg>
                {/if}
              </span>
              <span class="text-neutral-800 dark:text-neutral-200" class:line-through={t.completed} class:text-neutral-400={t.completed}>
                {t.text}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if kind === "workflow" && workflow}
      <h4 class="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {workflow.title}
      </h4>
      {#if workflow.description}
        <p class="mb-2 text-xs text-neutral-500 dark:text-neutral-400">{workflow.description}</p>
      {/if}
      {#if topLevelSteps.length === 0}
        <p class="text-xs italic text-neutral-400 dark:text-neutral-500">(no steps)</p>
      {:else}
        <ol class="ml-4 list-decimal text-sm text-neutral-800 dark:text-neutral-200">
          {#each topLevelSteps as s (s.id)}
            <li class="my-0.5">{s.text}</li>
          {/each}
        </ol>
      {/if}
    {:else if kind === "todo" && todo}
      <div class="flex items-start gap-2 text-sm">
        <span class="mt-[3px] inline-block h-3 w-3 shrink-0 rounded border border-neutral-400 dark:border-neutral-500" class:bg-emerald-500={todo.completed} class:border-emerald-500={todo.completed}>
          {#if todo.completed}
            <svg viewBox="0 0 12 12" fill="white" class="h-3 w-3"><path d="M4.5 8.5L2.5 6.5l-1 1L4.5 10.5l6-6-1-1z"/></svg>
          {/if}
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-neutral-800 dark:text-neutral-200" class:line-through={todo.completed} class:text-neutral-400={todo.completed}>
            {todo.text}
          </p>
          {#if todoListTitle}
            <p class="text-[11px] text-neutral-400 dark:text-neutral-500">in {todoListTitle}</p>
          {/if}
        </div>
      </div>
    {:else if kind === "article" && article}
      <h4 class="mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        {article.title}
      </h4>
      {#if article.body.trim()}
        <div class="markdown-body text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
          {@html md.render(article.body)}
        </div>
      {:else}
        <p class="text-xs italic text-neutral-400 dark:text-neutral-500">(empty article)</p>
      {/if}
    {/if}
  </div>
</aside>

<style>
  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3) {
    font-weight: 600;
    margin: 0.4rem 0 0.25rem;
  }
  .markdown-body :global(h1) { font-size: 1.1rem; }
  .markdown-body :global(h2) { font-size: 1rem; }
  .markdown-body :global(h3) { font-size: 0.95rem; }
  .markdown-body :global(p) { margin: 0.25rem 0; }
  .markdown-body :global(ul) { list-style: disc; padding-left: 1.2rem; margin: 0.25rem 0; }
  .markdown-body :global(ol) { list-style: decimal; padding-left: 1.2rem; margin: 0.25rem 0; }
  .markdown-body :global(img) { max-width: 100%; height: auto; }
  .markdown-body :global(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.2rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  :global(html.dark) .markdown-body :global(code) {
    background: rgba(255, 255, 255, 0.08);
  }
  .markdown-body :global(a) {
    color: #2563eb;
    text-decoration: underline;
  }
  :global(html.dark) .markdown-body :global(a) {
    color: #60a5fa;
  }
</style>
