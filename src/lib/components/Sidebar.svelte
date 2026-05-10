<script lang="ts">
  import { app, todayIso } from "$lib/stores/app.svelte";
  import type { ListSummary } from "$lib/ipc";

  type MonthGroup = {
    key: string;
    label: string;
    items: ListSummary[];
  };

  const today = todayIso();

  let todayList = $derived(app.lists.find((l) => l.date === today));
  let pastByMonth = $derived.by<MonthGroup[]>(() => {
    const others = app.lists.filter((l) => l.date !== today);
    const groups = new Map<string, MonthGroup>();
    for (const item of others) {
      const key = item.date.slice(0, 7); // YYYY-MM
      let group = groups.get(key);
      if (!group) {
        const label = new Date(item.date + "T00:00:00").toLocaleDateString(
          undefined,
          { month: "long", year: "numeric" },
        );
        group = { key, label, items: [] };
        groups.set(key, group);
      }
      group.items.push(item);
    }
    return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
  });

  function dayLabel(date: string): string {
    return new Date(date + "T00:00:00").toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function isSelected(id: number): boolean {
    return app.selected?.id === id;
  }
</script>

<aside
  class="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200/80 bg-neutral-50/80 px-3 py-5"
>
  <div class="mb-3 flex items-center justify-between px-2">
    <h2 class="text-xs font-medium uppercase tracking-widest text-neutral-400">
      Lists
    </h2>
    <button
      type="button"
      class="rounded p-1 text-neutral-400 hover:bg-neutral-200/60 hover:text-neutral-700"
      aria-label="New list"
      onclick={() => app.newList()}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4">
        <path
          fill-rule="evenodd"
          d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
  </div>

  <nav class="flex-1 overflow-y-auto">
    {#if todayList}
      {@const t = todayList}
      <button
        type="button"
        class="mb-3 w-full rounded-md px-2 py-1.5 text-left transition-colors"
        class:bg-neutral-200={isSelected(t.id)}
        class:hover:bg-neutral-200={!isSelected(t.id)}
        class:hover:bg-neutral-100={!isSelected(t.id)}
        onclick={() => app.select(t.id)}
      >
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-neutral-800">Today</span>
          {#if t.total > 0}
            <span class="text-[11px] text-neutral-400">
              {t.done}/{t.total}
            </span>
          {/if}
        </div>
        <p class="mt-0.5 truncate text-xs text-neutral-500">{t.title}</p>
      </button>
    {/if}

    {#each pastByMonth as group (group.key)}
      <div class="mb-2">
        <p
          class="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-widest text-neutral-400"
        >
          {group.label}
        </p>
        {#each group.items as item (item.id)}
          <button
            type="button"
            class="w-full rounded-md px-2 py-1 text-left transition-colors"
            class:bg-neutral-200={isSelected(item.id)}
            class:hover:bg-neutral-100={!isSelected(item.id)}
            onclick={() => app.select(item.id)}
          >
            <div class="flex items-center justify-between">
              <span class="truncate text-sm text-neutral-700">
                {item.title}
              </span>
              {#if item.total > 0}
                <span class="ml-2 shrink-0 text-[11px] text-neutral-400">
                  {item.done}/{item.total}
                </span>
              {/if}
            </div>
            <p class="text-[11px] text-neutral-400">{dayLabel(item.date)}</p>
          </button>
        {/each}
      </div>
    {/each}
  </nav>
</aside>
