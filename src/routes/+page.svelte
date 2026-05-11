<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { app } from "$lib/stores/app.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import ListView from "$lib/components/ListView.svelte";
  import Inspector from "$lib/components/Inspector.svelte";

  let sidebar: Sidebar | undefined = $state();
  let inspectorTodo = $derived(app.selectedTodo());

  onMount(() => {
    app.init();
  });

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "f" && !e.shiftKey) {
      e.preventDefault();
      sidebar?.focus();
      return;
    }
    if (!mod) {
      if (e.key === "Escape" && app.selectedTodoId !== null) {
        app.selectTodo(null);
      }
      return;
    }
    if (e.key === "n" && !e.shiftKey) {
      e.preventDefault();
      app.newList();
    } else if (e.key === "e" && !e.shiftKey) {
      e.preventDefault();
      app.saveCurrent();
    } else if (e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      app.copyCurrent();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex min-h-screen">
  <Sidebar bind:this={sidebar} />
  <div class="flex-1 overflow-y-auto">
    {#if app.loading}
      <p class="p-8 text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
    {:else if app.error}
      <div
        class="m-8 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        <p class="font-medium">Something went wrong.</p>
        <p class="mt-1 text-xs">{app.error}</p>
      </div>
    {:else}
      <ListView />
    {/if}
  </div>
  {#if inspectorTodo}
    {#key inspectorTodo.id}
      <Inspector todo={inspectorTodo} />
    {/key}
  {/if}
</div>

{#if app.flash}
  <div
    class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900/85 px-4 py-2 text-xs text-white shadow-lg dark:bg-neutral-100/90 dark:text-neutral-900"
    in:fade={{ duration: 120 }}
    out:fade={{ duration: 200 }}
  >
    {app.flash}
  </div>
{/if}
