<script lang="ts">
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { saveImageFile } from "$lib/ipc";
  import { autosize } from "$lib/autosize";
  import {
    createMarkdownIt,
    hydrateMermaidBlocks,
    hydrateBoardEmbeds,
    countWords,
    toggleTaskInSource,
    stepProgressInSource,
    toggleSectionInSource,
    replaceLinesInSource,
  } from "$lib/markdownit";
  import { hydrateStagesBlocks } from "$lib/stages";
  import EntityLinkPicker from "$lib/components/EntityLinkPicker.svelte";
  import SlashMenu from "$lib/components/SlashMenu.svelte";
  import IconPicker from "$lib/components/IconPicker.svelte";

  type Props = {
    value: string;
    placeholder?: string;
    minHeight?: string;
    onCommit: (next: string) => void | Promise<void>;
    // Optional custom handler for clicks on rendered anchors. If returned
    // false, fall back to opening the URL via the OS opener.
    onLinkClick?: (href: string) => boolean | void;
    // Show a floating right-side outline of the document's headings (used by
    // notes to navigate long texts).
    outline?: boolean;
    // Replace the inline top/bottom Edit buttons with a single floating FAB in
    // the bottom-right corner, so reading isn't interrupted (used by notes).
    floatingEdit?: boolean;
    // Anchor the floating FAB to the nearest positioned ancestor (`absolute`)
    // instead of the viewport (`fixed`) — for use inside a modal so the button
    // sits in the modal's corner, not the screen's (used by the task detail).
    floatingContained?: boolean;
    // Render the preview only — no editing (used by the reference pane so a note
    // renders identically to the main pane without being editable there).
    readOnly?: boolean;
  };

  let {
    value,
    placeholder = "Write in markdown… click to edit, click outside to preview.",
    minHeight = "16rem",
    onCommit,
    onLinkClick,
    outline = false,
    floatingEdit = false,
    floatingContained = false,
    readOnly = false,
  }: Props = $props();

  // Position class for the floating Edit/Done FAB.
  const fabPos = $derived(floatingContained ? "absolute" : "fixed");
  // When the split reference pane is open, nudge the viewport-fixed FAB left of
  // the divider so it lands in the main pane, not over the reference pane.
  const fabStyle = $derived(
    app.splitOpen && !floatingContained
      ? "right: calc(1.5rem + var(--split-ref-w, 0px))"
      : "",
  );

  const md = createMarkdownIt();

  let editing = $state(false);
  let draft = $state("");
  let textarea: HTMLTextAreaElement | undefined = $state();
  let linkPickerOpen = $state(false);
  let savedSel = { start: 0, end: 0 };
  let previewEl: HTMLDivElement | undefined = $state();
  let isLarge = $state(false);
  // After committing, scroll the fresh preview to the block we last edited
  // (the source line of the caret at blur time), instead of jumping to the top.
  let pendingScrollLine: number | null = $state(null);

  // 0-based source line containing a char offset — used to scroll the preview
  // back to the block that held the caret at blur time.
  function lineAtOffset(src: string, offset: number): number {
    let line = 0;
    const stop = Math.min(offset, src.length);
    for (let i = 0; i < stop; i++) if (src[i] === "\n") line++;
    return line;
  }

  const btnCls =
    "inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/60 px-2 py-0.5 text-[11px] text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-800";

  $effect(() => {
    // Sync external value when not actively editing.
    if (!editing) draft = value;
  });

  let rendered = $derived(
    draft.trim() ? md.render(draft, { progressInteractive: true }) : "",
  );
  let wc = $derived(countWords(draft));

  // Outline: headings pulled from the source (fences skipped), in the same
  // document order as the rendered h1–h3 elements — index i here matches the
  // i-th heading in the preview DOM.
  type Heading = { level: number; text: string };
  function extractHeadings(src: string): Heading[] {
    const out: Heading[] = [];
    let inFence = false;
    for (const line of src.split("\n")) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const m = /^(#{1,3})\s+(.+)/.exec(line);
      if (!m) continue;
      const text = m[2]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`~]/g, "")
        .trim();
      if (text) out.push({ level: m[1].length, text });
    }
    return out;
  }
  let headings = $derived(outline ? extractHeadings(draft) : []);

  function scrollToHeading(i: number) {
    const els = previewEl?.querySelectorAll("h1, h2, h3");
    els?.[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Hydrate ```mermaid placeholders to SVG. `{@html rendered}` rewrites the
  // preview's innerHTML out from under us — on edit, on commit (the saved value
  // round-trips back as a fresh string), and on theme change — so a one-shot
  // effect can race the paint or get wiped and never retry. A MutationObserver
  // re-runs hydration whenever the rendered HTML changes; the source+theme cache
  // and the renderedKey guard make repeat passes cheap and stop it from looping
  // on its own SVG injection. Re-established when the theme flips.
  $effect(() => {
    const el = previewEl;
    const t = theme.resolved === "dark" ? "dark" : "default";
    if (!el) return;
    hydrateMermaidBlocks(el, t);
    void hydrateBoardEmbeds(el);
    hydrateStagesBlocks(el);
    const mo = new MutationObserver(() => {
      hydrateMermaidBlocks(el, t);
      void hydrateBoardEmbeds(el);
      hydrateStagesBlocks(el);
    });
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  });

  // When the rendered note is taller than the viewport, the top Edit button
  // scrolls out of reach — surface a second one at the bottom. ResizeObserver
  // re-measures as content (incl. late-loading images) changes height.
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

  // Once the preview has (re)mounted after a commit, scroll it to the block we
  // were editing. previewEl transitions undefined→defined on the edit→preview
  // swap, which re-runs this; pendingScrollLine is only set by commit(), so it
  // no-ops on every other render.
  $effect(() => {
    const el = previewEl;
    const line = pendingScrollLine;
    if (!el || line == null) return;
    pendingScrollLine = null;
    let best: Element | null = null;
    let bestLine = -1;
    for (const n of el.querySelectorAll("[data-line]")) {
      const l = Number(n.getAttribute("data-line"));
      if (Number.isFinite(l) && l <= line && l > bestLine) {
        bestLine = l;
        best = n;
      }
    }
    (best ?? el.querySelector("[data-line]"))?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  });

  function startEditing() {
    if (readOnly) return;
    editing = true;
    queueMicrotask(() => textarea?.focus());
  }

  // Toggle preview ⇄ edit — bound by NoteView to the ⌘E shortcut. No-op on
  // read-only surfaces. Cancels any open per-block edit first.
  export function toggleEdit() {
    if (readOnly) return;
    if (blockEdit) cancelBlock();
    if (editing) void finishEditing();
    else startEditing();
  }

  // Blur handler on the textarea. For notes (floatingEdit) edit mode is LOCKED:
  // losing focus (clicking away, switching windows/apps) only *saves* the draft
  // and stays in edit mode — so it never renders or scroll-jumps behind your
  // back, and you can switch windows and come right back to keep editing. You
  // leave edit mode explicitly via the Done button. Other surfaces keep the
  // classic click-outside-to-preview.
  async function commit() {
    // Focusing the link/icon picker blurs the textarea; don't act while one is
    // open — we resume editing once it closes.
    if (linkPickerOpen || iconPickerOpen) return;
    if (floatingEdit) {
      await onCommit(draft); // save only; stay in edit mode
      return;
    }
    const caret = textarea?.selectionStart;
    if (typeof caret === "number") pendingScrollLine = lineAtOffset(draft, caret);
    editing = false;
    await onCommit(draft);
  }

  // Explicit exit → render the note, landing on the block you were editing.
  async function finishEditing() {
    const caret = textarea?.selectionStart;
    if (typeof caret === "number") pendingScrollLine = lineAtOffset(draft, caret);
    editing = false;
    await onCommit(draft);
  }

  let iconPickerOpen = $state(false);
  function openIconPicker() {
    editing = true;
    iconPickerOpen = true;
  }
  function insertIcon(name: string) {
    const token = `:${name}:`;
    const base = editing ? draft : value;
    const caret = textarea?.selectionStart ?? base.length;
    draft = base.slice(0, caret) + token + base.slice(caret);
    editing = true;
    iconPickerOpen = false;
    queueMicrotask(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret + token.length, caret + token.length);
    });
  }

  // ---- Per-block editing (Sprint 67) ----
  // Each rendered block that carries a source range (data-line + data-end-line,
  // stamped by markdownit) gets a hover pencil; clicking it opens a small
  // in-place textarea seeded with just that block's raw markdown, spliced back
  // into the whole note on save. Preview mode + editable surfaces only.
  let previewWrap: HTMLDivElement | undefined = $state();
  let hoveredBlockEl: HTMLElement | null = null; // non-reactive DOM ref
  let blockPencilTop = $state<number | null>(null);
  let blockEdit = $state<
    { start: number; end: number; top: number; left: number; width: number } | null
  >(null);
  let blockDraft = $state("");
  let blockTextarea: HTMLTextAreaElement | undefined = $state();

  // Hover-intent: the pencil sits in the right margin, so moving the cursor from
  // the block out to it briefly leaves the preview — hide on a short delay (and
  // cancel it when the cursor lands on the pencil) so it doesn't vanish mid-reach.
  let pencilHideTimer: ReturnType<typeof setTimeout> | null = null;
  function cancelPencilHide() {
    if (pencilHideTimer) {
      clearTimeout(pencilHideTimer);
      pencilHideTimer = null;
    }
  }
  function schedulePencilHide() {
    cancelPencilHide();
    pencilHideTimer = setTimeout(() => {
      hoveredBlockEl = null;
      blockPencilTop = null;
    }, 240);
  }
  function onPreviewMove(e: MouseEvent) {
    if (readOnly || blockEdit || editing) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-line][data-end-line]",
    );
    if (el && previewEl?.contains(el)) {
      cancelPencilHide();
      hoveredBlockEl = el;
      blockPencilTop = el.offsetTop;
    } else {
      schedulePencilHide();
    }
  }
  function onPreviewLeave() {
    if (!blockEdit) schedulePencilHide();
  }
  function editHoveredBlock() {
    const el = hoveredBlockEl;
    if (!el) return;
    const start = Number(el.dataset.line);
    const end = Number(el.dataset.endLine);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    blockDraft = draft.split("\n").slice(start, end).join("\n");
    blockEdit = {
      start,
      end,
      top: el.offsetTop,
      left: el.offsetLeft,
      width: el.offsetWidth,
    };
    blockPencilTop = null;
    queueMicrotask(() => blockTextarea?.focus());
  }
  async function saveBlock() {
    const be = blockEdit;
    if (!be) return;
    blockEdit = null;
    const next = replaceLinesInSource(draft, be.start, be.end, blockDraft);
    draft = next;
    await onCommit(next);
  }
  function cancelBlock() {
    blockEdit = null;
    blockPencilTop = null;
  }
  function onBlockKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelBlock();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void saveBlock();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const ta = blockTextarea;
      if (!ta) return;
      const s = ta.selectionStart;
      const en = ta.selectionEnd;
      blockDraft = blockDraft.slice(0, s) + "  " + blockDraft.slice(en);
      queueMicrotask(() => ta.setSelectionRange(s + 2, s + 2));
    }
  }

  // Outline popover (Sprint 67) — an on-demand section jumper (replaces the
  // always-on floating column that overlapped the note).
  let outlineOpen = $state(false);

  function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    // Source-mutating clicks (checkbox / stepper / section toggle) only apply
    // when editable; a read-only reference just navigates links.
    if (!readOnly) {
      // Task checkboxes: flip the matching `[ ]`/`[x]` marker in the source and
      // persist — the re-render restores the checkbox from the new source.
      if (target instanceof HTMLInputElement && target.classList.contains("md-task")) {
        e.preventDefault();
        const idx = Number(target.dataset.task);
        if (Number.isFinite(idx)) void toggleTask(idx);
        return;
      }
      // Progress steppers: step the matching `n/d` bar in the source and persist.
      const step = target.closest<HTMLElement>(".md-progress-step");
      if (step) {
        e.preventDefault();
        const idx = Number(step.dataset.progress);
        const delta = step.dataset.dir === "inc" ? 1 : -1;
        if (Number.isFinite(idx)) void stepProgress(idx, delta);
        return;
      }
      // Collapsible section header: flip the `>`/`>>` marker in the source and
      // persist (so the open/closed status survives edit → view). A link inside
      // the heading falls through to the anchor handling below.
      const sumEl = target.closest<HTMLElement>(".md-section-sum");
      if (sumEl && sumEl.dataset.section !== undefined && !target.closest("a")) {
        e.preventDefault();
        const idx = Number(sumEl.dataset.section);
        if (Number.isFinite(idx)) void toggleSection(idx);
        return;
      }
    }
    // Embedded board header: open the board (read-only embed → jump to it).
    if (target.closest(".md-board-head")) {
      const embed = target.closest<HTMLElement>(".md-board-embed[data-board]");
      const id = Number(embed?.dataset.board);
      if (Number.isFinite(id)) {
        e.preventDefault();
        if (app.feedbackBoards.some((b) => b.id === id))
          void app.openFeedbackBoard(id);
        else app.setFlash("That board no longer exists");
      }
      return;
    }
    const anchor = target.closest("a");
    if (anchor) {
      e.preventDefault();
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (onLinkClick) {
        const handled = onLinkClick(href);
        if (handled === true) return;
      }
      // Internal entity links: [label](note:5) etc. — navigate in-app, but
      // guard against links to entities that have since been deleted so we
      // surface a friendly flash instead of an error screen.
      const ent = href.match(
        /^(note|list|flashcard|blueprint|storyboard|board):(\d+)$/,
      );
      if (ent) {
        const id = Number(ent[2]);
        if (Number.isFinite(id)) navigateEntity(ent[1], id);
        return;
      }
      if (/^https?:\/\//.test(href)) {
        openUrl(href).catch((err) =>
          app.setFlash(`Couldn't open link: ${err}`),
        );
      }
      return;
    }
    // A plain click in the preview does nothing — editing is via the Edit
    // button (or the floating FAB for notes). Link/checkbox clicks above still
    // act. This keeps reading uninterrupted.
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

  async function toggleSection(idx: number) {
    // Flip the section's `>`/`>>` marker in the source and persist, so the
    // open/closed status survives an edit → view round-trip.
    const next = toggleSectionInSource(draft, idx);
    if (next === null) return;
    draft = next;
    await onCommit(next);
  }

  // Navigate to a linked entity, or flash if it no longer exists (broken link).
  function navigateEntity(kind: string, id: number) {
    if (kind === "note") {
      if (app.notes.some((n) => n.id === id)) app.selectNote(id);
      else app.setFlash("That note no longer exists");
    } else if (kind === "list") {
      if (app.lists.some((l) => l.id === id)) app.select(id);
      else app.setFlash("That list no longer exists");
    } else if (kind === "flashcard") {
      if (app.flashcards.some((c) => c.id === id)) app.openFlashcardInDeck(id);
      else app.setFlash("That flashcard no longer exists");
    } else if (kind === "blueprint") {
      if (app.blueprints.some((b) => b.id === id)) app.openBlueprint(id);
      else app.setFlash("That blueprint no longer exists");
    } else if (kind === "storyboard") {
      if (app.storyboards.some((s) => s.id === id)) app.openStoryboard(id);
      else app.setFlash("That storyboard no longer exists");
    } else if (kind === "board") {
      if (app.feedbackBoards.some((b) => b.id === id)) app.openFeedbackBoard(id);
      else app.setFlash("That board no longer exists");
    }
  }

  function onTextareaKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      (e.target as HTMLTextAreaElement).blur();
    } else if (e.key === "Tab") {
      // Insert two spaces instead of moving focus out of the editor.
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

  function insertDiagram() {
    const before = draft.length > 0 && !draft.endsWith("\n") ? "\n" : "";
    insertAtCursor(
      `${before}\n\`\`\`mermaid\nflowchart TD\n  A[Start] --> B[End]\n\`\`\`\n`,
    );
  }

  // Slash-menu edit: replace the whole draft + place the caret (the menu
  // strips the "/query" and inserts the chosen snippet).
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
      <span class="italic">type <kbd class="rounded border border-neutral-300/70 px-1 not-italic dark:border-neutral-600/70">/</kbd> for commands · click outside to preview</span>
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
        onclick={openIconPicker}
        title="Insert icon"
        class={btnCls}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 15l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8L10 1.6z" />
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
      onIcon={openIconPicker}
    />
  </div>
  {#if iconPickerOpen}
    <IconPicker onPick={insertIcon} onClose={() => (iconPickerOpen = false)} />
  {/if}
  {#if floatingEdit}
    <!-- Locked edit mode: leave it explicitly (blur only saves). Toggle of the
         preview's Edit FAB. -->
    <button
      type="button"
      onclick={finishEditing}
      title="Finish editing — show the rendered note (⌘E)"
      aria-label="Finish editing"
      style={fabStyle}
      class="{fabPos} bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full btn-accent px-4 py-2.5 text-sm font-medium shadow-lg transition-colors"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L4.3 10.7a1 1 0 011.4-1.4l2.8 2.79 6.8-6.79a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>
      Done
    </button>
  {/if}
{:else if rendered}
  <!-- `relative` only when the small top-right Edit button needs anchoring; with
       floatingEdit the FAB should anchor higher up (the modal, when contained). -->
  <div class:relative={!floatingEdit}>
    {#if !floatingEdit && !readOnly}
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
    {/if}
    <div class="relative" role="presentation" bind:this={previewWrap} onmouseleave={onPreviewLeave}>
      <div
        bind:this={previewEl}
        role="presentation"
        data-md-sections={readOnly ? undefined : "persist"}
        style="min-height: {minHeight};"
        class="markdown-body w-full overflow-x-hidden rounded-md px-3 py-2 text-sm leading-relaxed text-neutral-800 dark:text-neutral-200"
        onclick={onPreviewClick}
        onmousemove={onPreviewMove}
        onkeydown={() => {}}
      >
        {@html rendered}
      </div>
      {#if blockPencilTop !== null && !blockEdit && !readOnly}
        <button
          type="button"
          onmousedown={(e) => e.preventDefault()}
          onclick={editHoveredBlock}
          onmouseenter={cancelPencilHide}
          onmouseleave={schedulePencilHide}
          style="top: {blockPencilTop}px; right: -1.75rem;"
          class="absolute z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200/70 bg-white/90 text-neutral-500 shadow-sm backdrop-blur transition-colors hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-300"
          title="Edit this block"
          aria-label="Edit this block"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        </button>
      {/if}
      {#if blockEdit}
        <div class="absolute z-20" style="top: {blockEdit.top}px; left: {blockEdit.left}px; width: {blockEdit.width}px;">
          <textarea
            bind:this={blockTextarea}
            bind:value={blockDraft}
            use:autosize={blockDraft}
            onblur={saveBlock}
            onkeydown={onBlockKey}
            style="min-height: 3rem; border-color: var(--accent);"
            class="w-full resize-none overflow-hidden rounded-md border-2 bg-white px-3 py-2 font-mono text-[13px] leading-relaxed shadow-xl outline-none dark:bg-neutral-900 dark:text-neutral-100"
          ></textarea>
          <div class="mt-1 flex items-center gap-1.5">
            <button type="button" class="btn-accent rounded px-2 py-1 text-xs font-medium" onclick={saveBlock}>Save block</button>
            <button type="button" class="rounded border border-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-300" onmousedown={(e) => e.preventDefault()} onclick={cancelBlock}>Cancel</button>
            <span class="ml-auto text-[10px] text-neutral-400">⌘↩ save · Esc cancel</span>
          </div>
        </div>
      {/if}
    </div>
    {#if outline && headings.length >= 2 && !app.splitOpen && !blockEdit}
      <!-- On-demand section jumper, stacked just above the Edit FAB (bottom-
           right), replacing the old always-on column that overlapped the note. -->
      <div class="fixed bottom-20 right-6 z-20 flex flex-col items-end">
        {#if outlineOpen}
          <div class="mb-2 max-h-[60vh] w-60 overflow-y-auto rounded-xl border border-neutral-200/70 bg-white/95 p-2 shadow-xl backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/90">
            <p class="mb-1 px-2 text-[10px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
              On this page
            </p>
            <ul>
              {#each headings as h, i (i)}
                <li>
                  <button
                    type="button"
                    class="block w-full truncate rounded py-1 pr-2 text-left text-xs text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-[color:var(--accent)] dark:text-neutral-300 dark:hover:bg-neutral-800"
                    style="padding-left: {8 + (h.level - 1) * 12}px"
                    title={h.text}
                    onclick={() => {
                      scrollToHeading(i);
                      outlineOpen = false;
                    }}
                  >
                    {h.text}
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <button
          type="button"
          onclick={() => (outlineOpen = !outlineOpen)}
          title="Jump to a section"
          aria-label="Document outline"
          class="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/70 bg-white/90 px-3 py-2 text-xs font-medium text-neutral-700 shadow-lg backdrop-blur transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M3 5.75A.75.75 0 013.75 5h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 5.75zM3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10zm0 4.25a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" /></svg>
          Sections
        </button>
      </div>
    {/if}
    {#if isLarge && !floatingEdit && !readOnly}
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
    {#if floatingEdit && !readOnly}
      <!-- One floating Edit FAB in the bottom-right — always reachable while
           reading, replacing the inline top/bottom buttons (notes). -->
      <button
        type="button"
        onclick={startEditing}
        title="Edit note (⌘E)"
        aria-label="Edit note"
        style={fabStyle}
        class="{fabPos} bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full border border-neutral-200/70 bg-white/90 px-4 py-2.5 text-sm font-medium text-neutral-700 shadow-lg backdrop-blur transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900/85 dark:text-neutral-200 dark:hover:bg-neutral-800"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
        Edit
      </button>
    {/if}
  </div>
{:else if readOnly}
  <p class="px-3 py-2 text-sm italic text-neutral-400 dark:text-neutral-500">
    (empty)
  </p>
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
  /* Headings use a serif display face (system "New York" / Iowan) so they read
     as titles, not just bigger body text. H1 gets a hairline rule. */
  .markdown-body :global(h1),
  .markdown-body :global(h2),
  .markdown-body :global(h3) {
    font-family: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino,
      Georgia, serif;
  }
  .markdown-body :global(h1) {
    font-size: 2rem;
    font-weight: 650;
    line-height: 1.15;
    margin: 1rem 0 0.55rem;
    padding-bottom: 0.3rem;
    border-bottom: 2px solid rgba(0, 0, 0, 0.08);
  }
  :global(html.dark) .markdown-body :global(h1) {
    border-bottom-color: rgba(255, 255, 255, 0.1);
  }
  .markdown-body :global(h2) {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0.75rem 0 0.35rem;
  }
  .markdown-body :global(h3) {
    font-size: 1.18rem;
    font-weight: 600;
    margin: 0.55rem 0 0.25rem;
  }
  .markdown-body :global(p) {
    margin: 0.35rem 0;
  }
  /* list-style lives in app.css (base + nested stepping) so the nested rules
     aren't out-specificity'd by this scoped rule; here we only set spacing. */
  .markdown-body :global(ul),
  .markdown-body :global(ol) {
    padding-left: 1.4rem;
    margin: 0.35rem 0;
  }
  .markdown-body :global(li) {
    margin: 0.15rem 0;
  }
  /* A plain `>` quote (no [!TYPE]) → a soft "note" card: accent bar + tint +
     quote glyph. Typed callouts (blockquote.callout) are styled in app.css. */
  .markdown-body :global(blockquote:not(.callout)) {
    position: relative;
    margin: 0.55rem 0;
    padding: 0.6rem 0.85rem 0.6rem 2.2rem;
    border: 1px solid color-mix(in srgb, var(--accent) 16%, transparent);
    border-left: 3px solid var(--accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 7%, transparent);
    color: inherit;
  }
  .markdown-body :global(blockquote:not(.callout))::before {
    content: "\201C";
    position: absolute;
    left: 0.55rem;
    top: 0.05rem;
    font-family: Georgia, serif;
    font-size: 1.6rem;
    line-height: 1;
    color: var(--accent);
    opacity: 0.6;
  }
  .markdown-body :global(blockquote:not(.callout) > :first-child) {
    margin-top: 0;
  }
  .markdown-body :global(blockquote:not(.callout) > :last-child) {
    margin-bottom: 0;
  }
  /* Links render as small button-like chips — easier to spot and click than
     underlined text (Sprint 23 follow-up). */
  /* Blocks that render their own anchors (cards, the links / linkchips lists)
     opt out of the generic chip look. */
  .markdown-body
    :global(a:not(.md-card):not(.md-link-row):not(.md-linkchip)) {
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
  .markdown-body
    :global(a:not(.md-card):not(.md-link-row):not(.md-linkchip):hover) {
    background: rgba(37, 99, 235, 0.18);
  }
  :global(html.dark) .markdown-body
    :global(a:not(.md-card):not(.md-link-row):not(.md-linkchip)) {
    color: #60a5fa;
    border-color: rgba(96, 165, 250, 0.35);
    background: rgba(96, 165, 250, 0.12);
  }
  :global(html.dark) .markdown-body
    :global(a:not(.md-card):not(.md-link-row):not(.md-linkchip):hover) {
    background: rgba(96, 165, 250, 0.22);
  }
  /* Inline code only — code inside <pre> must NOT get the pill background
     (it's an inline element, so a multi-line block would show a highlight
     strip per wrapped line). */
  .markdown-body :global(:not(pre) > code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0 0.25rem;
    border-radius: 3px;
    font-size: 0.85em;
  }
  :global(html.dark) .markdown-body :global(:not(pre) > code) {
    background: rgba(255, 255, 255, 0.08);
  }
  .markdown-body :global(pre > code) {
    display: block;
    background: transparent;
    padding: 0;
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
  .markdown-body :global(.mermaid-block svg) {
    max-width: 100%;
    height: auto;
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
