<script lang="ts">
  import MarkdownIt from "markdown-it";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";

  type Props = {
    value: string;
    placeholder?: string;
    minHeight?: string;
    onCommit: (next: string) => void | Promise<void>;
    // Optional custom handler for clicks on rendered anchors. If returned
    // false, fall back to opening the URL via the OS opener.
    onLinkClick?: (href: string) => boolean | void;
  };

  let {
    value,
    placeholder = "Write in markdown… click to edit, click outside to preview.",
    minHeight = "16rem",
    onCommit,
    onLinkClick,
  }: Props = $props();

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
  });
  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts));
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    if (t.attrIndex("target") < 0) t.attrPush(["target", "_blank"]);
    if (t.attrIndex("rel") < 0) t.attrPush(["rel", "noopener noreferrer"]);
    return defaultLinkOpen(tokens, idx, opts, env, self);
  };

  let editing = $state(false);
  let draft = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();

  $effect(() => {
    // Sync external value when not actively editing.
    if (!editing) draft = value;
  });

  let rendered = $derived(draft.trim() ? md.render(draft) : "");

  function startEditing() {
    editing = true;
    queueMicrotask(() => textarea?.focus());
  }

  async function commit() {
    editing = false;
    await onCommit(draft);
  }

  function onPreviewClick(e: MouseEvent) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (onLinkClick) {
        const handled = onLinkClick(href);
        if (handled === true) return;
      }
      if (/^https?:\/\//.test(href)) {
        openUrl(href).catch((err) =>
          app.setFlash(`Couldn't open link: ${err}`),
        );
      }
      return;
    }
    // Click anywhere else in the preview: switch to editing.
    startEditing();
  }

  function onTextareaKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }
</script>

{#if editing}
  <textarea
    bind:this={textarea}
    bind:value={draft}
    onblur={commit}
    onkeydown={onTextareaKey}
    {placeholder}
    style="min-height: {minHeight};"
    class="w-full resize-y rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
  ></textarea>
{:else if rendered}
  <div
    role="presentation"
    style="min-height: {minHeight};"
    class="markdown-body w-full cursor-text overflow-x-hidden rounded-md border border-transparent px-3 py-2 text-sm leading-relaxed text-neutral-800 transition-colors hover:border-neutral-200/60 dark:text-neutral-200 dark:hover:border-neutral-700/60"
    onclick={onPreviewClick}
    onkeydown={() => {}}
  >
    {@html rendered}
  </div>
{:else}
  <button
    type="button"
    style="min-height: {minHeight};"
    class="block w-full cursor-text rounded-md border border-dashed border-neutral-300/60 px-3 py-2 text-left text-sm text-neutral-400 transition-colors hover:border-neutral-400 hover:bg-neutral-100/40 dark:border-neutral-700/60 dark:text-neutral-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/30"
    onclick={startEditing}
  >
    {placeholder}
  </button>
{/if}

<style>
  .markdown-body {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .markdown-body :global(h1) {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0.75rem 0 0.5rem;
  }
  .markdown-body :global(h2) {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0.6rem 0 0.4rem;
  }
  .markdown-body :global(h3) {
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0.5rem 0 0.3rem;
  }
  .markdown-body :global(p) {
    margin: 0.35rem 0;
  }
  .markdown-body :global(ul) {
    list-style: disc;
    padding-left: 1.4rem;
    margin: 0.35rem 0;
  }
  .markdown-body :global(ol) {
    list-style: decimal;
    padding-left: 1.4rem;
    margin: 0.35rem 0;
  }
  .markdown-body :global(li) {
    margin: 0.15rem 0;
  }
  .markdown-body :global(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.15);
    padding-left: 0.75rem;
    margin: 0.5rem 0;
    color: rgba(0, 0, 0, 0.6);
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(blockquote) {
      border-left-color: rgba(255, 255, 255, 0.18);
      color: rgba(255, 255, 255, 0.6);
    }
  }
  .markdown-body :global(a) {
    color: #2563eb;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(a) {
      color: #60a5fa;
    }
  }
  .markdown-body :global(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(code) {
      background: rgba(255, 255, 255, 0.08);
    }
  }
  .markdown-body :global(pre) {
    white-space: pre-wrap;
    overflow-x: auto;
    background: rgba(0, 0, 0, 0.05);
    padding: 0.6rem;
    border-radius: 4px;
    font-size: 0.85em;
    margin: 0.4rem 0;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(pre) {
      background: rgba(255, 255, 255, 0.06);
    }
  }
  .markdown-body :global(img) {
    max-width: 100%;
    height: auto;
  }
  .markdown-body :global(hr) {
    border: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    margin: 0.75rem 0;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(hr) {
      border-top-color: rgba(255, 255, 255, 0.12);
    }
  }
  .markdown-body :global(strong) {
    font-weight: 600;
  }
  .markdown-body :global(em) {
    font-style: italic;
  }
  .markdown-body :global(table) {
    display: block;
    overflow-x: auto;
    max-width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
  }
  .markdown-body :global(th),
  .markdown-body :global(td) {
    border: 1px solid rgba(0, 0, 0, 0.1);
    padding: 0.25rem 0.5rem;
  }
  @media (prefers-color-scheme: dark) {
    .markdown-body :global(th),
    .markdown-body :global(td) {
      border-color: rgba(255, 255, 255, 0.12);
    }
  }
</style>
