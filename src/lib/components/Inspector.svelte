<script lang="ts">
  import MarkdownIt from "markdown-it";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";
  import type { Tag, Todo } from "$lib/ipc";

  type Props = { todo: Todo };
  let { todo }: Props = $props();

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
  });
  // Mark every link so we can intercept clicks and force them through the
  // OS opener (otherwise they'd try to navigate the WKWebView).
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    if (t.attrIndex("target") < 0) t.attrPush(["target", "_blank"]);
    if (t.attrIndex("rel") < 0) t.attrPush(["rel", "noopener noreferrer"]);
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  let textDraft = $state("");
  let notesDraft = $state("");
  let tagInput = $state("");
  let highlightIdx = $state(0);
  let notesTextarea: HTMLTextAreaElement | undefined = $state();
  let tagListEl: HTMLUListElement | undefined = $state();

  // Sync drafts from the prop. Inspector is wrapped in {#key} on the
  // parent so this effectively runs once per selected todo.
  $effect(() => {
    textDraft = todo.text;
    notesDraft = todo.notes ?? "";
  });

  let renderedNotes = $derived(notesDraft.trim() ? md.render(notesDraft) : "");

  let suggestions = $derived.by<Tag[]>(() => {
    const q = tagInput.trim().toLowerCase();
    if (!q) return [];
    const already = new Set(app.selectedTodoTags.map((t) => t.name));
    return app.allTags
      .filter(
        (t) => !already.has(t.name) && t.name.toLowerCase().includes(q),
      )
      .slice(0, 5);
  });

  $effect(() => {
    if (suggestions.length === 0) highlightIdx = 0;
    else if (highlightIdx >= suggestions.length)
      highlightIdx = suggestions.length - 1;
  });

  async function commitText() {
    const next = textDraft.trim();
    if (!next || next === todo.text) {
      textDraft = todo.text;
      return;
    }
    await app.updateSelectedText(next);
  }

  async function commitNotes() {
    if ((notesDraft ?? "") === (todo.notes ?? "")) return;
    await app.updateSelectedNotes(notesDraft);
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
        tagInput = "";
      }
    }
  }

  function onNotesPreviewClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (href && /^https?:\/\//.test(href)) {
        openUrl(href).catch((err) => app.setFlash(`Couldn't open link: ${err}`));
      }
    }
  }
</script>

<aside
  class="flex h-screen w-72 shrink-0 flex-col overflow-y-auto border-l border-neutral-300/40 px-4 pb-5 pt-12 dark:border-neutral-700/40"
>
  <header class="mb-4 flex items-center justify-between">
    <h2
      class="text-xs font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
    >
      Details
    </h2>
    <button
      type="button"
      class="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
      aria-label="Close details"
      onclick={() => app.selectTodo(null)}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path
          fill-rule="evenodd"
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </header>

  <div class="mb-5">
    <label
      class="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      for="inspector-text"
    >
      Task
    </label>
    <input
      id="inspector-text"
      bind:value={textDraft}
      onblur={commitText}
      onkeydown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        else if (e.key === "Escape") {
          textDraft = todo.text;
          (e.target as HTMLInputElement).blur();
        }
      }}
      class="w-full rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1.5 text-sm leading-snug outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
      class:line-through={todo.completed}
    />
  </div>

  <div class="mb-5">
    <label
      class="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      for="inspector-notes"
    >
      Notes
      <span class="ml-2 normal-case tracking-normal text-neutral-300 dark:text-neutral-600">
        markdown · <code>- item</code> for bullets, <code>[text](url)</code> for links
      </span>
    </label>
    <textarea
      id="inspector-notes"
      bind:this={notesTextarea}
      bind:value={notesDraft}
      onblur={commitNotes}
      placeholder="Add notes…"
      rows="5"
      class="w-full resize-none rounded-md border border-neutral-200/60 bg-white/60 px-2 py-1.5 font-mono text-[13px] leading-snug outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    ></textarea>
    {#if renderedNotes}
      <!-- markdown-it has html:false so the rendered output is safe to inject. -->
      <div
        class="markdown-preview mt-2 rounded-md border border-neutral-200/40 bg-neutral-50/60 px-3 py-2 text-sm leading-snug text-neutral-700 dark:border-neutral-700/40 dark:bg-neutral-900/30 dark:text-neutral-200"
        role="presentation"
        onclick={onNotesPreviewClick}
        onkeydown={() => {}}
      >
        {@html renderedNotes}
      </div>
    {/if}
  </div>

  <div class="relative">
    <label
      class="mb-1 block text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500"
      for="inspector-tags"
    >
      Tags
    </label>
    <div class="mb-2 flex flex-wrap gap-1">
      {#each app.selectedTodoTags as tag (tag.id)}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-neutral-200/70 px-2 py-0.5 text-[11px] text-neutral-700 dark:bg-neutral-700/70 dark:text-neutral-200"
        >
          #{tag.name}
          <button
            type="button"
            class="text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            aria-label="Remove tag"
            onclick={() => app.removeTagFromSelected(tag.id)}
          >
            ×
          </button>
        </span>
      {/each}
    </div>
    <input
      id="inspector-tags"
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
</aside>

<style>
  .markdown-preview :global(ul) {
    list-style: disc;
    padding-left: 1.25rem;
    margin: 0.25rem 0;
  }
  .markdown-preview :global(ol) {
    list-style: decimal;
    padding-left: 1.25rem;
    margin: 0.25rem 0;
  }
  .markdown-preview :global(li) {
    margin: 0.15rem 0;
  }
  .markdown-preview :global(p) {
    margin: 0.25rem 0;
  }
  .markdown-preview :global(a) {
    color: #2563eb;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-preview :global(a) {
      color: #60a5fa;
    }
  }
  .markdown-preview :global(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-preview :global(code) {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  .markdown-preview :global(strong) {
    font-weight: 600;
  }
  .markdown-preview :global(em) {
    font-style: italic;
  }
</style>
