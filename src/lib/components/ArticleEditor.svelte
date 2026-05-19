<script lang="ts">
  import MarkdownIt from "markdown-it";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";
  import { saveImageFile } from "$lib/ipc";
  import EmbedBlock from "$lib/components/EmbedBlock.svelte";

  type Props = {
    value: string;
    placeholder?: string;
    minHeight?: string;
    onCommit: (next: string) => void | Promise<void>;
  };

  let {
    value,
    placeholder = "Write in markdown. Embed any element on its own line — e.g. {{note:5}} or {{workflow:3}}.",
    minHeight = "24rem",
    onCommit,
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
    if (!editing) draft = value;
  });

  type EmbedKind = "note" | "list" | "workflow" | "todo" | "article";
  type Segment =
    | { type: "md"; text: string }
    | { type: "embed"; kind: EmbedKind; id: number };

  const EMBED_LINE = /^\s*\{\{(note|list|workflow|todo|article):(\d+)\}\}\s*$/;

  let segments = $derived.by<Segment[]>(() => {
    const out: Segment[] = [];
    const lines = draft.split("\n");
    let buf: string[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      const text = buf.join("\n");
      if (text.trim()) out.push({ type: "md", text });
      buf = [];
    };
    for (const line of lines) {
      const m = line.match(EMBED_LINE);
      if (m) {
        flush();
        out.push({
          type: "embed",
          kind: m[1] as EmbedKind,
          id: Number(m[2]),
        });
      } else {
        buf.push(line);
      }
    }
    flush();
    return out;
  });

  let hasContent = $derived(draft.trim().length > 0);

  function startEditing() {
    editing = true;
    queueMicrotask(() => textarea?.focus());
  }

  async function commit() {
    editing = false;
    await onCommit(draft);
  }

  function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Don't enter edit when clicking inside an embed.
    if (target.closest("aside")) return;
    const anchor = target.closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href) return;
      const m = href.match(/^(note|list|workflow|article):(\d+)$/);
      if (m) {
        const id = Number(m[2]);
        if (Number.isFinite(id)) {
          if (m[1] === "note") app.selectNote(id);
          else if (m[1] === "list") app.select(id);
          else if (m[1] === "workflow") app.selectWorkflow(id);
          else if (m[1] === "article") app.selectArticle(id);
        }
        return;
      }
      if (/^https?:\/\//.test(href)) {
        openUrl(href).catch((err) =>
          app.setFlash(`Couldn't open link: ${err}`),
        );
      }
      return;
    }
    startEditing();
  }

  function onTextareaKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  function insertAtCursor(snippet: string) {
    const ta = textarea;
    if (!ta) {
      draft = (draft ?? "") + snippet;
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    draft = draft.slice(0, start) + snippet + draft.slice(end);
    queueMicrotask(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items || items.length === 0) return;
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    try {
      const parts: string[] = [];
      for (const f of imageFiles) {
        const url = await saveImageFile(f);
        parts.push(`![pasted image](${url})`);
      }
      const before = draft.length > 0 && !draft.endsWith("\n") ? "\n\n" : "";
      insertAtCursor(before + parts.join("\n\n") + "\n");
    } catch (err) {
      app.setFlash(`Couldn't paste image: ${err}`);
    }
  }

  async function pickAndInsertImage() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      try {
        const parts: string[] = [];
        for (const f of files) {
          const url = await saveImageFile(f);
          parts.push(`![${f.name}](${url})`);
        }
        const base = editing ? draft : value;
        const before = base.length > 0 && !base.endsWith("\n") ? "\n\n" : "";
        const next = base + before + parts.join("\n\n") + "\n";
        editing = true;
        draft = next;
        queueMicrotask(() => textarea?.focus());
      } catch (err) {
        app.setFlash(`Couldn't insert image: ${err}`);
      }
    };
    input.click();
  }
</script>

{#if editing}
  <div class="flex flex-col gap-1.5">
    <div
      class="flex items-center justify-end gap-2 text-[11px] text-neutral-400 dark:text-neutral-500"
    >
      <span class="italic">embed with <code class="rounded bg-neutral-200/60 px-1 dark:bg-neutral-700/40">{`{{note:5}}`}</code> on its own line</span>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={pickAndInsertImage}
        class="inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/60 px-2 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path
            fill-rule="evenodd"
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l3-4 2 3 3-5 4 6z"
            clip-rule="evenodd"
          />
        </svg>
        Insert image
      </button>
    </div>
    <textarea
      bind:this={textarea}
      bind:value={draft}
      onblur={commit}
      onkeydown={onTextareaKey}
      onpaste={onPaste}
      {placeholder}
      style="min-height: {minHeight};"
      class="w-full resize-y rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    ></textarea>
  </div>
{:else if hasContent}
  <div
    role="presentation"
    style="min-height: {minHeight};"
    class="markdown-body w-full cursor-text overflow-x-hidden rounded-md border border-transparent px-3 py-2 text-sm leading-relaxed text-neutral-800 transition-colors hover:border-neutral-200/60 dark:text-neutral-200 dark:hover:border-neutral-700/60"
    onclick={onPreviewClick}
    onkeydown={() => {}}
  >
    {#each segments as seg, i (i)}
      {#if seg.type === "md"}
        {@html md.render(seg.text)}
      {:else}
        <EmbedBlock kind={seg.kind} id={seg.id} />
      {/if}
    {/each}
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
  .markdown-body :global(p) { margin: 0.35rem 0; }
  .markdown-body :global(ul) { list-style: disc; padding-left: 1.4rem; margin: 0.35rem 0; }
  .markdown-body :global(ol) { list-style: decimal; padding-left: 1.4rem; margin: 0.35rem 0; }
  .markdown-body :global(li) { margin: 0.15rem 0; }
  .markdown-body :global(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.15);
    padding-left: 0.75rem;
    margin: 0.5rem 0;
    color: rgba(0, 0, 0, 0.6);
  }
  :global(html.dark) .markdown-body :global(blockquote) {
    border-left-color: rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.6);
  }
  .markdown-body :global(a) {
    color: #2563eb;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  :global(html.dark) .markdown-body :global(a) {
    color: #60a5fa;
  }
  .markdown-body :global(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  :global(html.dark) .markdown-body :global(code) {
    background: rgba(255, 255, 255, 0.08);
  }
  .markdown-body :global(img) { max-width: 100%; height: auto; }
  .markdown-body :global(hr) {
    border: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    margin: 0.75rem 0;
  }
  :global(html.dark) .markdown-body :global(hr) {
    border-top-color: rgba(255, 255, 255, 0.12);
  }
  .markdown-body :global(strong) { font-weight: 600; }
  .markdown-body :global(em) { font-style: italic; }
</style>
