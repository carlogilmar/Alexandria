<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "$lib/stores/app.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import ListView from "$lib/components/ListView.svelte";

  onMount(() => {
    app.init();
  });
</script>

<div class="flex min-h-screen">
  <Sidebar />
  <div class="flex-1 overflow-y-auto">
    {#if app.loading}
      <p class="p-8 text-sm text-neutral-400">Loading…</p>
    {:else if app.error}
      <div class="m-8 max-w-2xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p class="font-medium">Something went wrong.</p>
        <p class="mt-1 text-xs">{app.error}</p>
      </div>
    {:else}
      <ListView />
    {/if}
  </div>
</div>
