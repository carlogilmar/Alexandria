<script lang="ts">
  import { parseTags, tagHue } from "$lib/badges";

  // Renders a title with its #tags stripped out and shown as colored pills.
  let { text }: { text: string } = $props();
  let parsed = $derived(parseTags(text));
</script>

<span>{parsed.text}</span>{#each parsed.tags as t (t)}<span
    class="tag-badge ml-1 inline-block rounded-full px-1.5 py-0.5 align-middle text-[10px] font-medium leading-none"
    style="--h: {tagHue(t)}"
  >{t}</span
  >{/each}

<style>
  .tag-badge {
    background: hsl(var(--h) 70% 50% / 0.16);
    color: hsl(var(--h) 60% 38%);
  }
  :global(html.dark) .tag-badge {
    background: hsl(var(--h) 60% 60% / 0.22);
    color: hsl(var(--h) 70% 72%);
  }
</style>
