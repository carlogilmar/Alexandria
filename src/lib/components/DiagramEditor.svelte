<script lang="ts">
  import { save } from "@tauri-apps/plugin-dialog";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { autosize } from "$lib/autosize";
  import { renderMermaid } from "$lib/mermaid";
  import { saveBinaryFile } from "$lib/ipc";

  type Props = {
    value: string;
    title: string;
    onCommit: (next: string) => void | Promise<void>;
  };
  let { value, title, onCommit }: Props = $props();

  let draft = $state("");
  let svg = $state(""); // last good render
  let renderError = $state<string | null>(null);
  let exporting = $state(false);
  let previewEl: HTMLDivElement | undefined = $state();
  let textarea: HTMLTextAreaElement | undefined = $state();

  let isDark = $derived(theme.resolved === "dark");

  // Sync external source in (value only changes on commit / diagram switch).
  $effect(() => {
    draft = value;
  });

  // Debounced live render. Re-runs on source or theme change. On a syntax
  // error we keep the last good SVG and surface the message.
  $effect(() => {
    const src = draft;
    const themeName = isDark ? "dark" : "default";
    if (!src.trim()) {
      svg = "";
      renderError = null;
      return;
    }
    const timer = setTimeout(async () => {
      try {
        svg = await renderMermaid(src, themeName);
        renderError = null;
      } catch (e) {
        renderError = e instanceof Error ? e.message : String(e);
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  async function commit() {
    await onCommit(draft);
  }

  function onTextareaKey(e: KeyboardEvent) {
    // Tab inserts two spaces instead of moving focus — handy for indenting.
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target as HTMLTextAreaElement;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      draft = draft.slice(0, start) + "  " + draft.slice(end);
      queueMicrotask(() => ta.setSelectionRange(start + 2, start + 2));
    }
  }

  function safeName(s: string): string {
    return (s.trim() || "diagram").replace(/[^a-z0-9-_]+/gi, "_");
  }

  async function exportPng() {
    const svgEl = previewEl?.querySelector("svg");
    if (!svgEl) return;
    exporting = true;
    try {
      // Resolve intrinsic size from the viewBox (mermaid sets max-width via
      // style, so getBoundingClientRect alone can under-report).
      const vb = svgEl.viewBox?.baseVal;
      const rect = svgEl.getBoundingClientRect();
      const w = Math.ceil(vb && vb.width ? vb.width : rect.width || 800);
      const h = Math.ceil(vb && vb.height ? vb.height : rect.height || 600);

      const clone = svgEl.cloneNode(true) as SVGElement;
      clone.setAttribute("width", String(w));
      clone.setAttribute("height", String(h));
      const xml = new XMLSerializer().serializeToString(clone);
      const dataUrl =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("could not rasterize SVG"));
        img.src = dataUrl;
      });

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      // Flat background so the PNG isn't transparent when pasted elsewhere.
      ctx.fillStyle = isDark ? "#1e1e1e" : "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png"),
      );
      if (!blob) throw new Error("PNG encoding failed");
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));

      const path = await save({
        defaultPath: `${safeName(title)}.png`,
        filters: [{ name: "PNG", extensions: ["png"] }],
      });
      if (!path) return;
      await saveBinaryFile(path, bytes);
      app.setFlash("PNG exported");
    } catch (e) {
      app.setFlash(`Couldn't export PNG: ${e instanceof Error ? e.message : e}`);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="flex flex-col gap-4">
  <!-- Source -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between px-1 text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
      <span>Mermaid source</span>
      <a
        href="https://mermaid.js.org/intro/"
        target="_blank"
        rel="noopener noreferrer"
        class="lowercase text-neutral-400 underline decoration-dotted hover:text-neutral-600 dark:hover:text-neutral-300"
      >syntax help</a>
    </div>
    <textarea
      bind:this={textarea}
      bind:value={draft}
      use:autosize={draft}
      onblur={commit}
      onkeydown={onTextareaKey}
      placeholder={"graph TD\n  A[Start] --> B{Choice}\n  B -->|yes| C[Do this]\n  B -->|no| D[Do that]"}
      spellcheck="false"
      style="min-height: 14rem;"
      class="w-full resize-none overflow-hidden rounded-md border border-neutral-200/60 bg-white/60 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none placeholder:text-neutral-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/60 dark:bg-neutral-900/40 dark:text-neutral-100 dark:placeholder:text-neutral-500"
    ></textarea>
  </div>

  <!-- Preview -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between px-1 text-[11px] uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
      <span>Preview</span>
      <button
        type="button"
        disabled={!svg || exporting}
        onclick={exportPng}
        class="inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-white/60 px-2 py-0.5 text-[11px] normal-case tracking-normal text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3">
          <path fill-rule="evenodd" d="M10 2a.75.75 0 01.75.75v6.638l1.96-2.158a.75.75 0 111.08 1.04l-3.25 3.5a.75.75 0 01-1.08 0l-3.25-3.5a.75.75 0 111.08-1.04l1.96 2.158V2.75A.75.75 0 0110 2z" clip-rule="evenodd" />
          <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
        </svg>
        {exporting ? "Exporting…" : "Export PNG"}
      </button>
    </div>

    <div
      class="relative min-h-[60vh] overflow-auto rounded-md border border-neutral-200/60 bg-white/60 p-3 dark:border-neutral-700/60 dark:bg-neutral-900/40"
    >
      {#if renderError}
        <div class="absolute inset-x-2 top-2 z-10 rounded-md border border-rose-300/70 bg-rose-50/95 px-3 py-1.5 text-[12px] text-rose-700 shadow-sm dark:border-rose-900/70 dark:bg-rose-950/80 dark:text-rose-300">
          {renderError}
        </div>
      {/if}
      {#if svg}
        <div bind:this={previewEl} class="diagram-svg flex justify-center">
          {@html svg}
        </div>
      {:else if !draft.trim()}
        <p class="grid h-full place-items-center text-center text-sm text-neutral-400 dark:text-neutral-500">
          Write Mermaid on the left to see it here.
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .diagram-svg :global(svg) {
    max-width: 100%;
    height: auto;
  }
</style>
