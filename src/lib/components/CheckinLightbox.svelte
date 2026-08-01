<script lang="ts">
  import { untrack } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import { checkinSrc, type Checkin } from "$lib/ipc";

  type Props = {
    checkins: Checkin[];
    startIndex?: number;
    onClose: () => void;
  };
  let { checkins, startIndex = 0, onClose }: Props = $props();

  // Seed from startIndex once (the component is remounted for each open).
  let idx = $state(untrack(() => startIndex));
  let active = $derived(
    checkins[Math.min(idx, Math.max(0, checkins.length - 1))],
  );

  // If the last check-in is deleted out from under us, close.
  $effect(() => {
    if (checkins.length === 0) onClose();
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowRight") idx = (idx + 1) % checkins.length;
    else if (e.key === "ArrowLeft")
      idx = (idx - 1 + checkins.length) % checkins.length;
  }

  async function del() {
    await app.deleteCheckin(active.id);
    idx = 0; // the $effect closes us if that was the last one
  }
</script>

<svelte:window onkeydown={onKey} />

{#if active}
  <button
    type="button"
    class="fixed inset-0 z-[110] cursor-default bg-neutral-900/75 backdrop-blur-sm"
    aria-label="Close check-in"
    onclick={onClose}
  ></button>
  <div class="fixed left-1/2 top-1/2 z-[111] w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
    <figure class="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl">
      <img src={checkinSrc(active.path)} alt="Check-in" class="w-full" />
      <figcaption class="flex items-center justify-between px-4 py-2.5 text-xs text-neutral-300">
        <span>📸 Captured when this list was created</span>
        <button
          type="button"
          class="rounded p-1 text-neutral-400 transition-colors hover:bg-red-950/60 hover:text-red-400"
          title="Delete check-in"
          aria-label="Delete check-in"
          onclick={del}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 6a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 112 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
        </button>
      </figcaption>
    </figure>
    {#if checkins.length > 1}
      <div class="mt-2 flex flex-wrap justify-center gap-1.5">
        {#each checkins as c, i (c.id)}
          <button
            type="button"
            class="h-10 w-10 overflow-hidden rounded-md border-2 transition-colors"
            class:border-white={i === idx}
            class:border-transparent={i !== idx}
            aria-label="Check-in {i + 1}"
            onclick={() => (idx = i)}
          >
            <img src={checkinSrc(c.path)} alt="" class="h-full w-full object-cover" />
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}
