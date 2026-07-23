<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { saveImageFile } from "$lib/ipc";
  import { autosize } from "$lib/autosize";
  import {
    createMarkdownIt,
    hydrateMermaidBlocks,
    countWords,
    toggleTaskInSource,
    countTasksInSource,
    stepProgressInSource,
    countProgressStepsInSource,
  } from "$lib/markdownit";
  import EmbedBlock from "$lib/components/EmbedBlock.svelte";
  import EntityLinkPicker from "$lib/components/EntityLinkPicker.svelte";
  import SlashMenu from "$lib/components/SlashMenu.svelte";

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

  const md = createMarkdownIt();

  let editing = $state(false);
  let draft = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();
  let linkPickerOpen = $state(false);
  let savedSel = { start: 0, end: 0 };
  let previewEl: HTMLDivElement | undefined = $state();
  let isLarge = $state(false);

  const btnCls =
    "inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/60 px-2 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-800";

  $effect(() => {
    if (!editing) draft = value;
  });

  type EmbedKind =
    | "note"
    | "list"
    | "workflow"
    | "todo"
    | "article"
    | "flashcard";
  type Segment =
    | { type: "md"; text: string }
    | { type: "embed"; kind: EmbedKind; id: number };

  const EMBED_LINE =
    /^\s*\{\{(note|list|workflow|todo|article|flashcard):(\d+)\}\}\s*$/;

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
  let wc = $derived(countWords(draft));

  // Hydrate ```mermaid placeholders to SVG across every md segment. The segment
  // {@html} blocks get rewritten on edit/commit/theme changes, so a one-shot
  // effect can race the paint or get wiped. A MutationObserver re-runs hydration
  // whenever the preview's HTML changes; the source+theme cache and renderedKey
  // guard keep repeat passes cheap and non-looping. Re-established on theme flip.
  $effect(() => {
    const el = previewEl;
    const t = theme.resolved === "dark" ? "dark" : "default";
    if (!el) return;
    hydrateMermaidBlocks(el, t);
    const mo = new MutationObserver(() => hydrateMermaidBlocks(el, t));
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  });

  // When the rendered article is taller than the viewport, the top Edit button
  // scrolls out of reach — surface a second one at the bottom. ResizeObserver
  // re-measures as content (incl. embeds/images) changes height.
  $effect(() => {
    const el = previewEl;
    if (!el) {
      isLarge = false;
      return;
    }
    const measure = () => {
      isLarge = el.scrollHeight > window.innerHeight;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });

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
    const target = e.target as HTMLElement;
    // Don't enter edit when clicking inside an embed.
    if (target.closest("aside")) return;
    // Task checkboxes: each md segment renders with data-task restarting at
    // 0, so map the segment-local index to a whole-document one before
    // flipping the marker in the source.
    if (target instanceof HTMLInputElement && target.classList.contains("md-task")) {
      e.preventDefault();
      const local = Number(target.dataset.task);
      const segEl = target.closest<HTMLElement>("[data-seg]");
      const segIdx = segEl ? Number(segEl.dataset.seg) : NaN;
      if (!Number.isFinite(local) || !Number.isFinite(segIdx)) return;
      let offset = 0;
      for (let j = 0; j < segIdx; j++) {
        const s = segments[j];
        if (s.type === "md") offset += countTasksInSource(s.text);
      }
      void toggleTask(offset + local);
      return;
    }
    // Progress steppers: same per-segment index offset as task checkboxes.
    const step = target.closest<HTMLElement>(".md-progress-step");
    if (step) {
      e.preventDefault();
      const local = Number(step.dataset.progress);
      const delta = step.dataset.dir === "inc" ? 1 : -1;
      const segEl = target.closest<HTMLElement>("[data-seg]");
      const segIdx = segEl ? Number(segEl.dataset.seg) : NaN;
      if (!Number.isFinite(local) || !Number.isFinite(segIdx)) return;
      let offset = 0;
      for (let j = 0; j < segIdx; j++) {
        const s = segments[j];
        if (s.type === "md") offset += countProgressStepsInSource(s.text);
      }
      void stepProgress(offset + local, delta);
      return;
    }
    const anchor = target.closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href) return;
      const m = href.match(
        /^(note|list|workflow|article|flashcard|blueprint):(\d+)$/,
      );
      if (m) {
        const id = Number(m[2]);
        if (Number.isFinite(id)) navigateEntity(m[1], id);
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
    // Edit button. (Link/embed clicks handled above still work.)
  }

  async function toggleTask(idx: number) {
    // Preview implies !editing, so draft mirrors the committed value.
    const next = toggleTaskInSource(draft, idx);
    if (next === null) return;
    draft = next;
    await onCommit(next);
  }

  async function stepProgress(idx: number, delta: number) {
    const next = stepProgressInSource(draft, idx, delta);
    if (next === null) return;
    draft = next;
    await onCommit(next);
  }

  // Navigate to a linked entity, or flash if it no longer exists.
  function navigateEntity(kind: string, id: number) {
    if (kind === "note") {
      if (app.notes.some((n) => n.id === id)) app.selectNote(id);
      else app.setFlash("That note no longer exists");
    } else if (kind === "article") {
      if (app.articles.some((a) => a.id === id)) app.selectArticle(id);
      else app.setFlash("That article no longer exists");
    } else if (kind === "workflow") {
      if (app.workflows.some((w) => w.id === id)) app.selectWorkflow(id);
      else app.setFlash("That workflow no longer exists");
    } else if (kind === "list") {
      if (app.lists.some((l) => l.id === id)) app.select(id);
      else app.setFlash("That list no longer exists");
    } else if (kind === "flashcard") {
      if (app.flashcards.some((c) => c.id === id)) app.openFlashcardInDeck(id);
      else app.setFlash("That flashcard no longer exists");
    } else if (kind === "blueprint") {
      if (app.blueprints.some((b) => b.id === id)) app.openBlueprint(id);
      else app.setFlash("That blueprint no longer exists");
    }
  }

  function onTextareaKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    } else if (e.key === "Tab") {
      e.preventDefault();
      insertAtCursor("  ");
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

  function insertTable() {
    const before = draft.length > 0 && !draft.endsWith("\n") ? "\n" : "";
    insertAtCursor(
      `${before}\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n`,
    );
  }

  function insertDiagram() {
    const before = draft.length > 0 && !draft.endsWith("\n") ? "\n" : "";
    insertAtCursor(
      `${before}\n\`\`\`mermaid\nflowchart TD\n  A[Start] --> B[End]\n\`\`\`\n`,
    );
  }

  function slashApplyEdit(next: string, caret: number) {
    editing = true;
    draft = next;
    queueMicrotask(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  }

  function insertCards() {
    const before = draft.length > 0 && !draft.endsWith("\n") ? "\n" : "";
    insertAtCursor(
      `${before}\n\`\`\`cards\n` +
        `title: My site\ndesc: Short description\nlink: https://example.com\ncolor: blue\nicon: 🔗\n` +
        `---\n` +
        `title: A blueprint\ndesc: Bold filled card\nlink: blueprint:1\ncolor: violet\nfilled: true\n` +
        `---\n` +
        `title: Launch plan\ndesc: Gradient card\nlink: note:1\ncolor: sunset\nicon: 🚀\n` +
        `\`\`\`\n`,
    );
  }

  function openLinkPicker(e?: MouseEvent) {
    e?.preventDefault();
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
      class="flex items-center gap-2 text-[11px] text-neutral-400 dark:text-neutral-500"
    >
      <span class="italic">type <kbd class="rounded border border-neutral-300/70 px-1 not-italic dark:border-neutral-600/70">/</kbd> for commands · embed with <code class="rounded bg-neutral-200/60 px-1 dark:bg-neutral-700/40">{`{{note:5}}`}</code></span>
      <span class="mr-auto tabular-nums">· {wc.words} words</span>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={() => (app.formattingHelpOpen = true)}
        class={btnCls}
        title="Formatting reference"
      >
        Aa
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={openLinkPicker}
        title="Insert link"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" clip-rule="evenodd" />
          <path fill-rule="evenodd" d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" clip-rule="evenodd" />
        </svg>
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={insertTable}
        title="Insert table"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M2 5.25A2.25 2.25 0 014.25 3h11.5A2.25 2.25 0 0118 5.25v9.5A2.25 2.25 0 0115.75 17H4.25A2.25 2.25 0 012 14.75v-9.5zM4.25 4.5a.75.75 0 00-.75.75V7h4V4.5h-3.25zM8.5 4.5V7h3V4.5h-3zM12.5 4.5V7h4V5.25a.75.75 0 00-.75-.75H12.5zM16.5 8.5h-4V11h4V8.5zM16.5 12.5h-4v3h3.25a.75.75 0 00.75-.75V12.5zM11.5 15.5v-3h-3v3h3zM7.5 15.5v-3h-4v2.25c0 .414.336.75.75.75H7.5zM3.5 11h4V8.5h-4V11z" clip-rule="evenodd" />
        </svg>
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={insertDiagram}
        title="Insert diagram"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M3 4.75A1.75 1.75 0 014.75 3h3.5A1.75 1.75 0 0110 4.75v2.5A1.75 1.75 0 018.25 9H7v2h3.5a.75.75 0 01.75.75V13h1A1.75 1.75 0 0113 14.75v.5A1.75 1.75 0 0111.25 17h-2.5A1.75 1.75 0 017 15.25v-.5A1.75 1.75 0 018.75 13h1v-1.5H5.5A.75.75 0 014.75 11V9h-.5A1.75 1.75 0 012.5 7.25v-2.5zm10.75 8.25h2.5A1.75 1.75 0 0118 14.75v.5A1.75 1.75 0 0116.25 17h-2.5A1.75 1.75 0 0112 15.25v-.5A1.75 1.75 0 0113.75 13z" clip-rule="evenodd" />
        </svg>
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={insertCards}
        title="Insert cards"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path d="M3 4.5A1.5 1.5 0 014.5 3h3A1.5 1.5 0 019 4.5v3A1.5 1.5 0 017.5 9h-3A1.5 1.5 0 013 7.5v-3zM11 4.5A1.5 1.5 0 0112.5 3h3A1.5 1.5 0 0117 4.5v3A1.5 1.5 0 0115.5 9h-3A1.5 1.5 0 0111 7.5v-3zM3 12.5A1.5 1.5 0 014.5 11h3A1.5 1.5 0 019 12.5v3A1.5 1.5 0 017.5 17h-3A1.5 1.5 0 013 15.5v-3zM11 12.5A1.5 1.5 0 0112.5 11h3a1.5 1.5 0 011.5 1.5v3A1.5 1.5 0 0115.5 17h-3a1.5 1.5 0 01-1.5-1.5v-3z" />
        </svg>
      </button>
      <button
        type="button"
        onmousedown={(e) => e.preventDefault()}
        onclick={pickAndInsertImage}
        title="Insert image"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path
            fill-rule="evenodd"
            d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l3-4 2 3 3-5 4 6z"
            clip-rule="evenodd"
          />
        </svg>
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
    <SlashMenu
      {textarea}
      onEdit={slashApplyEdit}
      onLink={openLinkPicker}
      onImage={pickAndInsertImage}
    />
  </div>
{:else if hasContent}
  <div class="relative">
    <button
      type="button"
      class="absolute right-2 top-2 z-10 inline-flex items-center justify-center rounded-md border border-neutral-200/70 bg-white/80 p-1.5 text-neutral-600 opacity-80 shadow-sm transition-colors hover:bg-neutral-100 hover:opacity-100 dark:border-neutral-700/70 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onclick={startEditing}
      title="Edit"
      aria-label="Edit"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
      </svg>
    </button>
    <div
      bind:this={previewEl}
      role="presentation"
      style="min-height: {minHeight};"
      class="markdown-body w-full overflow-x-hidden rounded-md px-3 py-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200"
      onclick={onPreviewClick}
      onkeydown={() => {}}
    >
      {#each segments as seg, i (i)}
        {#if seg.type === "md"}
          <div data-seg={i}>
            {@html md.render(seg.text, { progressInteractive: true })}
          </div>
        {:else}
          <EmbedBlock kind={seg.kind} id={seg.id} />
        {/if}
      {/each}
    </div>
    {#if isLarge}
      <div class="mt-2 flex justify-center">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/80 px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
          onclick={startEditing}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
          Edit
        </button>
      </div>
    {/if}
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
    font-size: 1.95rem;
    font-weight: 700;
    line-height: 1.2;
    margin: 1rem 0 0.6rem;
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
  /* Links render as small button-like chips — easier to spot and click than
     underlined text (Sprint 23 follow-up). */
  .markdown-body :global(a:not(.md-card)) {
    display: inline-block;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(37, 99, 235, 0.3);
    background: rgba(37, 99, 235, 0.08);
    color: #2563eb;
    text-decoration: none;
    font-size: 0.9em;
    font-weight: 500;
    line-height: 1.5;
    cursor: pointer;
    transition: background 120ms;
  }
  .markdown-body :global(a:not(.md-card):hover) {
    background: rgba(37, 99, 235, 0.18);
  }
  :global(html.dark) .markdown-body :global(a:not(.md-card)) {
    color: #60a5fa;
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(96, 165, 250, 0.12);
  }
  :global(html.dark) .markdown-body :global(a:not(.md-card):hover) {
    background: rgba(96, 165, 250, 0.22);
  }
  /* Inline code only — code inside <pre> must NOT get the pill background
     (a multi-line block would show a highlight strip per wrapped line). */
  .markdown-body :global(:not(pre) > code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  :global(html.dark) .markdown-body :global(:not(pre) > code) {
    background: rgba(255, 255, 255, 0.08);
  }
  .markdown-body :global(pre) {
    white-space: pre-wrap;
    overflow-x: auto;
    background: rgba(0, 0, 0, 0.045);
    border: 1px solid rgba(0, 0, 0, 0.08);
    padding: 0.8rem 0.9rem;
    border-radius: 8px;
    font-size: 0.85em;
    line-height: 1.5;
    margin: 0.5rem 0;
  }
  :global(html.dark) .markdown-body :global(pre) {
    background: rgba(255, 255, 255, 0.045);
    border-color: rgba(255, 255, 255, 0.1);
  }
  .markdown-body :global(pre > code) {
    display: block;
    background: transparent;
    padding: 0;
  }
  .markdown-body :global(.mermaid-block) {
    display: flex;
    justify-content: center;
    margin: 0.6rem 0;
  }
  /* Before hydration the placeholder shows raw source — keep it monospace and
     muted so the sub-second flash before the SVG swaps in reads as code. */
  .markdown-body :global(.mermaid-block[data-rendered="0"]) {
    white-space: pre-wrap;
    justify-content: flex-start;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    color: rgba(0, 0, 0, 0.4);
  }
  :global(html.dark) .markdown-body :global(.mermaid-block[data-rendered="0"]) {
    color: rgba(255, 255, 255, 0.4);
  }
  .markdown-body :global(.mermaid-block svg) { max-width: 100%; height: auto; }
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
  /* Rounded outer frame: separate borders + overflow:hidden clips the cell
     corners to the radius (collapse would ignore border-radius). Cells carry
     only bottom/right borders; the table supplies the top/left outer edge. */
  .markdown-body :global(table) {
    width: 100%;
    max-width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    margin: 0.6rem 0;
    border: 1px solid rgba(0, 0, 0, 0.12);
    border-radius: 8px;
    overflow: hidden;
  }
  .markdown-body :global(th),
  .markdown-body :global(td) {
    padding: 0.4rem 0.6rem;
    /* Floor each column so a short first column stays readable. */
    min-width: 7rem;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    border-right: 1px solid rgba(0, 0, 0, 0.08);
  }
  .markdown-body :global(th:last-child),
  .markdown-body :global(td:last-child) {
    border-right: 0;
  }
  .markdown-body :global(tr:last-child td) {
    border-bottom: 0;
  }
  .markdown-body :global(tbody tr) {
    transition: background 100ms;
  }
  .markdown-body :global(tbody tr:hover) {
    background: rgba(37, 99, 235, 0.06);
  }
  :global(html.dark) .markdown-body :global(table) {
    border-color: rgba(255, 255, 255, 0.14);
  }
  :global(html.dark) .markdown-body :global(th),
  :global(html.dark) .markdown-body :global(td) {
    border-bottom-color: rgba(255, 255, 255, 0.1);
    border-right-color: rgba(255, 255, 255, 0.1);
  }
  :global(html.dark) .markdown-body :global(tbody tr:hover) {
    background: rgba(96, 165, 250, 0.12);
  }
</style>
