<script lang="ts">
  import MarkdownIt from "markdown-it";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";
  import { saveImageFile } from "$lib/ipc";
  import { autosize } from "$lib/autosize";
  import EntityLinkPicker from "$lib/components/EntityLinkPicker.svelte";

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
  let linkPickerOpen = $state(false);
  let savedSel = { start: 0, end: 0 };

  const btnCls =
    "inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/60 px-2 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-800";

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
    // Focusing the link picker blurs the textarea; don't exit edit mode while
    // it's open — we resume editing once the picker closes.
    if (linkPickerOpen) return;
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
      // Internal entity links: [label](note:5) etc. — navigate in-app.
      const ent = href.match(/^(note|list|workflow|article):(\d+)$/);
      if (ent) {
        const id = Number(ent[2]);
        if (Number.isFinite(id)) {
          if (ent[1] === "note") app.selectNote(id);
          else if (ent[1] === "list") app.select(id);
          else if (ent[1] === "workflow") app.selectWorkflow(id);
          else if (ent[1] === "article") app.selectArticle(id);
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
    // A plain click in the preview does nothing — editing is only via the
    // Edit button. (Link clicks handled above still navigate.)
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
    // Restore cursor after the inserted snippet on the next tick.
    queueMicrotask(() => {
      ta.focus();
      const pos = start + snippet.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  function insertTable() {
    const before = draft.length > 0 && !draft.endsWith("\n") ? "\n" : "";
    insertAtCursor(
      `${before}\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n`,
    );
  }

  function openLinkPicker(e: MouseEvent) {
    e.preventDefault();
    const ta = textarea;
    savedSel = ta
      ? {
          start: ta.selectionStart ?? draft.length,
          end: ta.selectionEnd ?? draft.length,
        }
      : { start: draft.length, end: draft.length };
    linkPickerOpen = true;
  }

  function onLinkChosen(snippet: string) {
    linkPickerOpen = false;
    const { start, end } = savedSel;
    draft = draft.slice(0, start) + snippet + draft.slice(end);
    editing = true;
    queueMicrotask(() => {
      textarea?.focus();
      const pos = start + snippet.length;
      textarea?.setSelectionRange(pos, pos);
    });
  }

  function onLinkPickerClose() {
    linkPickerOpen = false;
    editing = true;
    queueMicrotask(() => textarea?.focus());
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
      // Stay on its own line(s) so the renderer treats it as a block image.
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
        // The file dialog can blur the textarea — fall back to appending
        // to whichever source is most current and re-enter edit mode.
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
    <div class="flex items-center gap-2 text-[11px] text-neutral-400 dark:text-neutral-500">
      <span class="mr-auto italic">click outside to preview</span>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={openLinkPicker}
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" clip-rule="evenodd" />
          <path fill-rule="evenodd" d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" clip-rule="evenodd" />
        </svg>
        Insert link
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={insertTable}
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M2 5.25A2.25 2.25 0 014.25 3h11.5A2.25 2.25 0 0118 5.25v9.5A2.25 2.25 0 0115.75 17H4.25A2.25 2.25 0 012 14.75v-9.5zM4.25 4.5a.75.75 0 00-.75.75V7h4V4.5h-3.25zM8.5 4.5V7h3V4.5h-3zM12.5 4.5V7h4V5.25a.75.75 0 00-.75-.75H12.5zM16.5 8.5h-4V11h4V8.5zM16.5 12.5h-4v3h3.25a.75.75 0 00.75-.75V12.5zM11.5 15.5v-3h-3v3h3zM7.5 15.5v-3h-4v2.25c0 .414.336.75.75.75H7.5zM3.5 11h4V8.5h-4V11z" clip-rule="evenodd" />
        </svg>
        Insert table
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={pickAndInsertImage}
        class={btnCls}
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
      use:autosize={draft}
      onblur={commit}
      onkeydown={onTextareaKey}
      onpaste={onPaste}
      {placeholder}
      style="min-height: {minHeight};"
      class="w-full resize-none overflow-hidden rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    ></textarea>
  </div>
{:else if rendered}
  <div class="relative">
    <button
      type="button"
      class="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 opacity-80 shadow-sm transition-colors hover:bg-neutral-100 hover:opacity-100 dark:border-neutral-700/70 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onclick={startEditing}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
      Edit
    </button>
    <div
      role="presentation"
      style="min-height: {minHeight};"
      class="markdown-body w-full overflow-x-hidden rounded-md px-3 py-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200"
      onclick={onPreviewClick}
      onkeydown={() => {}}
    >
      {@html rendered}
    </div>
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

{#if linkPickerOpen}
  <EntityLinkPicker onPick={onLinkChosen} onClose={onLinkPickerClose} />
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
  .markdown-body :global(pre) {
    white-space: pre-wrap;
    overflow-x: auto;
    background: rgba(0, 0, 0, 0.05);
    padding: 0.6rem;
    border-radius: 4px;
    font-size: 0.85em;
    margin: 0.4rem 0;
  }
  :global(html.dark) .markdown-body :global(pre) {
    background: rgba(255, 255, 255, 0.06);
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
  :global(html.dark) .markdown-body :global(hr) {
    border-top-color: rgba(255, 255, 255, 0.12);
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
  :global(html.dark) .markdown-body :global(th),
  :global(html.dark) .markdown-body :global(td) {
    border-color: rgba(255, 255, 255, 0.12);
  }
</style>
