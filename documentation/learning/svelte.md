# Svelte fundamentals + the frontend

This document is for developers who have never written Svelte. By the end you should be able to read every `.svelte` file under `src/` and know what it does.

It has two halves:
1. **Svelte the framework** — just enough to read this codebase.
2. **The frontend** — file-by-file tour and the conventions we follow.

We are on **Svelte 5**, which introduced "runes" — a new reactivity model that looks quite different from Svelte 3/4 tutorials you might find online. This doc only covers the Svelte 5 way.

---

## Part 1 — Svelte, the absolute minimum

### Why Svelte for this app?

A few reasons it suits a local-first desktop app:

1. **No virtual DOM.** Svelte compiles components down to direct DOM-manipulation code at build time. That means smaller bundles and faster updates — both matter when the app runs inside a webview rather than a full browser.
2. **Tiny runtime, tiny bundles.** The whole frontend, including markdown rendering, compiles to a couple hundred KB. Good for cold-start time when launching the `.app`.
3. **Less boilerplate.** A Svelte component is just HTML with some `<script>` and `<style>` on top. State is a variable; updating the variable updates the DOM. There's no `useState`, no reducers, no providers.
4. **TypeScript out of the box.** `<script lang="ts">` and you get full type-checking on props, state, and IPC return values.

The trade-off is a smaller ecosystem than React, but for a single-window desktop app we don't lean on third-party UI libraries anyway.

### A Svelte component, end to end

A `.svelte` file has three optional sections:

```svelte
<script lang="ts">
  // TypeScript: state, derived values, functions, lifecycle
</script>

<!-- HTML markup with directives -->
<button onclick={handleClick}>{label}</button>

<style>
  /* Component-scoped CSS (we mostly use Tailwind instead) */
</style>
```

You import a component like a class: `import Sidebar from "$lib/components/Sidebar.svelte"` and render it like an HTML tag: `<Sidebar />`. The `$lib` alias points to `src/lib/`.

### Runes — the new reactivity primitives

Svelte 5 replaces the old "everything declared with `let` is reactive" model with explicit **runes** — functions whose name starts with `$`. There are five you'll see in our code:

#### `$state` — reactive values

```svelte
<script lang="ts">
  let count = $state(0);

  function increment() {
    count += 1;
  }
</script>

<button onclick={increment}>Clicked {count} times</button>
```

`$state(0)` declares a reactive value. When you reassign `count`, every place that reads it re-renders. No setters, no hooks — you mutate it directly. For nested objects, `$state` is **deeply reactive** by default (`obj.foo.bar = 1` triggers updates).

You can also call `$state` outside of components (in a `.svelte.ts` file like `app.svelte.ts`) to make a class field reactive:

```ts
class AppStore {
  todos = $state<Todo[]>([]);
  loading = $state(true);
}
```

#### `$derived` — computed values

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<p>{doubled}</p>
```

`$derived(expr)` is recomputed whenever any `$state` it depends on changes. Use it for anything you'd write as a getter.

For more complex derivations you'd write multiple statements for, use `$derived.by(...)`:

```ts
let pastByMonth = $derived.by<MonthGroup[]>(() => {
  const others = app.lists.filter((l) => l.date !== today);
  // ...build groups...
  return [...groups.values()];
});
```

#### `$effect` — side effects

```svelte
<script lang="ts">
  let query = $state("");

  $effect(() => {
    const q = query.trim();
    if (q.length === 0) {
      app.clearSearch();
      return;
    }
    const timer = setTimeout(() => app.runSearch(q), 150);
    return () => clearTimeout(timer);   // cleanup, runs before next $effect
  });
</script>
```

`$effect(fn)` runs `fn` once after mount, then again whenever any `$state` it touches changes. The optional returned function is a cleanup — like `useEffect` in React, but Svelte figures out the dependencies automatically.

Use `$effect` for things like timers, subscriptions, manual DOM measurement, syncing to non-reactive APIs. Do **not** use it for things `$derived` can express.

#### `$props` — component inputs

```svelte
<script lang="ts">
  type Props = { todo: Todo };
  let { todo }: Props = $props();
