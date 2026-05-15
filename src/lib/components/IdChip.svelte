<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

  type Props = {
    kind: "list" | "note" | "workflow" | "todo";
    id: number;
  };

  let { kind, id }: Props = $props();

  let ref = $derived(`${kind}:${id}`);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ref);
      app.setFlash(`Copied ${ref}`);
    } catch (e) {
      app.setFlash(`Couldn't copy: ${e}`);
    }
  }
</script>

<button
  type="button"
  onclick={copy}
  title="Click to copy — use in the Index page"
  class="inline-flex items-center gap-1 rounded-md border border-neutral-200/70 bg-neutral-100/60 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700 dark:border-neutral-700/70 dark:bg-neutral-800/40 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-200"
>
  <svg viewBox="0 0 20 20" fill="currentColor" class="h-3 w-3 opacity-70">
    <path d="M8 2a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H8z" />
    <path d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h6a2 2 0 002-2v-1H8a3 3 0 01-3-3V6H4z" />
  </svg>
  {ref}
</button>
