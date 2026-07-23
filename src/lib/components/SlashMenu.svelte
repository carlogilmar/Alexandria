<script lang="ts">
  // A Notion-style "/" command menu for the markdown textareas. Type `/` at
  // the start of a line or after a space → a popup opens AT THE CARET with
  // insert commands; keep typing to filter, ↑/↓ to move, Enter/Tab to insert,
  // Esc to dismiss. Shared by MarkdownEditor + ArticleEditor.
  //
  // The caret's pixel position in a <textarea> isn't exposed by the DOM, so we
  // use the standard "mirror div" technique: clone the textarea's text + styles
  // into a hidden div and measure a marker span at the caret offset.

  type Cmd = {
    id: string;
    label: string;
    icon: string;
    hint?: string;
    keywords?: string;
    snippet?: string;
    caretOffset?: number; // caret position within the snippet (default: end)
    action?: "link" | "image";
  };

  type Props = {
    textarea: HTMLTextAreaElement | undefined;
    // Replace the whole draft and place the caret. The editor owns `draft`.
    onEdit: (nextValue: string, caret: number) => void;
    onLink?: () => void;
    onImage?: () => void;
  };
  let { textarea, onEdit, onLink, onImage }: Props = $props();

  const TABLE = "\n| Column | Column |\n| --- | --- |\n| Cell | Cell |\n";
  const MERMAID = "\n```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```\n";
  const CARDS =
    "\n```cards\n" +
    "title: My site\ndesc: Short description\nlink: https://example.com\ncolor: blue\nicon: 🔗\n" +
    "---\n" +
    "title: A blueprint\ndesc: Bold filled card\nlink: blueprint:1\ncolor: violet\nfilled: true\n" +
    "```\n";
  const BAR_CHART =
    "\n```chart\ntype: bar\ntitle: Weekly commits\ncolor: blue\n" +
    "Mon: 5\nTue: 8\nWed: 3\nThu: 6\nFri: 9\n```\n";
  const DONUT_CHART =
    "\n```chart\ntype: donut\ntitle: Time split\n" +
    "Coding: 8\nMeetings: 3\nReview: 4\nOther: 2\n```\n";
  const MARQUEE = "\n```marquee blue normal\n🚀 Important — announce it here\n```\n";
  const PROGRESS =
    "\n```progress\nTasks: 4/10\nReading: 60%\nSavings goal: 45 green\n```\n";

  const COMMANDS: Cmd[] = [
    { id: "h1", label: "Heading 1", icon: "H₁", hint: "# ", keywords: "title heading", snippet: "# " },
    { id: "h2", label: "Heading 2", icon: "H₂", hint: "## ", keywords: "subheading", snippet: "## " },
    { id: "h3", label: "Heading 3", icon: "H₃", hint: "### ", snippet: "### " },
    { id: "bullet", label: "Bulleted list", icon: "•", keywords: "list ul unordered", snippet: "- " },
    { id: "numbered", label: "Numbered list", icon: "1.", keywords: "list ol ordered", snippet: "1. " },
    { id: "todo", label: "Checklist", icon: "☑", keywords: "task todo checkbox", snippet: "- [ ] " },
    { id: "quote", label: "Quote", icon: "❝", keywords: "blockquote", snippet: "> " },
    { id: "callout", label: "Callout", icon: "💡", keywords: "note tip warning admonition", snippet: "> [!NOTE]\n> " },
    { id: "code", label: "Code block", icon: "‹›", keywords: "fence pre snippet", snippet: "```\n\n```\n", caretOffset: 4 },
    { id: "table", label: "Table", icon: "▦", keywords: "grid rows columns", snippet: TABLE },
    { id: "diagram", label: "Diagram", icon: "📈", keywords: "mermaid flowchart graph", snippet: MERMAID },
    { id: "cards", label: "Cards", icon: "▤", keywords: "dashboard links tiles", snippet: CARDS },
    { id: "bar-chart", label: "Bar chart", icon: "▊", keywords: "chart graph bar data viz", snippet: BAR_CHART },
    { id: "donut-chart", label: "Donut chart", icon: "◑", keywords: "chart pie donut data viz", snippet: DONUT_CHART },
    { id: "marquee", label: "Marquee banner", icon: "🎞", keywords: "marquee scroll banner ticker announcement", snippet: MARQUEE },
    { id: "progress", label: "Progress bars", icon: "▰", keywords: "progress bar percent goal tracker", snippet: PROGRESS },
    { id: "divider", label: "Divider", icon: "—", keywords: "hr rule separator", snippet: "\n---\n" },
    { id: "link", label: "Link", icon: "🔗", keywords: "url entity href", action: "link" },
    { id: "image", label: "Image", icon: "🖼", keywords: "picture photo", action: "image" },
  ];

  let open = $state(false);
  let query = $state("");
  let triggerStart = $state(0);
  let active = $state(0);
  let pos = $state({ top: 0, left: 0, above: false });

  let items = $derived.by<Cmd[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.includes(q) ||
        (c.keywords ?? "").includes(q),
    );
  });

  $effect(() => {
    if (active >= items.length) active = Math.max(0, items.length - 1);
  });

  function close() {
    open = false;
    query = "";
  }

  // Compute the caret's viewport coordinates via a mirror div.
  function caretXY(ta: HTMLTextAreaElement, index: number) {
    const s = getComputedStyle(ta);
    const div = document.createElement("div");
    const copy = [
      "boxSizing",
      "width",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "fontStyle",
      "lineHeight",
      "letterSpacing",
      "textTransform",
    ] as const;
    for (const p of copy) div.style[p] = s[p];
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.overflow = "hidden";
    div.style.width = `${ta.clientWidth}px`;
    div.textContent = ta.value.slice(0, index);
    const marker = document.createElement("span");
    marker.textContent = ta.value.slice(index) || ".";
    div.appendChild(marker);
    document.body.appendChild(div);
    const rect = ta.getBoundingClientRect();
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
    const top = rect.top + marker.offsetTop - ta.scrollTop + lh;
    const left = rect.left + marker.offsetLeft - ta.scrollLeft;
    document.body.removeChild(div);
    return { top, left };
  }

  function reposition() {
    if (!textarea) return;
    const { top, left } = caretXY(textarea, textarea.selectionStart ?? 0);
    const MENU_H = 320;
    const above = top + MENU_H > window.innerHeight;
    pos = {
      top: above ? top : top,
      left: Math.min(left, window.innerWidth - 280),
      above,
    };
  }

  // Detect (or dismiss) a `/` trigger based on the current caret. A trigger is
  // a `/` at start-of-text / after whitespace, followed by a space-free query.
  function detect() {
    const ta = textarea;
    if (!ta) return close();
    const val = ta.value;
    const caret = ta.selectionStart ?? 0;
    let i = caret - 1;
    while (i >= 0) {
      const ch = val[i];
      if (ch === "/") break;
      if (ch === " " || ch === "\n" || ch === "\t") return close();
      i--;
    }
    if (i < 0 || val[i] !== "/") return close();
    const prev = i === 0 ? "" : val[i - 1];
    if (prev && prev !== " " && prev !== "\n" && prev !== "\t") return close();
    triggerStart = i;
    query = val.slice(i + 1, caret);
    if (!open) active = 0;
    open = true;
    reposition();
  }

  function choose(cmd: Cmd) {
    const ta = textarea;
    if (!ta) return close();
    const val = ta.value;
    const caret = ta.selectionStart ?? 0;
    // Strip the "/query" that triggered the menu.
    const withoutTrigger = val.slice(0, triggerStart) + val.slice(caret);
    if (cmd.action) {
      // Remove the trigger, put the caret where it was, then run the picker.
      onEdit(withoutTrigger, triggerStart);
      close();
      queueMicrotask(() => {
        if (cmd.action === "link") onLink?.();
        else if (cmd.action === "image") onImage?.();
      });
      return;
    }
    const snippet = cmd.snippet ?? "";
    const next =
      withoutTrigger.slice(0, triggerStart) +
      snippet +
      withoutTrigger.slice(triggerStart);
    const caretAt = triggerStart + (cmd.caretOffset ?? snippet.length);
    onEdit(next, caretAt);
    close();
  }

  // ----- textarea event wiring -----
  function onInput() {
    detect();
  }
  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      active = items.length ? (active + 1) % items.length : 0;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      active = items.length ? (active - 1 + items.length) % items.length : 0;
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (items.length === 0) {
        close();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      choose(items[active] ?? items[0]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  function onKeyup(e: KeyboardEvent) {
    // Re-validate the trigger when the caret moves horizontally / by click.
    if (["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(e.key)) {
      return;
    }
    detect();
  }
  function onBlur() {
    // Delay so a click on a menu item registers first.
    setTimeout(close, 120);
  }

  $effect(() => {
    const ta = textarea;
    if (!ta) return;
    ta.addEventListener("input", onInput);
    ta.addEventListener("keydown", onKeydown, true); // capture: beat textarea handlers
    ta.addEventListener("keyup", onKeyup);
    ta.addEventListener("blur", onBlur);
    return () => {
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("keydown", onKeydown, true);
      ta.removeEventListener("keyup", onKeyup);
      ta.removeEventListener("blur", onBlur);
    };
  });
</script>

{#if open && items.length > 0}
  <div
    class="slash-menu"
    style="left: {pos.left}px; {pos.above
      ? `bottom: ${window.innerHeight - pos.top}px`
      : `top: ${pos.top}px`}; {pos.above ? 'transform: translateY(-1.6em)' : ''}"
    role="listbox"
    tabindex="-1"
  >
    {#each items as cmd, i (cmd.id)}
      <button
        type="button"
        role="option"
        aria-selected={i === active}
        class="slash-item"
        class:slash-active={i === active}
        onmousedown={(e) => e.preventDefault()}
        onmouseenter={() => (active = i)}
        onclick={() => choose(cmd)}
      >
        <span class="slash-icon">{cmd.icon}</span>
        <span class="slash-label">{cmd.label}</span>
        {#if cmd.hint}<span class="slash-hint">{cmd.hint.trim()}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .slash-menu {
    position: fixed;
    z-index: 60;
    width: 260px;
    max-height: 320px;
    overflow-y: auto;
    padding: 0.25rem;
    border-radius: 0.6rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.98);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(0, 0, 0, 0.04);
    backdrop-filter: blur(8px);
  }
  :global(html.dark) .slash-menu {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(28, 28, 32, 0.98);
    box-shadow:
      0 10px 30px rgba(0, 0, 0, 0.5),
      0 0 0 1px rgba(255, 255, 255, 0.06);
  }
  .slash-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.4rem 0.55rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    text-align: left;
    cursor: pointer;
    color: rgb(38, 38, 38);
  }
  :global(html.dark) .slash-item {
    color: rgb(229, 229, 229);
  }
  .slash-active {
    background: rgba(37, 99, 235, 0.12);
  }
  :global(html.dark) .slash-active {
    background: rgba(96, 165, 250, 0.2);
  }
  .slash-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
    font-size: 0.85rem;
    border-radius: 0.35rem;
    background: rgba(0, 0, 0, 0.05);
  }
  :global(html.dark) .slash-icon {
    background: rgba(255, 255, 255, 0.08);
  }
  .slash-label {
    flex: 1;
    font-size: 0.85rem;
  }
  .slash-hint {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.7rem;
    opacity: 0.5;
  }
</style>
