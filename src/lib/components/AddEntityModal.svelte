<script lang="ts">
  import { app } from "$lib/stores/app.svelte";

  type Kind = "note" | "article" | "workflow" | "flashcard" | "blueprint";
  type Props = { onClose: () => void };
  let { onClose }: Props = $props();

  let kind = $state<Kind>("article");
  let title = $state("");
  let titleInput: HTMLInputElement | undefined = $state();

  // Focus the title input as soon as we mount.
  $effect(() => {
    queueMicrotask(() => titleInput?.focus());
  });

  const OPTIONS: { value: Kind; label: string; hue: number; hint: string }[] = [
    { value: "article", label: "Article", hue: 268, hint: "Long-form, can embed other items" },
    { value: "note", label: "Note", hue: 217, hint: "Daily markdown note" },
    { value: "workflow", label: "Workflow", hue: 32, hint: "Step-by-step process" },
    { value: "flashcard", label: "Flashcard", hue: 175, hint: "A card in your Flash Deck" },
    { value: "blueprint", label: "Blueprint", hue: 200, hint: "A design canvas for planning software" },
  ];

  async function submit() {
    await app.newEntity(kind, title);
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div
  role="dialog"
  aria-modal="true"
  aria-label="Create new entity"
  class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm dark:bg-neutral-950/60"
>
  <button
    type="button"
    aria-label="Close"
    class="absolute inset-0 cursor-default"
    onclick={onClose}
  ></button>

  <div class="relative w-full max-w-md rounded-xl border border-neutral-200/80 bg-white p-5 shadow-2xl dark:border-neutral-700/80 dark:bg-neutral-900">
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        Create new
      </h2>
      <button
        type="button"
        aria-label="Close"
        class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-700/40 dark:hover:text-neutral-200"
        onclick={onClose}
      >
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    </header>

    <fieldset class="mb-4 flex flex-col gap-1.5">
      <legend class="sr-only">Kind</legend>
      {#each OPTIONS as opt}
        <label
          class="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors"
          class:border-blue-500={kind === opt.value}
          class:bg-blue-50={kind === opt.value}
          class:dark:bg-blue-950={kind === opt.value}
          class:border-neutral-200={kind !== opt.value}
          class:hover:bg-neutral-50={kind !== opt.value}
          class:dark:border-neutral-700={kind !== opt.value}
          class:dark:hover:bg-neutral-800={kind !== opt.value}
        >
          <input
            type="radio"
            name="kind"
            value={opt.value}
            bind:group={kind}
            class="sr-only"
          />
          <span
            class="inline-block h-3 w-3 shrink-0 rounded-full"
            style="background: hsl({opt.hue} 78% 55%);"
          ></span>
          <span class="flex-1">
            <span class="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{opt.label}</span>
            <span class="block text-xs text-neutral-500 dark:text-neutral-400">{opt.hint}</span>
          </span>
          {#if kind === opt.value}
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-blue-600 dark:text-blue-400">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
          {/if}
        </label>
      {/each}
    </fieldset>

    <label class="mb-4 block">
      <span class="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300">
        Title <span class="text-neutral-400 dark:text-neutral-500">(optional)</span>
      </span>
      <input
        bind:this={titleInput}
        bind:value={title}
        type="text"
        placeholder="Untitled"
        class="w-full rounded-md border border-neutral-300/70 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/20 dark:border-neutral-700/70 dark:bg-neutral-900/40 dark:text-neutral-100"
      />
    </label>

    <footer class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="rounded-md border border-neutral-300/70 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700/70 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
        onclick={onClose}
      >
        Cancel
      </button>
      <button
        type="button"
        class="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        onclick={submit}
      >
        Create
      </button>
    </footer>
  </div>
</div>