</script>

<p>{todo.text}</p>
```

`$props()` returns the props object for the component. Destructure it inline. With `bind:` on the parent side, you can also have two-way bound props using `$bindable()`.

#### `$bindable` — opt-in two-way binding

```svelte
<script lang="ts">
  let { value = $bindable() } = $props();
</script>

<input bind:value />
```

The parent can then write `<Child bind:value={something} />` and the prop will update both ways. We use this sparingly — mostly we bind directly to fields on the `AppStore`.

### Markup syntax

#### Interpolation

```svelte
<span>{name}</span>
<span class="text-{color}">…</span>
<img src={url} alt="" />
```

Curly braces for expressions. Anywhere an HTML attribute takes a string, you can put `{expr}` for a value.

#### Conditionals and loops

```svelte
{#if app.loading}
  <p>Loading…</p>
{:else if app.error}
  <p>Error: {app.error}</p>
{:else}
  <ListView />
{/if}

{#each app.todos as todo (todo.id)}
  <TodoRow {todo} />
{/each}
```

The `(todo.id)` part is the **keyed each** — it tells Svelte which item is which between renders. Always provide a key for lists that change.

#### Event handlers

```svelte
<button onclick={handleClick}>Click</button>
<input oninput={(e) => query = e.currentTarget.value} />
```

Plain DOM-style: `onclick`, `oninput`, `onkeydown`, all lowercase. You pass a function, not a string.

#### `bind:` — two-way binding to form inputs

```svelte
<input bind:value={query} />
<input type="checkbox" bind:checked={done} />
```

Less ceremony than React's `value + onChange`.

#### `class:` directive

```svelte
<button class:bg-neutral-300={isSelected(t.id)}>...</button>
```

Adds the class only when the expression is truthy. We use this all over the sidebar to highlight the active list.

#### Transitions

```svelte
<div in:fade={{ duration: 120 }} out:fade={{ duration: 200 }}>...</div>
```

Built-in `fade`, `slide`, `scale`, `fly` from `svelte/transition`. Short and purposeful — the whole app uses sub-200ms transitions.

### Lifecycle: `onMount`

```svelte
<script lang="ts">
  import { onMount } from "svelte";

  onMount(() => {
    app.init();
  });
</script>
```

Runs once when the component first mounts. We use it in `+page.svelte` to kick off `app.init()`.

### SvelteKit (what's the `+page.svelte` / `+layout.svelte` thing?)

We're using **SvelteKit** as a build-tool wrapper around Svelte. For this app we use barely any of it:

- `src/routes/+layout.svelte` — wraps the page (we use it to include global CSS).
- `src/routes/+page.svelte` — the single page of the app.
- `static/` — files served as-is (the logo, favicon).
- `@sveltejs/adapter-static` — outputs a folder of static files (`build/`) that Tauri serves as the frontend.

There's no router, no server-side rendering, no API routes. We're using SvelteKit purely for the dev server (HMR via Vite) and the build pipeline.

### Tailwind v4

Styling is **Tailwind CSS v4** — utility classes inline in the markup. You'll see things like:

```svelte
<button class="rounded-md px-2 py-1.5 text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800">
```

That's not a CSS-in-JS library; the classes are real CSS shipped by Tailwind. The advantage is no class-name churn — read the markup, see the styling. Dark mode is handled by the `dark:` prefix on each class, which Tailwind activates based on `prefers-color-scheme`.

That's everything you need to read our `.svelte` files.

---

## Part 2 — The frontend, file by file

### `package.json` and `vite.config.js`

`package.json` lists the deps (`svelte 5`, `@sveltejs/kit`, `tailwindcss 4`, `@tauri-apps/api`, `markdown-it`) and the scripts. The important ones:

| Command | What it does |
|---|---|
| `pnpm dev` | Start the Vite dev server alone (rarely used) |
| `pnpm tauri dev` | Start Vite + launch the Tauri window |
| `pnpm check` | Run `svelte-check` for type/template errors |
| `pnpm build` | Static-build the frontend to `build/` (Tauri uses this output) |

`vite.config.js` wires the SvelteKit plugin, the Tauri plugin (HMR-aware), and the Tailwind v4 plugin. The dev server listens on port 1420 — that number is hardcoded into `tauri.conf.json` as the `devUrl`.

### `src/routes/+layout.svelte` and `+layout.ts`

Tiny. `+layout.svelte` is essentially `<slot />` plus a CSS import. `+layout.ts` exports `prerender = true` and `ssr = false`, so SvelteKit produces a static site (Tauri doesn't run a server).

### `src/routes/+page.svelte` — the app shell

About 100 lines. It does three things:

1. **Three-pane layout:** Sidebar on the left, the main view in the middle (Welcome, ListView, or WorkflowView depending on `app.view`), Inspector on the right when a todo is selected.
2. **Global keyboard shortcuts:** Listens on `<svelte:window onkeydown={handleKeydown} />` and dispatches `⌘N`, `⌘F`, `⌘E`, `⌘⇧C`, `?`, `Esc`. Carefully checks `isTypingInEditable` so shortcuts don't fire while you're editing text.
3. **Lifecycle:** `onMount(() => app.init())` kicks off the initial load.

The `inspectorTodo = $derived(app.selectedTodo())` and the `{#key inspectorTodo.id}` block ensure the inspector remounts when you select a different todo — that way the form re-initializes cleanly instead of carrying stale state.

### `src/lib/stores/app.svelte.ts` — the store (heart of the frontend)

A single class, `AppStore`, with reactive fields (using `$state`) and async methods. **The `.svelte.ts` extension is what tells the Svelte compiler to process runes inside a TypeScript file**.

A bird's-eye view of the shape:

```ts
class AppStore {
  // Reactive fields
  view = $state<"home" | "list" | "workflow">("home");
  lists = $state<ListSummary[]>([]);
  selected = $state<List | null>(null);
  todos = $state<Todo[]>([]);
  searchQuery = $state("");
  // ...

  // Async methods (each one calls IPC and updates state)
  async init() { /* fetch everything */ }
  async select(id: number) { /* load a list */ }
  async addTodo(text: string) { /* create + push */ }
  async toggle(todo: Todo) { /* flip + patch */ }
  async runSearch(query: string) { /* search + replace */ }
  // ...
}

export const app = new AppStore();
```

Every component imports `app` and reads/writes its fields. The store is the **only** place IPC happens — components never call `invoke()` directly, they call `app.something()`.

The general pattern for any mutation:

```ts
async addTodo(text: string) {
  if (!this.selected) return;
  const created = await createTodo(this.selected.id, text);   // IPC
  this.todos = [...this.todos, created];                       // update local state
  await this.refreshLists();                                   // refresh derived state
}
```

Three steps: call Rust, patch the local mirror, refresh anything aggregated (sidebar counts, stats). That's it.

There's also a small `setFlash(msg)` helper for the toast at the bottom of the screen — used after copy/save operations.

### `src/lib/ipc.ts` — the only file that talks to Rust

Every command Rust exposes has a TypeScript wrapper here:

```ts
export const createTodo = (listId: number, text: string) =>
  invoke<Todo>("create_todo", { listId, text });
```

Two things to remember:

1. The argument names (`listId`, `text`) must **camelCase-match** the Rust function parameters. Tauri auto-converts from camelCase JSON to snake_case Rust args.
2. The TypeScript types at the top of this file (`type Todo = …`) are **redeclarations** of the Rust structs. They aren't generated. If you change a field in `models.rs`, change it here too.

### `src/lib/components/Sidebar.svelte`

The left pane. Three sections: logo, search input, and a scrollable nav.

The nav has two modes, driven by whether the search box is empty:

- **Empty query:** show "Workflows" group + "Today" group + per-month past lists.
- **Has query:** show flat search results, hides everything else.

The grouping is done with `$derived.by(() => …)` blocks that bucket `app.lists` by `date.slice(0, 7)` (`YYYY-MM`) and produce sorted `MonthGroup[]`. The debounced search uses `$effect` with a 150ms `setTimeout`.

`focus()` is exposed as a public function so the page-level `⌘F` handler can call `sidebar?.focus()`. To make that work, the parent does `let sidebar = $state<Sidebar>(); …<Sidebar bind:this={sidebar} />`.

The footer at the bottom shows the stats from `app.stats` (lists, todos, streak) and a "Shortcuts" button that opens the help modal.

### `src/lib/components/ListView.svelte`

The middle pane when a list is selected. Title (editable on click), the quick-add input, the array of `<TodoRow>` components, drag-and-drop reorder, an export menu in the header, and an empty state.

The drag-and-drop uses native HTML5 events (`dragstart`, `dragover`, `drop`). It optimistically reorders `app.todos` in memory via `app.reorderLocal(orderedIds)`, then commits with `app.commitReorder()` once the drop happens — keeping the IPC roundtrip out of the dragover path so the UI stays smooth.

### `src/lib/components/TodoRow.svelte`

One todo. Checkbox, text, chevron-to-open-inspector, edit-on-click. The text becomes a `contenteditable`-style input when you click; Enter commits, Escape cancels.

### `src/lib/components/Inspector.svelte`

The right pane that slides in when you select a todo. Lets you:

- Edit the text.
- Edit notes (saves on blur, not on each keystroke).
- Add and remove tags. Tag autocomplete uses `app.allTags`.

The `{#key inspectorTodo.id}` wrapper in the page ensures this component is remounted when the selection changes, so its internal `$state` resets cleanly.

### `src/lib/components/WorkflowView.svelte`

The middle pane when a workflow is selected. Title, description, ordered steps. Same drag-and-drop pattern as `ListView`, same edit-in-place behavior.

### `src/lib/components/Welcome.svelte`

The middle pane when `app.view === "home"`. Shows total lists/todos, streak, and a GitHub-style activity grid built from `app.dailyStats`.

### `src/lib/components/HelpModal.svelte`

A keyboard-shortcut cheat sheet. Toggled by `?` (when not typing in a field) or by clicking "Shortcuts" in the sidebar footer. Closes on `Esc`.

### `src/app.css`

Tailwind `@import` directives plus a tiny number of custom theme tokens / font settings. Most styling lives in the markup as utility classes.

---

## Conventions

A few rules to follow when adding to the frontend:

1. **The store is the only place IPC happens.** Components import `app` and call methods like `app.addTodo(...)`. They never `invoke()` directly. If a component looks like it needs to, add a method on the store instead.

2. **Reactive fields use `$state`, computed fields use `$derived`.** Don't use `$effect` to compute a value — use it for side effects (timers, subscriptions, syncing to non-reactive APIs).

3. **After every mutation, refresh.** Following any IPC call that changes state, refresh whatever depends on it (`refreshLists`, `refreshWorkflows`, `refreshSelectedTags`). It's cheaper than caching, and it keeps the UI honest.

4. **Keep types in sync with `ipc.ts`.** When you add a field on a Rust model, add it to the matching TypeScript type. There is no codegen.

5. **Always key your `{#each}` loops.** `{#each items as item (item.id)}`. Forgetting the key causes subtle DOM-reuse bugs.

6. **Optimistic mutations are fine.** If a mutation will obviously succeed, update local state first and revert if the IPC call fails. We do this for drag-reorder.

7. **Tailwind first, custom CSS only when you can't.** If you find yourself reaching for `<style>`, ask whether a Tailwind utility would do.

8. **`pnpm check` before pushing.** It catches missing types, broken bindings, and unused imports.

---

## Further reading

- [Svelte 5 docs](https://svelte.dev/docs/svelte) — start with "Runes" and "Component fundamentals".
- [Svelte tutorial](https://svelte.dev/tutorial) — interactive, 30 minutes, worth doing.
- [SvelteKit docs](https://svelte.dev/docs/kit) — only the "Routing" and "Adapters" sections apply to us.
- [Tailwind v4 docs](https://tailwindcss.com/) — utility reference.
- [Tauri 2 JS API](https://v2.tauri.app/reference/javascript/api/) — the `invoke`, `dialog`, and `opener` functions we use.
