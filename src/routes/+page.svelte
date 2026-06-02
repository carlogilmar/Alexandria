<script lang="ts">
  import { onMount } from "svelte";
  import { fade } from "svelte/transition";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import ListView from "$lib/components/ListView.svelte";
  import Inspector from "$lib/components/Inspector.svelte";
  import Welcome from "$lib/components/Welcome.svelte";
  import HelpModal from "$lib/components/HelpModal.svelte";
  import WorkflowView from "$lib/components/WorkflowView.svelte";
  import NoteView from "$lib/components/NoteView.svelte";
  import SummaryView from "$lib/components/SummaryView.svelte";
  import ArticleView from "$lib/components/ArticleView.svelte";
  import GardenView from "$lib/components/GardenView.svelte";
  import MapView from "$lib/components/MapView.svelte";
  import FeedbackBoardsView from "$lib/components/FeedbackBoardsView.svelte";
  import FeedbackBoardView from "$lib/components/FeedbackBoardView.svelte";
  import ActivityView from "$lib/components/ActivityView.svelte";
  import TopNav from "$lib/components/TopNav.svelte";

  let sidebar: Sidebar | undefined = $state();
  let inspectorTodo = $derived(app.selectedTodo());

  onMount(() => {
    theme.init();
    app.init();
  });

  function isTypingInEditable(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === "f" && !e.shiftKey) {
      e.preventDefault();
      sidebar?.focus();
      return;
    }
    if (mod && e.key === "[") {
      e.preventDefault();
      app.back();
      return;
    }
    if (mod && e.key === "\\") {
      e.preventDefault();
      app.toggleSidebar();
      return;
    }
    if (!mod) {
      if (e.key === "Escape") {
        if (app.helpOpen) {
          app.helpOpen = false;
        } else if (app.selectedTodoId !== null) {
          app.selectTodo(null);
        }
        return;
      }
      // Only intercept "?" when the user isn't typing in a field.
      if (e.key === "?" && !isTypingInEditable(e.target)) {
        e.preventDefault();
        app.helpOpen = !app.helpOpen;
      }
      return;
    }
    if (e.key === "n" && !e.shiftKey) {
      e.preventDefault();
      app.newList();
    } else if (e.key === "e" && !e.shiftKey) {
      e.preventDefault();
      if (app.view === "list") app.saveCurrent();
    } else if (e.shiftKey && (e.key === "C" || e.key === "c")) {
      e.preventDefault();
      if (app.view === "list") app.copyCurrent();
    } else if (e.key === "1") {
      e.preventDefault();
      app.goHome(true);
    } else if (e.key === "2") {
      e.preventDefault();
      app.openMap();
    } else if (e.key === "3") {
      e.preventDefault();
      app.openIndex();
    } else if (e.key === "4") {
      e.preventDefault();
      app.openGarden();
    } else if (e.key === "5") {
      e.preventDefault();
      app.openFeedback();
    } else if (e.key === "6") {
      e.preventDefault();
      app.openActivity();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-screen overflow-hidden">
  {#if !app.sidebarCollapsed}
    <Sidebar bind:this={sidebar} />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <!-- Reserved top toolbar row: holds the nav menu so it never overlaps the
         content's own top-right controls (Edit, pin, etc.). Drag region too. -->
    <div
      class="flex h-11 shrink-0 items-center justify-between gap-2 px-3"
      data-tauri-drag-region
    >
      {#if app.sidebarCollapsed}
        <button
          type="button"
          class="flex h-8 items-center gap-1 rounded-md border border-neutral-200/60 bg-white/70 px-2 text-xs text-neutral-500 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 dark:border-neutral-700/60 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:bg-neutral-800"
          title="Show sidebar"
          onclick={() => app.toggleSidebar()}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
            <path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 4a1 1 0 100 2h12a1 1 0 100-2H4z" clip-rule="evenodd" />
          </svg>
          Sidebar
        </button>
      {:else}
        <span></span>
      {/if}
      <TopNav />
    </div>
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
    {:else if app.view === "home"}
      <Welcome />
    {:else if app.view === "workflow"}
      <WorkflowView />
    {:else if app.view === "note"}
      <NoteView />
    {:else if app.view === "index"}
      <SummaryView />
    {:else if app.view === "article"}
      <ArticleView />
    {:else if app.view === "garden"}
      <GardenView />
    {:else if app.view === "map"}
      <MapView />
    {:else if app.view === "feedback"}
      <FeedbackBoardsView />
    {:else if app.view === "feedback-board"}
      <FeedbackBoardView />
    {:else if app.view === "activity"}
      <ActivityView />
    {:else}
      <ListView />
    {/if}
    </div>
  </div>
  {#if app.view === "list" && inspectorTodo}
    {#key inspectorTodo.id}
      <Inspector todo={inspectorTodo} />
    {/key}
  {/if}
</div>

{#if app.helpOpen}
  <HelpModal />
{/if}

{#if app.flash}
  <div
    class="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900/85 px-4 py-2 text-xs text-white shadow-lg dark:bg-neutral-100/90 dark:text-neutral-900"
    in:fade={{ duration: 120 }}
    out:fade={{ duration: 200 }}
  >
    {app.flash}
  </div>
{/if}
