<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { DashboardTask, TodoTag, TodoStatus } from "$lib/ipc";
  import { fmtWork, tagColor, parseSqlUtc } from "$lib/tasktime";

  // ----- date helpers -----
  const DAY = 86400000;
  function iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  function niceDate(s: string): string {
    return new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ----- local UI state -----
  type Preset = "week" | "month" | "7" | "30" | "custom";
  const PRESETS: { k: Preset; label: string }[] = [
    { k: "week", label: "This week" },
    { k: "month", label: "This month" },
    { k: "7", label: "Last 7 days" },
    { k: "30", label: "Last 30 days" },
    { k: "custom", label: "Custom" },
  ];
  let preset = $state<Preset>("week");
  let countBy = $state<"list" | "done">("list");
  let tagFilter = $state<Set<string>>(new Set());
  let customFrom = $state(iso(addDays(startOfToday(), -6)));
  let customTo = $state(iso(startOfToday()));

  const today = startOfToday();

  // Current [from, to] window from the active preset.
  let range = $derived.by<[Date, Date]>(() => {
    if (preset === "custom") return [new Date(customFrom + "T00:00:00"), new Date(customTo + "T00:00:00")];
    if (preset === "week") return [addDays(today, -((today.getDay() + 6) % 7)), today];
    if (preset === "month") return [new Date(today.getFullYear(), today.getMonth(), 1), today];
    if (preset === "7") return [addDays(today, -6), today];
    return [addDays(today, -29), today];
  });
  let from = $derived(iso(range[0]));
  let to = $derived(iso(range[1]));
  let rangeLen = $derived(Math.round((range[1].getTime() - range[0].getTime()) / DAY) + 1);
  // Padded start so the previous equal-length window is fetched too (deltas).
  let fetchFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevTo = $derived(iso(addDays(range[0], -1)));

  // Fetch whenever the fetch window changes.
  $effect(() => {
    const ff = fetchFrom, t = to;
    if (app.dashboardFetchedFrom !== ff || app.dashboardFetchedTo !== t) {
      app.loadDashboard(ff, t);
    }
  });

  // ----- derived data -----
  let allTasks = $derived<DashboardTask[]>(app.dashboard?.tasks ?? []);
  let tagsByTodo = $derived.by<Map<number, TodoTag[]>>(() => {
    const m = new Map<number, TodoTag[]>();
    for (const r of app.dashboard?.tags ?? []) {
      const arr = m.get(r.todoId) ?? [];
      arr.push(r);
      m.set(r.todoId, arr);
    }
    return m;
  });
  // All tag names present, for the filter chips.
  let allTagNames = $derived.by<TodoTag[]>(() => {
    const seen = new Map<string, TodoTag>();
    for (const r of app.dashboard?.tags ?? []) if (!seen.has(r.name)) seen.set(r.name, r);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  function refDate(t: DashboardTask): string | null {
    if (countBy === "done") return t.completedAt ? t.completedAt.slice(0, 10) : null;
    return t.listDate || null;
  }
  function inWindow(t: DashboardTask, a: string, b: string): boolean {
    const rd = refDate(t);
    if (!rd || rd < a || rd > b) return false;
    if (tagFilter.size) {
      const tags = tagsByTodo.get(t.id) ?? [];
      if (!tags.some((x) => tagFilter.has(x.name))) return false;
    }
    return true;
  }
  function cycleDays(t: DashboardTask): number {
    const a = parseSqlUtc(t.createdAt), b = parseSqlUtc(t.completedAt);
    if (!a || !b) return 0;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY));
  }

  let cur = $derived(allTasks.filter((t) => inWindow(t, from, to)));
  let prev = $derived(allTasks.filter((t) => inWindow(t, prevFrom, prevTo)));

  let days = $derived.by<string[]>(() => {
    const out: string[] = [];
    for (let d = new Date(range[0]); d <= range[1]; d = addDays(d, 1)) out.push(iso(d));
    return out;
  });

  // KPIs
  let kpi = $derived.by(() => {
    const done = cur.filter((t) => t.status === "done");
    const pdone = prev.filter((t) => t.status === "done");
    const work = cur.reduce((s, t) => s + t.workSeconds, 0);
    const cyc = done.length ? done.reduce((s, t) => s + cycleDays(t), 0) / done.length : 0;
    return {
      completed: done.length,
      pcompleted: pdone.length,
      planned: cur.length,
      pplanned: prev.length,
      rate: cur.length ? Math.round((done.length / cur.length) * 100) : 0,
      workSec: work,
      cycle: done.length ? cyc : null,
      wip: cur.filter((t) => t.status === "wip").length,
    };
  });
  function pct(curV: number, prevV: number): { txt: string; dir: "up" | "down" | "flat" } {
    if (prevV === 0) return { txt: curV > 0 ? "new" : "", dir: curV > 0 ? "up" : "flat" };
    const d = Math.round(((curV - prevV) / prevV) * 100);
    if (d === 0) return { txt: "±0%", dir: "flat" };
    return { txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`, dir: d > 0 ? "up" : "down" };
  }

  // Activity per day (planned vs completed)
  let activity = $derived.by(() => {
    const plan: Record<string, number> = {}, comp: Record<string, number> = {};
    for (const d of days) { plan[d] = 0; comp[d] = 0; }
    for (const t of cur) {
      const rd = refDate(t);
      if (rd && rd in plan) plan[rd]++;
      const cd = t.completedAt ? t.completedAt.slice(0, 10) : null;
      if (t.status === "done" && cd && cd in comp) comp[cd]++;
    }
    const max = Math.max(1, ...days.map((d) => Math.max(plan[d], comp[d])));
    return { plan, comp, max };
  });

  // Tracked time per day
  let timePerDay = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d] = 0;
    for (const t of cur) { const rd = refDate(t); if (rd && rd in map) map[rd] += t.workSeconds; }
    const max = Math.max(1, ...days.map((d) => map[d]));
    const total = days.reduce((s, d) => s + map[d], 0);
    return { map, max, total };
  });

  // By tag
  let tagAgg = $derived.by(() => {
    const agg = new Map<string, { color: string; n: number; w: number }>();
    for (const t of cur) {
      for (const tg of tagsByTodo.get(t.id) ?? []) {
        const e = agg.get(tg.name) ?? { color: tagColor(tg), n: 0, w: 0 };
        e.n++; e.w += t.workSeconds;
        agg.set(tg.name, e);
      }
    }
    const rows = [...agg.entries()].map(([name, d]) => ({ name, ...d })).sort((a, b) => b.n - a.n);
    const max = Math.max(1, ...rows.map((r) => r.n));
    return { rows, max };
  });

  // Status split
  let statusSplit = $derived.by(() => {
    const c = { open: 0, wip: 0, done: 0 };
    for (const t of cur) c[t.status]++;
    return c;
  });

  // Table
  const STATUS_META: Record<TodoStatus, { label: string; color: string }> = {
    open: { label: "To do", color: "#3b82f6" },
    wip: { label: "In progress", color: "#f59e0b" },
    done: { label: "Done", color: "#10b981" },
  };
  let tableRows = $derived(
    [...cur]
      .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
      .slice(0, 60),
  );

  // ----- chart geometry -----
  const AW = 560, AH = 200, APAD = 24;
  let aBarW = $derived(Math.max(3, ((AW - APAD) / days.length) * 0.38));
  const ax = (i: number) => APAD + i * ((AW - APAD) / days.length);
  const ay = (v: number, max: number) => AH - 20 - (v / max) * (AH - 40);
  const TW = 520, TH = 180, TPAD = 24;
  let tBarW = $derived(Math.max(3, ((TW - TPAD) / days.length) * 0.6));
  const tx = (i: number) => TPAD + i * ((TW - TPAD) / days.length);
  let xLabelStep = $derived(Math.max(1, Math.ceil(days.length / 7)));

  // donut
  const R = 64, C = 2 * Math.PI * R;
  let donut = $derived.by(() => {
    const total = cur.length || 1;
    const segs: { k: TodoStatus; color: string; len: number; off: number }[] = [];
    let off = 0;
    for (const [k, col] of [["done", "#10b981"], ["wip", "#f59e0b"], ["open", "#3b82f6"]] as const) {
      const len = (statusSplit[k] / total) * C;
      segs.push({ k, color: col, len, off });
      off += len;
    }
    return segs;
  });

  function toggleTag(name: string) {
    const n = new Set(tagFilter);
    n.has(name) ? n.delete(name) : n.add(name);
    tagFilter = n;
  }

  // ----- PNG export -----
  let contentEl: HTMLElement | undefined = $state();
  let copied = $state(false);
  async function exportPng() {
    if (!contentEl) return;
    try {
      const { toBlob } = await import("html-to-image");
      const dark = document.documentElement.classList.contains("dark");
      const bg = dark ? "#0d1017" : "#f4f5f7";
      const pad = 24;
      const w = contentEl.offsetWidth, h = contentEl.offsetHeight;
      const opts = {
        pixelRatio: 2,
        backgroundColor: bg,
        width: w + pad * 2,
        height: h + pad * 2,
        style: { boxSizing: "content-box", width: `${w}px`, height: `${h}px`, padding: `${pad}px`, margin: "0", background: bg },
      };
      await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
      await toBlob(contentEl, opts).catch(() => null);
      const blob = await toBlob(contentEl, opts);
      if (!blob) return;
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      try {
        const { copyImageToClipboard } = await import("$lib/ipc");
        await copyImageToClipboard(bytes);
      } catch {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      }
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch (e) {
      app.error = String(e);
    }
  }

  const chip = "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer";
  const chipOff = "border-neutral-200 bg-neutral-50 text-neutral-500 hover:text-neutral-800 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100";
  const chipOn = "border-transparent text-white";
</script>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
  <div class="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 class="font-serif text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100" style="font-family: var(--serif, ui-serif, Georgia, serif)">
        Dashboard
      </h1>
      <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {range[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} –
        {range[1].toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        · counting by {countBy === "done" ? "completed date" : "list date"}
      </p>
    </div>
    <button
      type="button"
      class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
      onclick={exportPng}
    >
      {#if copied}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>
        Copied!
      {:else}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M4 3a2 2 0 00-2 2v8a2 2 0 002 2h1V5h9V4a1 1 0 00-1-1H4z"/><path d="M8 6a2 2 0 00-2 2v7a2 2 0 002 2h7a2 2 0 002-2V8a2 2 0 00-2-2H8z"/></svg>
        Copy as image
      {/if}
    </button>
  </div>

  <div bind:this={contentEl}>
  <!-- Controls -->
  <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div class="flex flex-wrap items-center gap-2.5">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Range</span>
      {#each PRESETS as p (p.k)}
        <button
          type="button"
          class="{chip} {preset === p.k ? chipOn : chipOff}"
          style={preset === p.k ? "background-color: var(--accent, #4f46e5)" : ""}
          onclick={() => (preset = p.k)}
        >{p.label}</button>
      {/each}
      {#if preset === "custom"}
        <span class="flex items-center gap-2">
          <input type="date" bind:value={customFrom} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
          <span class="text-neutral-400">→</span>
          <input type="date" bind:value={customTo} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
        </span>
      {/if}
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Count by</span>
      <div class="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <button type="button" class="px-3 py-1.5 text-sm font-medium {countBy === 'list' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "list" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => (countBy = "list")}>List date</button>
        <button type="button" class="border-l border-neutral-200 px-3 py-1.5 text-sm font-medium dark:border-neutral-700 {countBy === 'done' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "done" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => (countBy = "done")}>Completed date</button>
      </div>
      {#if allTagNames.length}
        <span class="ml-2 text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Tags</span>
        {#each allTagNames as tg (tg.id)}
          <button
            type="button"
            class="inline-flex items-center gap-1.5 {chip} {tagFilter.has(tg.name) ? chipOn : chipOff}"
            style={tagFilter.has(tg.name) ? `background-color: ${tagColor(tg)}` : ""}
            onclick={() => toggleTag(tg.name)}
          >
            <span class="h-2 w-2 rounded-full" style="background-color: {tagColor(tg)}"></span>{tg.name}
          </button>
        {/each}
      {/if}
    </div>
  </div>

  {#if app.dashboardLoading && !app.dashboard}
    <p class="p-8 text-sm text-neutral-400">Loading…</p>
  {:else}
    <!-- KPIs -->
    <div class="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {#snippet kpiCard(label: string, value: string, sub: string, delta: { txt: string; dir: string } | null)}
        <div class="rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
          <div class="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-neutral-900 dark:text-neutral-100">{value}</div>
          <div class="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            {sub}
            {#if delta && delta.txt}
              <span class="font-semibold {delta.dir === 'up' ? 'text-emerald-500' : delta.dir === 'down' ? 'text-red-500' : 'text-neutral-400'}">{delta.txt}</span>
            {/if}
          </div>
        </div>
      {/snippet}
      {@render kpiCard("Completed", String(kpi.completed), `vs ${kpi.pcompleted} prev `, pct(kpi.completed, kpi.pcompleted))}
      {@render kpiCard("Planned", String(kpi.planned), "", pct(kpi.planned, kpi.pplanned))}
      {@render kpiCard("Completion", kpi.rate + "%", `${kpi.completed} of ${kpi.planned}`, null)}
      {@render kpiCard("Tracked time", fmtWork(kpi.workSec) || "0m", `${(kpi.workSec / 3600).toFixed(1)} hours`, null)}
      {@render kpiCard("Avg cycle", kpi.cycle === null ? "—" : kpi.cycle < 1 ? "<1d" : kpi.cycle.toFixed(1) + "d", "created → done", null)}
      {@render kpiCard("In progress", String(kpi.wip), "still open now", null)}
    </div>

    <!-- Charts row 1 -->
    <div class="mb-4 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
      <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Activity per day</h3>
        <p class="mb-3 text-xs text-neutral-400">Planned vs. completed</p>
        <svg viewBox="0 0 {AW} {AH}" class="w-full overflow-visible text-neutral-300 dark:text-neutral-600">
          <line x1={APAD} y1={AH - 20} x2={AW} y2={AH - 20} stroke="currentColor" />
          {#each days as d, i (d)}
            <rect x={ax(i)} y={ay(activity.plan[d], activity.max)} width={aBarW} height={AH - 20 - ay(activity.plan[d], activity.max)} rx="2" fill="#3b82f6" opacity="0.85" />
            <rect x={ax(i) + aBarW + 1.5} y={ay(activity.comp[d], activity.max)} width={aBarW} height={AH - 20 - ay(activity.comp[d], activity.max)} rx="2" fill="#10b981" />
            {#if i % xLabelStep === 0}
              <text x={ax(i) + aBarW} y={AH - 4} font-size="10" fill="currentColor" text-anchor="middle">{niceDate(d)}</text>
            {/if}
          {/each}
        </svg>
        <div class="mt-2.5 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#3b82f6"></i>Planned</span>
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#10b981"></i>Completed</span>
        </div>
      </div>

      <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Status split</h3>
        <p class="mb-3 text-xs text-neutral-400">Where tasks stand</p>
        <svg viewBox="0 0 180 180" class="mx-auto block max-w-[200px]">
          {#each donut as s (s.k)}
            <circle cx="90" cy="90" r={R} fill="none" stroke={s.color} stroke-width="20"
              stroke-dasharray="{s.len} {C - s.len}" stroke-dashoffset={-s.off} transform="rotate(-90 90 90)" />
          {/each}
          <text x="90" y="86" text-anchor="middle" font-size="30" font-weight="700" class="fill-neutral-900 dark:fill-neutral-100">{cur.length}</text>
          <text x="90" y="106" text-anchor="middle" font-size="11" class="fill-neutral-400">tasks</text>
        </svg>
        <div class="mt-2 flex justify-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#3b82f6"></i>open · <b class="text-neutral-700 dark:text-neutral-200">{statusSplit.open}</b></span>
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#f59e0b"></i>wip · <b class="text-neutral-700 dark:text-neutral-200">{statusSplit.wip}</b></span>
          <span class="inline-flex items-center gap-1.5"><i class="inline-block h-2.5 w-2.5 rounded-sm" style="background:#10b981"></i>done · <b class="text-neutral-700 dark:text-neutral-200">{statusSplit.done}</b></span>
        </div>
      </div>
    </div>

    <!-- Charts row 2 -->
    <div class="mb-4 grid gap-4 lg:grid-cols-2">
      <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tracked time per day</h3>
        <p class="mb-3 text-xs text-neutral-400">Peak {fmtWork(timePerDay.max) || "0m"} · total {fmtWork(timePerDay.total) || "0m"}</p>
        <svg viewBox="0 0 {TW} {TH}" class="w-full overflow-visible text-neutral-300 dark:text-neutral-600">
          <line x1={TPAD} y1={TH - 20} x2={TW} y2={TH - 20} stroke="currentColor" />
          {#each days as d, i (d)}
            <rect x={tx(i)} y={TH - 20 - (timePerDay.map[d] / timePerDay.max) * (TH - 40)} width={tBarW} height={(timePerDay.map[d] / timePerDay.max) * (TH - 40)} rx="2" fill="var(--accent, #4f46e5)" opacity="0.8" />
            {#if i % xLabelStep === 0}
              <text x={tx(i) + tBarW / 2} y={TH - 4} font-size="10" fill="currentColor" text-anchor="middle">{niceDate(d)}</text>
            {/if}
          {/each}
        </svg>
      </div>

      <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">By tag</h3>
        <p class="mb-3 text-xs text-neutral-400">Tasks &amp; time per tag</p>
        {#if tagAgg.rows.length === 0}
          <div class="py-8 text-center text-sm text-neutral-400">No tagged tasks in range.</div>
        {:else}
          {#each tagAgg.rows as r (r.name)}
            <div class="my-2 grid grid-cols-[84px_1fr_auto] items-center gap-2.5">
              <span class="inline-flex items-center gap-1.5 truncate text-[12.5px] font-medium text-neutral-700 dark:text-neutral-300">
                <span class="h-2 w-2 shrink-0 rounded-full" style="background:{r.color}"></span>{r.name}
              </span>
              <span class="h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                <span class="block h-full rounded-full" style="width:{Math.round((r.n / tagAgg.max) * 100)}%;background:{r.color}"></span>
              </span>
              <span class="whitespace-nowrap text-xs tabular-nums text-neutral-500 dark:text-neutral-400">{r.n} · {fmtWork(r.w) || "0m"}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
        Tasks in period <span class="font-normal text-neutral-400">({cur.length})</span>
      </h3>
      <p class="mb-3 text-xs text-neutral-400">The raw material for a report</p>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
              <th class="px-2.5 py-2 font-semibold">Task</th>
              <th class="px-2.5 py-2 font-semibold">Tags</th>
              <th class="px-2.5 py-2 font-semibold">Status</th>
              <th class="px-2.5 py-2 font-semibold">Created</th>
              <th class="px-2.5 py-2 font-semibold">Work</th>
              <th class="px-2.5 py-2 font-semibold">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {#if tableRows.length === 0}
              <tr><td colspan="6" class="py-8 text-center text-sm text-neutral-400">No tasks in this period.</td></tr>
            {:else}
              {#each tableRows as t (t.id)}
                <tr class="border-b border-neutral-100 dark:border-neutral-800/70">
                  <td class="px-2.5 py-2 text-neutral-800 dark:text-neutral-200">{t.text}</td>
                  <td class="px-2.5 py-2">
                    <span class="inline-flex flex-wrap gap-1">
                      {#each tagsByTodo.get(t.id) ?? [] as tg (tg.id)}
                        <span class="rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style="background:{tagColor(tg)}1f;color:{tagColor(tg)}">{tg.name}</span>
                      {:else}
                        <span class="text-neutral-300 dark:text-neutral-600">—</span>
                      {/each}
                    </span>
                  </td>
                  <td class="px-2.5 py-2">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style="background:{STATUS_META[t.status].color}1f;color:{STATUS_META[t.status].color}">
                      <span class="h-1.5 w-1.5 rounded-full" style="background:{STATUS_META[t.status].color}"></span>{STATUS_META[t.status].label}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{niceDate(t.createdAt.slice(0, 10))}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{fmtWork(t.workSeconds) || "—"}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{t.status === "done" ? (cycleDays(t) < 1 ? "<1d" : cycleDays(t) + "d") : "—"}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
  </div>
</main>
