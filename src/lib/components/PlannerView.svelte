<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { Todo, TodoTag, WeekListInfo } from "$lib/ipc";
  import { tagColor, taskTitleHtml } from "$lib/tasktime";

  const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DAY = 86400000;
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function mondayOf(d: Date): Date {
    const x = new Date(d); x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  const today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const todayKey = iso(today);
  const monday = mondayOf(today);
  let weekOffset = $state(0);
  let weekDates = $derived([0, 1, 2, 3, 4].map((i) => addDays(addDays(monday, weekOffset * 7), i)));
  let fromKey = $derived(iso(weekDates[0]));
  let toKey = $derived(iso(weekDates[4]));

  // Load the week whenever the range changes (mount + nav).
  $effect(() => { void app.loadWeek(fromKey, toKey); });

  // Reload once the task detail modal closes, to pick up edits made there.
  let modalWasOpen = false;
  $effect(() => {
    const open = app.detailTodo !== null;
    if (modalWasOpen && !open) void app.loadWeek(fromKey, toKey);
    modalWasOpen = open;
  });

  // ----- derived groupings -----
  let listByDate = $derived.by<Map<string, WeekListInfo>>(() => {
    const m = new Map<string, WeekListInfo>();
    for (const l of app.week?.lists ?? []) if (!l.isBacklog) m.set(l.date, l);
    return m;
  });
  let backlogList = $derived((app.week?.lists ?? []).find((l) => l.isBacklog) ?? null);
  let todosByList = $derived.by<Map<number, Todo[]>>(() => {
    const m = new Map<number, Todo[]>();
    for (const t of app.week?.todos ?? []) { const a = m.get(t.listId) ?? []; a.push(t); m.set(t.listId, a); }
    return m;
  });
  let tagsByTodo = $derived.by<Map<number, TodoTag[]>>(() => {
    const m = new Map<number, TodoTag[]>();
    for (const r of app.week?.tags ?? []) { const a = m.get(r.todoId) ?? []; a.push(r); m.set(r.todoId, a); }
    return m;
  });
  const todosFor = (date: string): Todo[] => {
    const l = listByDate.get(date);
    return l ? (todosByList.get(l.id) ?? []) : [];
  };
  let backlogTodos = $derived(backlogList ? (todosByList.get(backlogList.id) ?? []) : []);

  let rangeLabel = $derived(
    `${weekDates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ` +
    `${weekDates[4].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`,
  );

  // ----- drag & drop (pointer-based, like the kanban) -----
  let dragId: number | null = $state(null);
  let ghost: HTMLElement | null = null;
  function onChipDown(e: PointerEvent, todo: Todo) {
    if ((e.target as HTMLElement).closest("[data-check]")) return;
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY };
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 5) {
        moved = true;
        dragId = todo.id;
        ghost = document.createElement("div");
        ghost.className = "planner-ghost";
        ghost.textContent = todo.text;
        document.body.appendChild(ghost);
      }
      if (moved && ghost) {
        ghost.style.left = ev.clientX + 12 + "px";
        ghost.style.top = ev.clientY + 12 + "px";
        document.querySelectorAll(".planner-sec.drop").forEach((x) => x.classList.remove("drop"));
        document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest(".planner-sec[data-day]")
          ?.classList.add("drop");
      }
    };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      ghost?.remove(); ghost = null;
      document.querySelectorAll(".planner-sec.drop").forEach((x) => x.classList.remove("drop"));
      dragId = null;
      if (moved) {
        const sec = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>(".planner-sec[data-day]");
        if (sec) void app.moveWeekTask(todo.id, sec.dataset.day!);
      } else {
        void app.selectTodo(todo.id);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ----- inline add -----
  let drafts = $state<Record<string, string>>({});
  async function submitAdd(key: string) {
    const v = (drafts[key] ?? "").trim();
    if (!v) return;
    drafts[key] = "";
    if (key === "backlog") await app.addWeekBacklogTask(v);
    else await app.addWeekTask(key, v);
  }
</script>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
  <div class="mb-5 flex flex-wrap items-center gap-3">
    <h1 class="font-serif text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100" style="font-family: var(--serif, ui-serif, Georgia, serif)">
      Week planner
    </h1>
    <span class="text-sm text-neutral-500 dark:text-neutral-400">{rangeLabel}</span>
    <div class="ml-auto flex items-center gap-1">
      <button type="button" class="h-8 w-9 rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400" title="Previous week" onclick={() => (weekOffset -= 1)}>‹</button>
      <button type="button" class="h-8 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300" onclick={() => (weekOffset = 0)}>This week</button>
      <button type="button" class="h-8 w-9 rounded-lg border border-neutral-200 bg-white text-neutral-500 transition-colors hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400" title="Next week" onclick={() => (weekOffset += 1)}>›</button>
    </div>
  </div>

  <div class="flex flex-col gap-3">
    {#snippet section(key: string, label: string, dateLabel: string, todos: Todo[], isBacklog: boolean, isToday: boolean, isPast: boolean)}
      <div
        class="planner-sec overflow-hidden rounded-xl border bg-white transition-colors dark:bg-neutral-900 {isToday ? 'today' : ''} {isBacklog ? 'backlog' : 'border-neutral-200 dark:border-neutral-800'} {isPast ? 'opacity-70' : ''}"
        data-day={key}
        style={isBacklog ? "background: color-mix(in srgb, var(--accent,#4f46e5) 7%, var(--surface, #fff)); border: 1px dashed color-mix(in srgb, var(--accent,#4f46e5) 30%, transparent);" : isToday ? "border-color: color-mix(in srgb, var(--accent,#4f46e5) 55%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent,#4f46e5) 14%, transparent);" : ""}
      >
        <div class="flex items-baseline gap-2.5 border-b border-neutral-100 px-4 py-2.5 dark:border-neutral-800" style={isBacklog ? "border-bottom-color: color-mix(in srgb, var(--accent,#4f46e5) 16%, transparent)" : ""}>
          <span class="inline-flex items-center gap-1.5 text-sm font-bold" style={isBacklog || isToday ? "color: var(--accent,#4f46e5)" : ""} class:text-neutral-800={!isBacklog && !isToday} class:dark:text-neutral-100={!isBacklog && !isToday}>
            {#if isBacklog}<svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v6h-3l-1 2H8l-1-2H4V5z"/></svg>{/if}
            {label}
          </span>
          <span class="text-xs tabular-nums text-neutral-400">{dateLabel}</span>
          {#if isToday}<span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style="background: var(--accent,#4f46e5)">Today</span>{/if}
          <span class="ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums" style="color: var(--accent,#4f46e5); background: color-mix(in srgb, var(--accent,#4f46e5) 13%, transparent)">
            {#if isBacklog}{todos.length}{:else}{todos.filter((t) => t.completed).length}/{todos.length}{/if}
          </span>
        </div>

        <div class="px-2 py-1">
          {#if todos.length === 0}
            <div class="m-1 rounded-lg border border-dashed border-neutral-200 py-2 text-center text-xs text-neutral-400 dark:border-neutral-700">
              No tasks yet — add one below{isBacklog ? "" : " or drag one here"}
            </div>
          {:else}
            {#each todos as todo (todo.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="group flex cursor-grab select-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800/50 {dragId === todo.id ? 'opacity-40' : ''}"
                title={todo.text}
                onpointerdown={(e) => onChipDown(e, todo)}
              >
                <button
                  type="button"
                  data-check
                  class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border-2 transition-colors"
                  class:border-neutral-300={!todo.completed}
                  class:dark:border-neutral-600={!todo.completed}
                  style={todo.completed ? "background: var(--accent,#4f46e5); border-color: var(--accent,#4f46e5)" : ""}
                  aria-label={todo.completed ? "Mark not done" : "Mark done"}
                  onclick={(e) => { e.stopPropagation(); void app.toggleWeekTodo(todo); }}
                >
                  {#if todo.completed}
                    <svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="h-2.5 w-2.5"><path d="M4 10.5l4 4 8-9"/></svg>
                  {/if}
                </button>
                <span class="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm" class:text-neutral-400={todo.completed} class:line-through={todo.completed} class:dark:text-neutral-500={todo.completed} class:text-neutral-800={!todo.completed} class:dark:text-neutral-100={!todo.completed}>
                  {#if todo.status === "wip"}<span class="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style="background:#f59e0b"></span>{/if}{@html taskTitleHtml(todo.text)}
                </span>
                {#each tagsByTodo.get(todo.id) ?? [] as tg (tg.id)}
                  <span class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style="background:{tagColor(tg)}1f;color:{tagColor(tg)}">{tg.name}</span>
                {/each}
                <span class="shrink-0 text-xs text-neutral-300 opacity-0 transition-opacity group-hover:opacity-60 dark:text-neutral-600">⋮⋮</span>
              </div>
            {/each}
          {/if}
        </div>

        <div class="flex items-center gap-1.5 px-3 py-1.5">
          <span class="text-neutral-400">＋</span>
          <input
            class="flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-[color-mix(in_srgb,var(--accent,#4f46e5)_40%,transparent)] focus:bg-neutral-50 dark:text-neutral-100 dark:focus:bg-neutral-800/50"
            placeholder={isBacklog ? "Add to backlog…" : `Add a task to ${label}…`}
            bind:value={drafts[key]}
            onkeydown={(e) => { if (e.key === "Enter") submitAdd(key); }}
          />
        </div>
      </div>
    {/snippet}

    {#each weekDates as d (iso(d))}
      {@const key = iso(d)}
      {@render section(key, DOW[(d.getDay() + 6) % 7], d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), todosFor(key), false, key === todayKey, key < todayKey)}
    {/each}
    {@render section("backlog", "Backlog", "unscheduled", backlogTodos, true, false, false)}
  </div>
</main>
