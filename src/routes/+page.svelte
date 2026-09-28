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
  import NoteView from "$lib/components/NoteView.svelte";
  import LibraryView from "$lib/components/LibraryView.svelte";
  import MirrorView from "$lib/components/MirrorView.svelte";
  import FeedbackBoardView from "$lib/components/FeedbackBoardView.svelte";
  import ActivityView from "$lib/components/ActivityView.svelte";
  import DashboardView from "$lib/components/DashboardView.svelte";
  import FlashDeckView from "$lib/components/FlashDeckView.svelte";
  import BlueprintView from "$lib/components/BlueprintView.svelte";
  import TopNav from "$lib/components/TopNav.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import FormattingHelp from "$lib/components/FormattingHelp.svelte";
  import AddEntityModal from "$lib/components/AddEntityModal.svelte";
  import FocusMode from "$lib/components/FocusMode.svelte";
  import PasswordsView from "$lib/components/PasswordsView.svelte";
  import StoryboardView from "$lib/components/StoryboardView.svelte";
  import SecondaryPane from "$lib/components/SecondaryPane.svelte";

  let inspectorTodo = $derived(app.selectedTodo());

  // Split (reference) pane: draggable divider between the main + reference pane.
  let splitFraction = $state(0.55);
  let mainRow: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  function startDrag(e: PointerEvent) {
    dragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onDrag(e: PointerEvent) {
    if (!dragging || !mainRow) return;
    const r = mainRow.getBoundingClientRect();
    splitFraction = Math.min(0.82, Math.max(0.25, (e.clientX - r.left) / r.width));
  }
  function endDrag(e: PointerEvent) {
    dragging = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  // Publish the reference pane's width as a CSS var so the note's floating Edit
  // FAB (viewport-fixed) can offset itself INTO the left/main pane when split.
  let mainRowW = $state(0);
  $effect(() => {
    const el = mainRow;
    if (!el) return;
    const measure = () => (mainRowW = el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  $effect(() => {
    const w = app.splitOpen ? Math.round(mainRowW * (1 - splitFraction)) : 0;
    document.documentElement.style.setProperty("--split-ref-w", `${w}px`);
  });

  // Friendly label for the current section (shown in the toolbar so the
  // icon-only nav isn't a mystery).
  const VIEW_LABELS: Record<string, string> = {
    home: "Home",
    list: "List",
    note: "Note",
    index: "Library",
    mirror: "The Mirror",
    feedback: "Library",
    "feedback-board": "Feedback",
    activity: "Activity",
    dashboard: "Dashboard",
    flashdeck: "Flash Deck",
    blueprints: "Library",
    blueprint: "Blueprints",
    storyboards: "Library",
    storyboard: "Storyboards",
    passwords: "Passwords",
  };
  let viewLabel = $derived(VIEW_LABELS[app.view] ?? "");

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

  // A deliberately small, Stream-Deck-friendly shortcut set (Sprint 65). Only
  // ⌘1–⌘8 map to the eight "important feature" actions; ⌘K (palette), Esc
  // (dismiss) and ? (help) are the only other keys the app claims.
  function handleKeydown(e: KeyboardEvent) {
    app.touchVault(); // reset the vault idle-lock timer on any activity
    const mod = e.metaKey || e.ctrlKey;

    // Command palette — the universal finder / fallback for everything else.
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      app.paletteOpen = !app.paletteOpen;
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

    // ⌘1–⌘8 — the eight feature shortcuts.
    switch (e.key) {
      case "1": // Home
        e.preventDefault();
        app.goHome(true);
        break;
      case "2": // Add — new entity picker
        e.preventDefault();
        app.addModalOpen = true;
        break;
      case "3": // The Mirror
        e.preventDefault();
        app.openMirror();
        break;
      case "4": // Activity
        e.preventDefault();
        app.openActivity();
        break;
      case "5": // Passwords vault
        e.preventDefault();
        app.openPasswords();
        break;
      case "6": // Screensaver (Focus mode)
        e.preventDefault();
        app.enterFocus();
        break;
      case "7": // Split view
        e.preventDefault();
        app.toggleSplit();
        break;
      case "8": // Random sidebar theme
        e.preventDefault();
        theme.randomSidebarTint();
        break;
      case "9": // Dashboard
        e.preventDefault();
        app.openDashboard();
        break;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} onpointerdown={() => app.touchVault()} />

<div class="flex h-screen overflow-hidden">
  {#if !app.sidebarCollapsed}
    <Sidebar />
  {/if}
  <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
    <!-- Reserved top toolbar row: holds the nav menu so it never overlaps the
         content's own top-right controls (Edit, pin, etc.). Drag region too. -->
    <div
      class="flex h-11 shrink-0 items-center justify-between gap-2 px-3"
      data-tauri-drag-region
    >
      <div class="flex min-w-0 items-center gap-2">
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
        {/if}
        <span class="truncate text-sm font-medium text-neutral-500 dark:text-neutral-400">{viewLabel}</span>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex h-8 items-center gap-1.5 rounded-md border border-neutral-200/60 bg-white/70 px-2.5 text-xs text-neutral-500 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 dark:border-neutral-700/60 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:bg-neutral-800"
          title="Search everything & jump anywhere"
          onclick={() => (app.paletteOpen = true)}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z" clip-rule="evenodd"/></svg>
          <span class="hidden sm:inline">Search</span>
          <kbd class="rounded border border-neutral-300/70 px-1 text-[10px] dark:border-neutral-600/70">⌘K</kbd>
        </button>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200/60 bg-white/70 text-neutral-500 shadow-sm backdrop-blur transition-colors hover:bg-neutral-100 dark:border-neutral-700/60 dark:bg-neutral-900/70 dark:text-neutral-400 dark:hover:bg-neutral-800"
          style:color={app.splitOpen ? "var(--accent)" : undefined}
          title="Split view — reference pane (⌘7)"
          aria-label="Toggle reference pane"
          onclick={() => app.toggleSplit()}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4">
            <rect x="2.5" y="4" width="15" height="12" rx="2" />
            <line x1="11.5" y1="4" x2="11.5" y2="16" />
          </svg>
        </button>
        <TopNav />
      </div>
    </div>
    <div bind:this={mainRow} class="flex min-h-0 flex-1" class:select-none={dragging}>
    <div
      class="min-w-0 overflow-y-auto"
      style={app.splitOpen ? `flex:0 0 ${splitFraction * 100}%` : "flex:1 1 0%"}
    >
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
    {:else if app.view === "note"}
      <NoteView />
    {:else if app.view === "index"}
      <LibraryView initialKind="all" />
    {:else if app.view === "mirror"}
      <MirrorView />
    {:else if app.view === "feedback"}
      <LibraryView initialKind="board" />
    {:else if app.view === "feedback-board"}
      <FeedbackBoardView />
    {:else if app.view === "activity"}
      <ActivityView />
    {:else if app.view === "dashboard"}
      <DashboardView />
    {:else if app.view === "flashdeck"}
      <FlashDeckView />
    {:else if app.view === "passwords"}
      <PasswordsView />
    {:else if app.view === "blueprints"}
      <LibraryView initialKind="blueprint" />
    {:else if app.view === "blueprint"}
      <BlueprintView />
    {:else if app.view === "storyboards"}
      <LibraryView initialKind="storyboard" />
    {:else if app.view === "storyboard"}
      <StoryboardView />
    {:else}
      <ListView />
    {/if}
    </div>
    {#if app.splitOpen}
      <div
        class="w-1.5 shrink-0 cursor-col-resize bg-neutral-200/70 transition-colors hover:bg-blue-400/60 dark:bg-neutral-700/60"
        class:!bg-blue-400={dragging}
        role="separator"
        aria-orientation="vertical"
        tabindex="-1"
        onpointerdown={startDrag}
        onpointermove={onDrag}
        onpointerup={endDrag}
      ></div>
      <div class="min-w-0 flex-1 overflow-hidden border-neutral-200/70 dark:border-neutral-700/70">
        <SecondaryPane />
      </div>
    {/if}
    </div>
  </div>
</div>

{#if app.focusMode}
  <FocusMode />
{/if}

{#if app.paletteOpen}
  <CommandPalette />
{/if}

{#if app.formattingHelpOpen}
  <FormattingHelp />
{/if}

{#if app.helpOpen}
  <HelpModal />
{/if}

{#if app.addModalOpen}
  <AddEntityModal onClose={() => (app.addModalOpen = false)} />
{/if}

{#if app.view === "list" && inspectorTodo}
  {#key inspectorTodo.id}
    <Inspector todo={inspectorTodo} />
  {/key}
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

{#if app.capturingCheckin}
  <div
    class="pointer-events-none fixed right-6 top-6 z-[60] flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-medium text-white shadow-lg"
    in:fade={{ duration: 120 }}
    out:fade={{ duration: 200 }}
  >
    <span class="h-2 w-2 animate-pulse rounded-full bg-white"></span>
    📸 Capturing check-in…
  </div>
{/if}
