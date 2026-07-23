<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import { theme, SIDEBAR_TINTS } from "$lib/stores/theme.svelte";

  let paletteOpen = $state(false);

  // The six primary destinations, as compact icons. `hue` colors the icon when
  // that destination is active (inline style — avoids Tailwind purge of dynamic
  // classes). `active` matches against the current view.
  type NavItem = {
    key: string;
    title: string;
    sc: string;
    hue: number;
    d: string;
    go: () => void;
    active: (v: string) => boolean;
  };

  // Home + Summary are the two "hub" destinations — they render as labeled,
  // tinted pills ahead of the icon cluster so they read as the primary entry
  // points (Sprint 22 follow-up).
  const PRIMARY: NavItem[] = [
    {
      key: "home",
      title: "Home",
      sc: "⌘1",
      hue: 220,
      d: "M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h3a1 1 0 001-1v-3h2v3a1 1 0 001 1h3a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z",
      go: () => app.goHome(true),
      active: (v) => v === "home",
    },
    {
      key: "index",
      title: "Summary",
      sc: "⌘3",
      hue: 217,
      d: "M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 2a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z",
      go: () => app.openIndex(),
      active: (v) => v === "index",
    },
  ];

  const NAV: NavItem[] = [
    {
      key: "map",
      title: "Alexandria",
      sc: "⌘2",
      hue: 265,
      d: "M3 5a2 2 0 012-2h2.5a2 2 0 011.6.8L10 5h5a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm4 4a1 1 0 100 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h4a1 1 0 100-2H7z",
      go: () => app.openMap(),
      active: (v) => v === "map",
    },
    {
      key: "garden",
      title: "Visualization",
      sc: "⌘4",
      hue: 155,
      d: "M10 2C7.5 2 5 4 5 6.5c0 1.4.7 2.6 1.8 3.4-.5.4-.8 1-.8 1.6 0 1.1.9 2 2 2h.5v3a1 1 0 102 0v-3h.5c1.1 0 2-.9 2-2 0-.6-.3-1.2-.8-1.6C14.3 9.1 15 7.9 15 6.5 15 4 12.5 2 10 2z",
      go: () => app.openGarden(),
      active: (v) => v === "garden",
    },
    {
      key: "feedback",
      title: "Feedback",
      sc: "⌘5",
      hue: 350,
      d: "M3 4a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V4zm-9 9a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3zm9 0a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z",
      go: () => app.openFeedback(),
      active: (v) => v === "feedback" || v === "feedback-board",
    },
    {
      key: "activity",
      title: "Activity",
      sc: "⌘6",
      hue: 30,
      d: "M3 3h6v6H3V3zm0 8h6v6H3v-6zm8-8h6v6h-6V3zm0 8h6v6h-6v-6z",
      go: () => app.openActivity(),
      active: (v) => v === "activity",
    },
    {
      key: "flashdeck",
      title: "Flash Deck",
      sc: "⌘7",
      hue: 175,
      d: "M5 4a2 2 0 00-2 2v7a2 2 0 002 2h1V6a2 2 0 012-2h6a2 2 0 00-2-2H5zm4 3a2 2 0 00-2 2v7a2 2 0 002 2h6a2 2 0 002-2V9a2 2 0 00-2-2H9zm1 3a1 1 0 100 2h4a1 1 0 100-2h-4z",
      go: () => app.openFlashDeck(),
      active: (v) => v === "flashdeck",
    },
    // Blueprints deliberately has NO toolbar icon: the list lives in
    // Summary's "Blueprints" tab, creation in the sidebar "+ Add" modal.
    // ⌘8 and the command palette still jump to the index view.
  ];

  const btn =
    "relative flex h-8 w-8 items-center justify-center rounded-full transition-colors";
  const inactive =
    "text-neutral-500 hover:bg-neutral-200/70 dark:text-neutral-400 dark:hover:bg-neutral-700/60";

  let isDark = $derived(theme.resolved === "dark");

  function swatchColor(tint: {
    hue: number | null;
    dark?: boolean;
    aurora?: string[];
  }): string {
    if (tint.aurora) {
      return `linear-gradient(135deg, ${tint.aurora.join(", ")})`;
    }
    if (tint.dark) {
      return tint.hue == null ? "#1c1c1e" : `hsl(${tint.hue} 32% 22%)`;
    }
    return tint.hue == null ? "#9ca3af" : `hsl(${tint.hue} 65% 55%)`;
  }
</script>

<!-- Top toolbar cluster: back, the six destinations, theme + tint. Lives in the
     reserved toolbar row (see +page.svelte) so it never overlaps view content. -->
<div class="relative">
<div
  class="flex items-center gap-0.5 rounded-full border border-neutral-200/60 bg-white/70 px-1 py-1 shadow-sm backdrop-blur dark:border-neutral-700/60 dark:bg-neutral-900/70"
