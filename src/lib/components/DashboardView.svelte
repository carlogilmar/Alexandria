<script lang="ts">
  import { app } from "$lib/stores/app.svelte";
  import type { DashboardTask, TodoTag, TodoStatus } from "$lib/ipc";
  import { fmtWork, tagColor, taskTitleHtml } from "$lib/tasktime";
  import { mountBubbleField, type BubbleTask, type BubbleField } from "$lib/bubblefield";
  import { theme } from "$lib/stores/theme.svelte";

  // ----- date helpers -----
  const DAY = 86400000;
  function iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  function startOfToday(): Date { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  const niceDate = (s: string) => new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // ----- controls state -----
  type Preset = "week" | "month" | "7" | "30" | "custom";
  const PRESETS: { k: Preset; label: string }[] = [
    { k: "week", label: "This week" }, { k: "month", label: "This month" },
    { k: "7", label: "Last 7 days" }, { k: "30", label: "Last 30 days" }, { k: "custom", label: "Custom" },
  ];
  const MEASURE_HINT = {
    list: "Counts each task on the day it was on a list (your plan).",
    done: "Counts each task on the day you completed it (throughput).",
  };
  let preset = $state<Preset>("week");
  let countBy = $state<"list" | "done">("list");
  let tagFilter = $state<Set<string>>(new Set());
  let customFrom = $state(iso(addDays(startOfToday(), -6)));
  let customTo = $state(iso(startOfToday()));
  let tagMenuOpen = $state(false);
  let tagQuery = $state("");
  let drill = $state<{ kind: "day" | "tag"; key: string; label: string } | null>(null);

  const today = startOfToday();

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
  let fetchFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevFrom = $derived(iso(addDays(range[0], -rangeLen)));
  let prevTo = $derived(iso(addDays(range[0], -1)));

  $effect(() => {
    const ff = fetchFrom, t = to;
    if (app.dashboardFetchedFrom !== ff || app.dashboardFetchedTo !== t) app.loadDashboard(ff, t);
  });

  // Changing what we look at clears any active drill.
  function resetDrill() { drill = null; }
  function setPreset(p: Preset) { preset = p; resetDrill(); }
  function setCountBy(c: "list" | "done") { countBy = c; resetDrill(); }
  function toggleTag(name: string) {
    const n = new Set(tagFilter);
    n.has(name) ? n.delete(name) : n.add(name);
    tagFilter = n; resetDrill();
  }

  // ----- data -----
  let allTasks = $derived<DashboardTask[]>(app.dashboard?.tasks ?? []);
  let tagsByTodo = $derived.by<Map<number, TodoTag[]>>(() => {
    const m = new Map<number, TodoTag[]>();
    for (const r of app.dashboard?.tags ?? []) { const a = m.get(r.todoId) ?? []; a.push(r); m.set(r.todoId, a); }
    return m;
  });
  let allTagNames = $derived.by<TodoTag[]>(() => {
    const seen = new Map<string, TodoTag>();
    for (const r of app.dashboard?.tags ?? []) if (!seen.has(r.name)) seen.set(r.name, r);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  const refDate = (t: DashboardTask): string | null =>
    countBy === "done" ? (t.completedAt ? t.completedAt.slice(0, 10) : null) : (t.listDate || null);
  function inWin(t: DashboardTask, a: string, b: string): boolean {
    const rd = refDate(t);
    if (!rd || rd < a || rd > b) return false;
    if (tagFilter.size && !(tagsByTodo.get(t.id) ?? []).some((x) => tagFilter.has(x.name))) return false;
    return true;
  }
  let cur = $derived(allTasks.filter((t) => inWin(t, from, to)));
  let prev = $derived(allTasks.filter((t) => inWin(t, prevFrom, prevTo)));
  let days = $derived.by<string[]>(() => {
    const out: string[] = [];
    for (let d = new Date(range[0]); d <= range[1]; d = addDays(d, 1)) out.push(iso(d));
    return out;
  });

  // KPIs
  let kpi = $derived.by(() => {
    const done = cur.filter((t) => t.status === "done").length;
    const pdone = prev.filter((t) => t.status === "done").length;
    return {
      completed: done, pcompleted: pdone,
      planned: cur.length, pplanned: prev.length,
      rate: cur.length ? Math.round((done / cur.length) * 100) : 0,
      workSec: cur.reduce((s, t) => s + t.workSeconds, 0),
    };
  });
  function delta(c: number, p: number): { txt: string; dir: string } {
    if (p === 0) return { txt: c > 0 ? "new" : "", dir: "up" };
    const d = Math.round(((c - p) / p) * 100);
    if (d === 0) return { txt: "", dir: "flat" };
    return { txt: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%`, dir: d > 0 ? "up" : "down" };
  }

  // Mosaic — uniform squares, all packed together into one figure, ordered by
  // primary tag so same-tag colors naturally cluster (no labels; hover reveals
  // the task + tags).
  const primaryTag = (t: DashboardTask) => {
    const tags = tagsByTodo.get(t.id) ?? [];
    return tags.length ? tags[0].name : "￿"; // untagged clusters last
  };
  let mosaicTasks = $derived([...cur].sort((a, b) => primaryTag(a).localeCompare(primaryTag(b))));
  function taskColors(t: DashboardTask): string[] {
    return (tagsByTodo.get(t.id) ?? []).slice(0, 3).map((x) => tagColor(x));
  }
  function squareBg(c: string[]): string {
    if (c.length === 0) return "var(--st-empty)";
    if (c.length === 1) return c[0];
    if (c.length === 2) return `linear-gradient(135deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`;
    return `linear-gradient(135deg, ${c[0]} 0 33.33%, ${c[1]} 33.33% 66.66%, ${c[2]} 66.66% 100%)`;
  }
  function mosaicDim(t: DashboardTask): boolean {
    const d = drill;
    if (!d) return false;
    if (d.kind === "day") return refDate(t) !== d.key;
    return !(tagsByTodo.get(t.id) ?? []).some((x) => x.name === d.key);
  }

  // Tracked time per day
  let timePerDay = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const d of days) map[d] = 0;
    for (const t of cur) { const rd = refDate(t); if (rd && rd in map) map[rd] += t.workSeconds; }
    const max = Math.max(1, ...days.map((d) => map[d]));
    return { map, max, total: days.reduce((s, d) => s + map[d], 0) };
  });
  let xLabelStep = $derived(Math.max(1, Math.ceil(days.length / 8)));

  // Completed over time — cumulative done per day (by completion date).
  const BW = 520, BH = 176, BPAD = 26;
  let burnup = $derived.by(() => {
    const perDay: Record<string, number> = {};
    for (const d of days) perDay[d] = 0;
    for (const t of cur)
      if (t.status === "done" && t.completedAt) {
        const cd = t.completedAt.slice(0, 10);
        if (cd in perDay) perDay[cd]++;
      }
    let cum = 0;
    const pts = days.map((d) => (cum += perDay[d]));
    const total = cum, max = Math.max(1, cum), n = days.length;
    const bx = (i: number) => BPAD + (n <= 1 ? 0 : i * ((BW - BPAD - 8) / (n - 1)));
    const by = (v: number) => BH - 22 - (v / max) * (BH - 44);
    const line = pts.map((v, i) => `${bx(i)},${by(v)}`).join(" ");
    const area = `${bx(0)},${BH - 22} ${line} ${bx(n - 1)},${BH - 22}`;
    const step = Math.max(1, Math.ceil(n / 6));
    const labels = days.map((d, i) => ({ x: bx(i), show: i % step === 0, txt: niceDate(d) }));
    return { total, line, area, endX: bx(n - 1), endY: by(cum), labels };
  });

  // Effort by weekday — tracked time summed per weekday (Mon–Sun), tile style.
  const WK_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let weekday = $derived.by(() => {
    const s = [0, 0, 0, 0, 0, 0, 0];
    for (const t of cur) {
      const rd = refDate(t);
      if (!rd) continue;
      const dow = (new Date(rd + "T00:00:00").getDay() + 6) % 7;
      s[dow] += t.workSeconds;
    }
    const total = s.reduce((a, b) => a + b, 0), mx = Math.max(...s);
    return { s, max: Math.max(1, mx), total, peak: total > 0 ? s.indexOf(mx) : -1 };
  });

  // Task bubble field — a full-width canvas physics sim (see $lib/bubblefield).
  // Bubbles size by tracked time, colour by status (theme accent). The sim is
  // (re)mounted only when the task SET changes, so a drill/hover re-render doesn't
  // reset the drift. Click a bubble → open the task detail modal.
  let bubbleCanvas: HTMLCanvasElement | undefined = $state();
  let bubbleField = $state<BubbleField | null>(null);
  function escText(s: string): string {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c);
  }
  function bubbleTip(t: BubbleTask): string {
    const tags = tagsByTodo.get(t.id) ?? [];
    const chips = tags.length
      ? tags.map((x) => `<span class="md-stages-tmag" style="color:${tagColor(x)}">${escText(x.name)}</span>`).join(" ")
      : '<span class="md-stages-nod">no tags</span>';
    return `<b>${escText(t.text)}</b>${chips}<div class="md-stages-nod" style="font-style:normal;margin-top:3px">${fmtWork(t.workSeconds) || "0m"} · ${STATUS[t.status].label}</div>`;
  }
  $effect(() => {
    const list: BubbleTask[] = cur.map((t) => ({ id: t.id, text: t.text, status: t.status, workSeconds: t.workSeconds }));
    // Re-mount when the resolved theme / tint changes so the bubbles pick up the
    // new accent colour (they read it once at mount).
    void theme.resolved; void theme.sidebarTint;
    const el = bubbleCanvas;
    if (!el || list.length === 0) return;
    const sim = mountBubbleField(el, list, { onOpen: (id) => app.selectTodo(id), tipHtml: bubbleTip });
    bubbleField = sim;
    return () => { sim.destroy(); bubbleField = null; };
  });

  function drillDay(d: string) {
    if (timePerDay.map[d] <= 0 && !drill) return;
    const cur0 = drill;
    drill = cur0 && cur0.kind === "day" && cur0.key === d ? null : { kind: "day", key: d, label: niceDate(d) };
  }

  // Table (drill-filtered) — compact status labels so the pill fits a row.
  const STATUS: Record<TodoStatus, { label: string; color: string }> = {
    open: { label: "Open", color: "#3b82f6" },
    wip: { label: "WIP", color: "#f59e0b" },
    done: { label: "Done", color: "#10b981" },
  };
  const STATUS_RANK: Record<TodoStatus, number> = { wip: 0, open: 1, done: 2 };
  let sortKey = $state<"recent" | "status" | "tag">("recent");
  function firstTag(t: DashboardTask): string {
    const tags = tagsByTodo.get(t.id) ?? [];
    return tags.length ? tags[0].name : "￿"; // untagged sorts last
  }
  function drillMatch(t: DashboardTask): boolean {
    const d = drill;
    if (!d) return true;
    if (d.kind === "day") return refDate(t) === d.key;
    return (tagsByTodo.get(t.id) ?? []).some((x) => x.name === d.key);
  }
  let tableRows = $derived.by(() => {
    const rows = cur.filter(drillMatch);
    const recent = (a: DashboardTask, b: DashboardTask) =>
      (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt);
    if (sortKey === "status")
      rows.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || recent(a, b));
    else if (sortKey === "tag")
      rows.sort((a, b) => firstTag(a).localeCompare(firstTag(b)) || recent(a, b));
    else rows.sort(recent);
    return rows.slice(0, 80);
  });
  const fmtWorkShort = (sec: number) =>
    sec <= 0 ? "" : sec >= 3600 ? `${Math.round((sec / 3600) * 10) / 10}h` : `${Math.round(sec / 60)}m`;
  function cycle(t: DashboardTask): string {
    if (t.status !== "done" || !t.completedAt) return "—";
    const d = Math.round((new Date(t.completedAt.slice(0, 10)).getTime() - new Date(t.createdAt.slice(0, 10)).getTime()) / DAY);
    return d < 1 ? "<1d" : d + "d";
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
      const pad = 24, w = contentEl.offsetWidth, h = contentEl.offsetHeight;
      const opts = { pixelRatio: 2, backgroundColor: bg, width: w + pad * 2, height: h + pad * 2,
        style: { boxSizing: "content-box", width: `${w}px`, height: `${h}px`, padding: `${pad}px`, margin: "0", background: bg } };
      await (document.fonts?.ready ?? Promise.resolve()).catch(() => {});
      await toBlob(contentEl, opts).catch(() => null);
      const blob = await toBlob(contentEl, opts);
      if (!blob) return;
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      try { const { copyImageToClipboard } = await import("$lib/ipc"); await copyImageToClipboard(bytes); }
      catch { await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); }
      copied = true; setTimeout(() => (copied = false), 1500);
    } catch (e) { app.error = String(e); }
  }

  const chip = "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap cursor-pointer";
  const chipOff = "border-neutral-200 bg-neutral-50 text-neutral-500 hover:text-neutral-800 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100";
  let filteredTags = $derived(allTagNames.filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase())));
</script>

<main class="mx-auto w-full max-w-6xl px-6 py-8" style="--st-empty:#d3d8e0">
  <div class="mb-5 flex items-end justify-between gap-4">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100" style="font-family: var(--serif, ui-serif, Georgia, serif)">Dashboard</h1>
      <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {range[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} –
        {range[1].toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        · by {countBy === "done" ? "completed" : "planned"} day
      </p>
    </div>
    <button type="button" class="flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-600 shadow-sm transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800" onclick={exportPng}>
      {#if copied}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4 text-emerald-500"><path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0l-3.5-3.5a1 1 0 011.4-1.4l2.8 2.8 6.8-6.8a1 1 0 011.4 0z" clip-rule="evenodd"/></svg>Copied!
      {:else}
        <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M4 3a2 2 0 00-2 2v8a2 2 0 002 2h1V5h9V4a1 1 0 00-1-1H4z"/><path d="M8 6a2 2 0 00-2 2v7a2 2 0 002 2h7a2 2 0 002-2V8a2 2 0 00-2-2H8z"/></svg>Copy as image
      {/if}
    </button>
  </div>

  <div bind:this={contentEl}>
  <!-- Controls -->
  <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div class="flex flex-wrap items-center gap-2.5">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Range</span>
      {#each PRESETS as p (p.k)}
        <button type="button" class="{chip} {preset === p.k ? 'border-transparent text-white' : chipOff}" style={preset === p.k ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setPreset(p.k)}>{p.label}</button>
      {/each}
      {#if preset === "custom"}
        <span class="flex items-center gap-2">
          <input type="date" bind:value={customFrom} onchange={resetDrill} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
          <span class="text-neutral-400">→</span>
          <input type="date" bind:value={customTo} onchange={resetDrill} class="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
        </span>
      {/if}
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Measure by</span>
      <div class="inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
        <button type="button" class="px-3 py-1.5 text-sm font-medium {countBy === 'list' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "list" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setCountBy("list")}>Planned day</button>
        <button type="button" class="border-l border-neutral-200 px-3 py-1.5 text-sm font-medium dark:border-neutral-700 {countBy === 'done' ? 'text-white' : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800/60 dark:text-neutral-400'}" style={countBy === "done" ? "background-color: var(--accent, #4f46e5)" : ""} onclick={() => setCountBy("done")}>Completed day</button>
      </div>
      <span class="text-xs italic text-neutral-400">{MEASURE_HINT[countBy]}</span>

      <div class="relative ml-auto">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-400 dark:hover:text-neutral-100" onclick={() => (tagMenuOpen = !tagMenuOpen)}>
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><path d="M2 5a3 3 0 013-3h4.6a3 3 0 012.1.9l5.4 5.4a2 2 0 010 2.8l-4.6 4.6a2 2 0 01-2.8 0L6.3 10.3A3 3 0 015 8.6V5zm3 .5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/></svg>
          Tags {#if tagFilter.size}<span class="rounded-full bg-[var(--accent,#4f46e5)] px-1.5 text-[11px] font-semibold text-white">{tagFilter.size}</span>{/if}
          <span class="text-[10px]">▾</span>
        </button>
        {#if tagMenuOpen}
          <button type="button" class="fixed inset-0 z-10 cursor-default" aria-label="Close" onclick={() => (tagMenuOpen = false)}></button>
          <div class="absolute right-0 z-20 mt-1.5 w-60 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <input placeholder="Search tags…" bind:value={tagQuery} class="mb-1.5 w-full rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100" />
            <ul class="max-h-52 overflow-auto">
              {#each filteredTags as tg (tg.id)}
                <li>
                  <button type="button" class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800" onclick={() => toggleTag(tg.name)}>
                    <span class="h-2.5 w-2.5 rounded-full" style="background:{tagColor(tg)}"></span>
                    <span class="text-neutral-700 dark:text-neutral-200">{tg.name}</span>
                    {#if tagFilter.has(tg.name)}<span class="ml-auto font-bold text-[var(--accent,#4f46e5)]">✓</span>{/if}
                  </button>
                </li>
              {:else}
                <li class="px-2 py-2 text-sm text-neutral-400">No tags</li>
              {/each}
            </ul>
            {#if tagFilter.size}
              <div class="mt-1.5 border-t border-neutral-100 pt-1.5 text-right dark:border-neutral-800">
                <button type="button" class="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200" onclick={() => { tagFilter = new Set(); resetDrill(); }}>Clear all</button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
    {#if tagFilter.size}
      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <span class="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Filtering</span>
        {#each [...tagFilter] as name (name)}
          <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold" style="background:{tagColor({ id: 0, color: allTagNames.find((x) => x.name === name)?.color ?? null })}1f;color:{tagColor({ id: 0, color: allTagNames.find((x) => x.name === name)?.color ?? null })}">
            {name}<button type="button" class="opacity-70 hover:opacity-100" aria-label="Remove" onclick={() => toggleTag(name)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  {#if app.dashboardLoading && !app.dashboard}
    <p class="p-8 text-sm text-neutral-400">Loading…</p>
  {:else}
    <!-- KPIs -->
    <div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {#snippet kpiCard(label: string, value: string, sub: string, d: { txt: string; dir: string } | null)}
        <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
          <div class="mt-1.5 text-3xl font-extrabold tabular-nums tracking-tight" style="color: var(--accent, #4f46e5)">{value}</div>
          <div class="mt-0.5 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
            {sub}
            {#if d && d.txt}<span class="font-semibold {d.dir === 'up' ? 'text-emerald-500' : d.dir === 'down' ? 'text-red-500' : 'text-neutral-400'}">{d.txt}</span>{/if}
          </div>
        </div>
      {/snippet}
      {@render kpiCard("Completed", String(kpi.completed), `vs ${kpi.pcompleted} prev `, delta(kpi.completed, kpi.pcompleted))}
      {@render kpiCard("Planned", String(kpi.planned), "", delta(kpi.planned, kpi.pplanned))}
      {@render kpiCard("Completion", kpi.rate + "%", `${kpi.completed} of ${kpi.planned}`, null)}
      {@render kpiCard("Tracked time", fmtWork(kpi.workSec) || "0m", `${(kpi.workSec / 3600).toFixed(1)} hours`, null)}
    </div>

    {#if cur.length === 0}
      <div class="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400 dark:bg-neutral-800">
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-6 w-6"><path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm3 3a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h5a1 1 0 100-2H6z"/></svg>
        </div>
        <p class="text-sm font-medium text-neutral-700 dark:text-neutral-200">No tasks in this period yet</p>
        <p class="mt-1 text-xs text-neutral-400">Try a wider range, clear any tag filters, or start tracking a task — the charts will fill in here.</p>
      </div>
    {:else}

    <!-- Task mosaic — grouped by tag; a check marks completed tasks -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tasks this period</h3>
        <span class="text-xs text-neutral-400">{cur.length} · color = tags · ✓ = done · hover for detail · click to open</span>
      </div>
      <div class="flex flex-wrap gap-px">
        {#each mosaicTasks as t (t.id)}
          <button
            type="button"
            class="relative h-4 w-4 transition-transform hover:z-10 hover:scale-150 {mosaicDim(t) ? 'opacity-20' : ''}"
            style="background:{squareBg(taskColors(t))}"
            title={`${t.text}\n${(tagsByTodo.get(t.id) ?? []).map((x) => x.name).join(', ') || 'no tags'} · ${fmtWork(t.workSeconds) || '0m'} · ${STATUS[t.status].label}`}
            aria-label={t.text}
            onclick={() => app.selectTodo(t.id)}
          >
            {#if t.status === "done"}
              <svg viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="3.2" class="absolute inset-0 m-auto h-2.5 w-2.5" style="filter:drop-shadow(0 0 1px rgba(0,0,0,.7))"><path stroke-linecap="round" stroke-linejoin="round" d="M4 10.5l4 4 8-9"/></svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Task bubble field (canvas physics) -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Task field</h3>
        <span class="text-xs text-neutral-400">size = tracked time · colour = status · drag or click to open · pinch / ⌘-scroll or the buttons to zoom</span>
      </div>
      <div class="relative w-full" style="height:340px">
        <canvas bind:this={bubbleCanvas} class="absolute inset-0 h-full w-full" style="touch-action:none;cursor:grab"></canvas>
        <div class="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white/90 shadow-sm backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90">
          <button type="button" class="flex h-7 w-7 items-center justify-center text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" title="Zoom in" aria-label="Zoom in" onclick={() => bubbleField?.zoomBy(1.25)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M9 4a1 1 0 012 0v4h4a1 1 0 110 2h-4v4a1 1 0 11-2 0v-4H5a1 1 0 110-2h4V4z"/></svg>
          </button>
          <button type="button" class="flex h-7 w-7 items-center justify-center border-t border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" title="Zoom out" aria-label="Zoom out" onclick={() => bubbleField?.zoomBy(0.8)}>
            <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><path d="M5 9a1 1 0 000 2h10a1 1 0 100-2H5z"/></svg>
          </button>
          <button type="button" class="flex h-7 w-7 items-center justify-center border-t border-neutral-200 text-[10px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-100" title="Reset zoom" aria-label="Reset zoom" onclick={() => bubbleField?.reset()}>1:1</button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-4 text-[11.5px] text-neutral-500 dark:text-neutral-400">
        <span class="inline-flex items-center gap-1.5"><span class="h-3 w-3 rounded-full border border-dashed border-neutral-400"></span>Not started / to do</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-3 w-3 rounded-full" style="background:color-mix(in srgb, var(--accent,#4f46e5) 58%, white)"></span>In progress</span>
        <span class="inline-flex items-center gap-1.5"><span class="grid h-3 w-3 place-items-center rounded-full text-[7px] font-bold text-white" style="background:var(--accent,#4f46e5)">✓</span>Done</span>
        <span class="text-neutral-400 dark:text-neutral-500">· bigger = more tracked time</span>
      </div>
    </div>

    <!-- Tracked time per day  +  Effort by weekday -->
    <div class="mb-4 grid gap-4 lg:grid-cols-2">
      <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div class="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tracked time per day</h3>
          <span class="text-xs text-neutral-400">peak {fmtWork(timePerDay.max) || "0m"} · click a bar to focus</span>
        </div>
        {#if timePerDay.total === 0}
          <div class="py-10 text-center text-sm text-neutral-400">
            No time tracked in this period yet.<br />
            <span class="text-xs text-neutral-400 dark:text-neutral-500">Start a task (▶) to begin tracking.</span>
          </div>
        {:else}
          <div class="flex h-40 items-end gap-1 pt-2">
            {#each days as d, i (d)}
              {@const val = timePerDay.map[d]}
              {@const h = Math.round((val / timePerDay.max) * 100)}
              {@const active = drill?.kind === "day" && drill.key === d}
              {@const dim = drill?.kind === "day" && !active}
              <button type="button" class="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${niceDate(d)} · ${fmtWork(val) || "0m"}`} onclick={() => drillDay(d)}>
                {#if val > 0 && h < 30}
                  <span class="mb-0.5 whitespace-nowrap text-[9px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">{fmtWorkShort(val)}</span>
                {/if}
                <span class="relative flex w-[80%] max-w-[30px] justify-center rounded-t transition-[height,opacity] duration-500 {dim ? 'opacity-25' : active ? 'opacity-100 ring-2 ring-[var(--accent,#4f46e5)]/50' : 'opacity-85 hover:opacity-100'}" style="height:{h}%;background:var(--accent,#4f46e5)">
                  {#if val > 0 && h >= 30}
                    <span class="absolute top-1 text-[9px] font-bold tabular-nums text-white">{fmtWorkShort(val)}</span>
                  {/if}
                </span>
                <span class="mt-1 whitespace-nowrap text-[9px] text-neutral-400">{i % xLabelStep === 0 ? niceDate(d) : ""}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div class="mb-3 flex flex-wrap items-baseline gap-2">
          <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Effort by weekday</h3>
          <span class="text-xs text-neutral-400">tracked time per weekday</span>
        </div>
        {#if weekday.total === 0}
          <div class="flex flex-1 items-center justify-center py-10 text-center text-sm text-neutral-400">No tracked time yet.</div>
        {:else}
          <div class="flex flex-1 flex-col justify-center">
            <div class="grid grid-cols-7 gap-2">
              {#each WK_NAMES as nm, i (nm)}
                {@const sec = weekday.s[i]}
                {@const peak = i === weekday.peak}
                <div class="rounded-xl border p-2 text-center transition-colors {peak ? '' : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800/40'}"
                  style={peak ? "border-color:var(--accent,#4f46e5);background:color-mix(in srgb, var(--accent,#4f46e5) 12%, transparent)" : ""}>
                  <div class="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{nm}</div>
                  <div class="my-1.5 text-sm font-extrabold tabular-nums {sec ? '' : 'text-neutral-300 dark:text-neutral-600'}" style={sec ? "color:var(--accent,#4f46e5)" : ""}>{sec ? fmtWorkShort(sec) : "–"}</div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700/60">
                    <div class="h-full rounded-full transition-[width] duration-500" style="width:{Math.round((sec / weekday.max) * 100)}%;background:var(--accent,#4f46e5)"></div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Completed over time -->
    <div class="mb-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div class="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Completed over time</h3>
        <span class="text-xs text-neutral-400">cumulative tasks done this period</span>
      </div>
      {#if burnup.total === 0}
        <div class="py-10 text-center text-sm text-neutral-400">Nothing completed in this period yet.</div>
      {:else}
        <svg viewBox="0 0 {BW} {BH}" class="w-full overflow-visible">
          <defs>
            <linearGradient id="burnGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="var(--accent,#4f46e5)" stop-opacity="0.28" />
              <stop offset="1" stop-color="var(--accent,#4f46e5)" stop-opacity="0" />
            </linearGradient>
          </defs>
          <line x1={BPAD} y1={BH - 22} x2={BW} y2={BH - 22} class="stroke-neutral-200 dark:stroke-neutral-700" />
          <polygon points={burnup.area} fill="url(#burnGrad)" />
          <polyline points={burnup.line} fill="none" stroke="var(--accent,#4f46e5)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
          <circle cx={burnup.endX} cy={burnup.endY} r="4" fill="var(--accent,#4f46e5)" />
          <text x={burnup.endX} y={burnup.endY - 9} class="fill-neutral-800 dark:fill-neutral-100" font-size="12" font-weight="700" text-anchor="end">{burnup.total} done</text>
          {#each burnup.labels as l, i (i)}
            {#if l.show}<text x={l.x} y={BH - 5} class="fill-neutral-400" font-size="10" text-anchor="middle">{l.txt}</text>{/if}
          {/each}
        </svg>
      {/if}
    </div>

    <!-- Table -->
    <div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {#if drill}
        <div class="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm" style="background: color-mix(in srgb, var(--accent,#4f46e5) 12%, transparent); border-color: color-mix(in srgb, var(--accent,#4f46e5) 30%, transparent)">
          <span class="text-neutral-600 dark:text-neutral-300">Focused on {drill.kind}: <b style="color:var(--accent,#4f46e5)">{drill.label}</b></span>
          <button type="button" class="ml-auto rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300" onclick={resetDrill}>← Back to overview</button>
        </div>
      {/if}
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h3 class="text-sm font-semibold text-neutral-800 dark:text-neutral-100">Tasks <span class="font-normal text-neutral-400">({cur.filter(drillMatch).length})</span></h3>
        <span class="text-xs text-neutral-400">click a row for detail</span>
        <div class="ml-auto flex items-center gap-1 text-xs">
          <span class="text-neutral-400">Sort</span>
          {#each [["recent", "Recent"], ["status", "Status"], ["tag", "Tag"]] as opt (opt[0])}
            <button
              type="button"
              class="rounded-md px-2 py-1 font-medium transition-colors {sortKey === opt[0] ? 'text-white' : 'bg-neutral-100 text-neutral-500 hover:text-neutral-800 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100'}"
              style={sortKey === opt[0] ? "background-color: var(--accent, #4f46e5)" : ""}
              onclick={() => (sortKey = opt[0] as "recent" | "status" | "tag")}
            >{opt[1]}</button>
          {/each}
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
              <th class="px-2.5 py-2 font-semibold">Task</th><th class="px-2.5 py-2 font-semibold">Tags</th>
              <th class="px-2.5 py-2 font-semibold">Status</th><th class="px-2.5 py-2 font-semibold">Created</th>
              <th class="px-2.5 py-2 font-semibold">Work</th><th class="px-2.5 py-2 font-semibold">Cycle</th>
            </tr>
          </thead>
          <tbody>
            {#if tableRows.length === 0}
              <tr><td colspan="6" class="py-8 text-center text-sm text-neutral-400">No tasks.</td></tr>
            {:else}
              {#each tableRows as t (t.id)}
                <tr class="cursor-pointer border-b border-neutral-100 transition-colors hover:bg-neutral-50 dark:border-neutral-800/70 dark:hover:bg-neutral-800/40" onclick={() => app.selectTodo(t.id)}>
                  <td class="px-2.5 py-2 text-neutral-800 dark:text-neutral-200">{@html taskTitleHtml(t.text)}</td>
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
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style="background:{STATUS[t.status].color}1f;color:{STATUS[t.status].color}">
                      <span class="h-1.5 w-1.5 rounded-full" style="background:{STATUS[t.status].color}"></span>{STATUS[t.status].label}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{niceDate(t.createdAt.slice(0, 10))}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{fmtWork(t.workSeconds) || "—"}</td>
                  <td class="whitespace-nowrap px-2.5 py-2 tabular-nums text-neutral-500 dark:text-neutral-400">{cycle(t)}</td>
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
      </div>
    </div>
    {/if}
  {/if}
  </div>
</main>
