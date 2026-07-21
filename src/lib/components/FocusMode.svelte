<script lang="ts">
  import { fade } from "svelte/transition";
  import { app } from "$lib/stores/app.svelte";
  import { theme } from "$lib/stores/theme.svelte";

  // Aurora palette: use the active sidebar aurora tint if the user has one
  // selected, otherwise a calm teal/green/indigo default. Focus mode is always
  // a lights-down stage, so we use the dark aurora treatment (screen blend on a
  // dark base) regardless of the app theme.
  const DEFAULT_AURORA = ["#2dd4bf", "#4ade80", "#818cf8"];
  let auroraColors = $derived(theme.sidebarAurora ?? DEFAULT_AURORA);

  // A live clock that ticks every second while the overlay is mounted.
  let now = $state(new Date());
  $effect(() => {
    const id = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(id);
  });

  let timeStr = $derived(
    now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  );
  let dateStr = $derived(
    now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
  );

  let doneCount = $derived(app.focusTodos.filter((t) => t.completed).length);
  let total = $derived(app.focusTodos.length);

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      app.exitFocus();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="focus-stage fixed inset-0 z-[100] flex flex-col overflow-hidden text-white"
  transition:fade={{ duration: 220 }}
  role="dialog"
  aria-modal="true"
  aria-label="Focus mode"
>
  <!-- Aurora backdrop: drifting blurred blobs + a noise grain (mirrors the
       Sprint 23 sidebar treatment). -->
  <div class="aurora" aria-hidden="true">
    {#each auroraColors as c, i (i)}
      <div
        class="aurora-blob aurora-blob-{i}"
        style="background: radial-gradient(circle at 50% 50%, {c} 0%, transparent 65%);"
      ></div>
    {/each}
    <div class="aurora-noise"></div>
  </div>

  <!-- Exit -->
  <button
    type="button"
    class="absolute right-6 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
    title="Exit Focus — Esc"
    aria-label="Exit Focus mode"
    onclick={() => app.exitFocus()}
  >
    <svg viewBox="0 0 20 20" fill="currentColor" class="h-5 w-5">
      <path
        fill-rule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clip-rule="evenodd"
      />
    </svg>
  </button>

  <!-- Content: clock/date, then the list, vertically centered. -->
  <div class="relative z-[1] flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-16">
    <div class="mb-10 text-center">
      <div class="text-7xl font-thin tabular-nums tracking-tight sm:text-8xl">
        {timeStr}
      </div>
      <div class="mt-2 text-lg font-light text-white/70">{dateStr}</div>
    </div>

    <div class="w-full max-w-xl">
      {#if app.focusListId === null}
        <!-- No list for today -->
        <div class="text-center">
          <p class="text-white/70">No list for today yet.</p>
          <button
            type="button"
            class="mt-4 rounded-full bg-white/15 px-5 py-2 text-sm font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
            onclick={() => app.createFocusToday()}
          >
            Create today's list
          </button>
        </div>
      {:else}
        <div class="mb-5 flex items-baseline justify-between gap-4">
          <h2 class="truncate text-xl font-medium text-white/90">
            {app.focusListTitle}
          </h2>
          {#if total > 0}
            <span class="shrink-0 text-sm font-light text-white/50">
              {doneCount} of {total} done
            </span>
          {/if}
        </div>

        {#if total === 0}
          <p class="text-center text-white/50">
            This list is empty — add tasks from the list view.
          </p>
        {:else}
          <ul class="space-y-2">
            {#each app.focusTodos as todo (todo.id)}
              <li>
                <button
                  type="button"
                  class="focus-row flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/[0.12]"
                  class:is-done={todo.completed}
                  onclick={() => app.toggleFocusTodo(todo)}
                >
                  <span
                    class="check flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white/40 transition-colors"
                  >
                    {#if todo.completed}
                      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
                        <path
                          fill-rule="evenodd"
                          d="M16.7 5.3a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.8 6.79-6.8a1 1 0 011.42 0z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    {/if}
                  </span>
                  <span class="label text-lg font-light">{todo.text}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
    </div>
  </div>
</div>

<style>
  /* Dark stage base — the aurora blobs glow on top of it. */
  .focus-stage {
    background:
      radial-gradient(1200px 800px at 20% 0%, #1e293b 0%, transparent 60%),
      radial-gradient(1000px 700px at 90% 100%, #0f172a 0%, transparent 55%),
      #0b1120;
  }

  .aurora {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .aurora-blob {
    position: absolute;
    width: 90%;
    aspect-ratio: 1;
    border-radius: 50%;
    filter: blur(70px);
    opacity: 0.5;
    mix-blend-mode: screen;
    animation: aurora-drift 22s ease-in-out infinite alternate;
    will-change: transform;
  }
  .aurora-blob-0 {
    top: -20%;
    left: -15%;
    animation-duration: 24s;
  }
  .aurora-blob-1 {
    top: 10%;
    right: -20%;
    left: auto;
    animation-duration: 30s;
    animation-delay: -6s;
  }
  .aurora-blob-2 {
    bottom: -25%;
    left: 20%;
    top: auto;
    animation-duration: 27s;
    animation-delay: -12s;
  }
  @keyframes aurora-drift {
    from {
      transform: translate3d(-8%, -6%, 0) scale(1) rotate(0deg);
    }
    to {
      transform: translate3d(10%, 8%, 0) scale(1.35) rotate(40deg);
    }
  }
  /* Film-grain noise keeps the gradients from banding. */
  .aurora-noise {
    position: absolute;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    opacity: 0.06;
    mix-blend-mode: overlay;
  }

  /* Completed row: dim + strike, and fill the check circle. */
  .focus-row.is-done .label {
    text-decoration: line-through;
    color: rgba(255, 255, 255, 0.45);
  }
  .focus-row.is-done .check {
    border-color: rgba(255, 255, 255, 0.7);
    background: rgba(255, 255, 255, 0.9);
    color: #0b1120;
  }

  @media (prefers-reduced-motion: reduce) {
    .aurora-blob {
      animation: none;
    }
  }
</style>