>
  {#if app.canGoBack}
    <button
      type="button"
      class="{btn} {inactive}"
      title="Back — ⌘["
      aria-label="Back"
      onclick={() => app.back()}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path
          fill-rule="evenodd"
          d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <span class="mx-0.5 h-5 w-px bg-neutral-200/80 dark:bg-neutral-700/80"></span>
  {/if}

  <!-- Hub destinations: always tinted so they stand out (icon-only). -->
  {#each PRIMARY as item (item.key)}
    {@const on = item.active(app.view)}
    <button
      type="button"
      class="{btn} transition-colors"
      style:background={on
        ? `hsl(${item.hue} 70% ${isDark ? 50 : 45}%)`
        : `hsl(${item.hue} 70% ${isDark ? 55 : 45}% / ${isDark ? 0.2 : 0.12})`}
      style:color={on ? "white" : `hsl(${item.hue} 70% ${isDark ? 70 : 38}%)`}
      title={`${item.title} — ${item.sc}`}
      aria-label={item.title}
      onclick={item.go}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d={item.d} clip-rule="evenodd" />
      </svg>
    </button>
  {/each}

  <span class="mx-0.5 h-5 w-px bg-neutral-200/80 dark:bg-neutral-700/80"></span>

  {#each NAV as item (item.key)}
    {@const on = item.active(app.view)}
    <button
      type="button"
      class="{btn} {on
        ? 'bg-neutral-200/80 dark:bg-neutral-700/70'
        : inactive}"
      style:color={on ? `hsl(${item.hue} 70% 45%)` : undefined}
      title={`${item.title} — ${item.sc}`}
      aria-label={item.title}
      onclick={item.go}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d={item.d} clip-rule="evenodd" />
      </svg>
    </button>
  {/each}

  <span class="mx-0.5 h-5 w-px bg-neutral-200/80 dark:bg-neutral-700/80"></span>

  <!-- Focus mode (aurora screensaver of today's list) -->
  <button
    type="button"
    class="{btn} {inactive}"
    title="Focus mode"
    aria-label="Focus mode"
    onclick={() => app.enterFocus()}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path
        fill-rule="evenodd"
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.368 2.446a1 1 0 00-.363 1.118l1.287 3.958c.3.922-.755 1.688-1.539 1.118l-3.367-2.447a1 1 0 00-1.176 0l-3.367 2.447c-.783.57-1.838-.196-1.539-1.118l1.286-3.958a1 1 0 00-.363-1.118L2.05 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.958z"
        clip-rule="evenodd"
      />
    </svg>
  </button>

  <!-- Theme cycle -->
  <button
    type="button"
    class="{btn} {inactive}"
    title={`Theme: ${theme.preference} — click to switch`}
    aria-label="Switch theme"
    onclick={() => theme.cycle()}
  >
    {#if theme.preference === "dark"}
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
      </svg>
    {:else if theme.preference === "light"}
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.95 2.05a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zm-2.05 4.95a1 1 0 01-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707a1 1 0 010 1.414zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.95-.464a1 1 0 010-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414 0zM4 10a1 1 0 01-1 1H2a1 1 0 110-2h1a1 1 0 011 1zm.464-5.95a1 1 0 011.414 0l.707.707A1 1 0 015.171 6.17l-.707-.707a1 1 0 010-1.414zM10 6a4 4 0 100 8 4 4 0 000-8z" clip-rule="evenodd" />
      </svg>
    {:else}
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path fill-rule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-3v2h2a1 1 0 110 2H8a1 1 0 110-2h2v-2H5a2 2 0 01-2-2V5zm2 0v8h10V5H5z" clip-rule="evenodd" />
      </svg>
    {/if}
  </button>

  <!-- Sidebar tint -->
  <button
    type="button"
    class="{btn} {paletteOpen ? 'bg-neutral-200/80 dark:bg-neutral-700/70' : inactive}"
    title="Sidebar color"
    aria-label="Sidebar color"
    onclick={() => (paletteOpen = !paletteOpen)}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
      <path d="M10 2a8 8 0 100 16 1.5 1.5 0 001.5-1.5c0-.4-.15-.74-.4-1.01-.24-.28-.4-.64-.4-1.04 0-.83.67-1.5 1.5-1.5H14a4 4 0 004-4c0-3.87-3.58-7-8-7zM5 11a1 1 0 110-2 1 1 0 010 2zm2-4a1 1 0 110-2 1 1 0 010 2zm6 0a1 1 0 110-2 1 1 0 010 2z" />
    </svg>
  </button>
</div>

{#if paletteOpen}
  <!-- Outside-click catcher -->
  <button
    type="button"
    class="fixed inset-0 z-40 cursor-default"
    aria-label="Close color picker"
    onclick={() => (paletteOpen = false)}
  ></button>
  <div
    class="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-neutral-200/70 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-neutral-700/70 dark:bg-neutral-900/95"
  >
    <p class="mb-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
      Sidebar color
    </p>
    <div class="flex flex-wrap gap-2">
      {#each SIDEBAR_TINTS as tint (tint.name)}
        <button
          type="button"
          class="h-6 w-6 rounded-full border transition-transform hover:scale-110"
          class:ring-2={theme.sidebarTint === tint.name}
          class:ring-offset-1={theme.sidebarTint === tint.name}
          class:ring-blue-500={theme.sidebarTint === tint.name}
          class:dark:ring-offset-neutral-900={theme.sidebarTint === tint.name}
          style:background={swatchColor(tint)}
          style:border-color={tint.hue == null && !tint.dark
            ? "rgba(120,120,120,0.5)"
            : "rgba(255,255,255,0.25)"}
          title={tint.label}
          aria-label={tint.label}
          onclick={() => theme.setSidebarTint(tint.name)}
        ></button>
      {/each}
    </div>
    <button
      type="button"
      class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-200/70 px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700/70 dark:text-neutral-300 dark:hover:bg-neutral-800"
      title="Pick a random sidebar color"
      onclick={() => theme.randomSidebarTint()}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5">
        <path
          fill-rule="evenodd"
          d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm2.5 3a1 1 0 100 2 1 1 0 000-2zm7 0a1 1 0 100 2 1 1 0 000-2zM10 9a1 1 0 100 2 1 1 0 000-2zm-3.5 3a1 1 0 100 2 1 1 0 000-2zm7 0a1 1 0 100 2 1 1 0 000-2z"
          clip-rule="evenodd"
        />
      </svg>
      Surprise me
    </button>
  </div>
{/if}
</div>
