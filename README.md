# AlertMediaBigPicture

A native macOS TODO app. Lists per day, drag-to-reorder, notes + tags, full-text search, day-streak stats, and Markdown export. Built with Rust + Tauri 2 + Svelte 5 + Tailwind v4. Stores everything locally in SQLite — no accounts, no cloud, fully offline.

See `REQUIREMENTS.md` for the full spec.

---

## Requirements

Versions are pinned in `.tool-versions`. If you use [asdf](https://asdf-vm.com/), they install with `asdf install` in this directory.

| Tool | Version |
|---|---|
| Rust | 1.95.0 |
| Node | 25.9.0 |
| pnpm | 9.15.0 |

You also need Xcode Command Line Tools (`xcode-select --install`) so the macOS bundler can find a linker.

---

## First-time setup

```bash
# Install pinned toolchains (skip if you already have them)
asdf install

# Install JS dependencies
pnpm install
```

The Rust side fetches its dependencies on the first `cargo` / `tauri` invocation — no separate step.

---

## Run in development

```bash
pnpm tauri dev
```

This starts Vite at `localhost:1420` and launches a Tauri window pointing at it. The first launch compiles the Rust side (~30 s); after that it's hot-reload for the frontend and incremental for the backend.

The local database lives at:

```
~/Library/Application Support/com.alertmedia.bigpicture/todos.db
```

Migrations run automatically on startup. Delete that file to start fresh.

---

## Build a production `.app`

```bash
pnpm tauri build
# or, to skip the DMG step (which sometimes fails and isn't required for personal use):
pnpm tauri build --bundles app
```

The resulting bundle is at:

```
src-tauri/target/release/bundle/macos/AlertMediaBigPicture.app
```

Drag it into `/Applications`. The build is unsigned, so the first time you open it macOS will refuse to launch it by double-click — right-click the app and choose **Open**, then confirm the security prompt once. Subsequent launches open normally.

---

## Using the app

The app opens to today's list (auto-created on first open of each day). Past lists stay in the sidebar, grouped by month.

**Adding todos** — type in the input at the top of the main pane and press Enter.

**Editing** — click a todo's text to edit in place; Enter commits, Escape cancels.

**Reordering** — drag a row; drop anywhere in the list.

**Notes and tags** — click the chevron (`>`) on the right side of a row to open the inspector. Type notes (saves on blur). Add tags with the input at the bottom — Enter creates a new tag if it doesn't exist and links it.

**Searching** — type in the search box at the top of the sidebar. It matches text and notes across every list. Click a result to jump there.

**Renaming a list** — click the list title in the main pane.

**Multiple lists per day** — press `⌘N` or click `+` in the sidebar. They stack under the "Today" header.

**Deleting a list** — click the trash icon in the list header. The list is archived (soft-deleted); the data isn't removed from the database.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘N` | New list (date = today) |
| `⌘F` | Focus search |
| `⌘E` | Save current list as `.md` |
| `⌘⇧C` | Copy current list to clipboard as Markdown |
| `Esc` | Close inspector |

Inside an editable field, `Enter` commits and `Esc` cancels.

---

## Markdown export

Click **Export…** in the list header for a menu, or use the shortcuts above. Four range presets are available:

- Current list (copy or save)
- This week (last 7 days through today)
- This month (1st of current month through today)
- Everything

Range exports include a table of contents with anchors. Format details live in `REQUIREMENTS.md` §7.

---

## Tests

The Rust side has 38 unit tests covering CRUD, cascade deletes, Markdown rendering, search (including LIKE-wildcard escaping), and streak computation. They use in-memory SQLite, so they're fast and isolated.

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Frontend type check:

```bash
pnpm check
```

---

## Project layout

```
.
├── REQUIREMENTS.md            spec & design notes
├── .tool-versions             asdf-pinned toolchain
├── package.json               frontend deps + scripts
├── src/                       SvelteKit frontend
│   ├── app.css                global styles + theme tokens
│   ├── app.html
│   ├── routes/+page.svelte    three-pane shell + global shortcuts
│   └── lib/
│       ├── ipc.ts             typed wrapper over Tauri invoke()
│       ├── stores/
│       │   └── app.svelte.ts  AppStore (Svelte 5 class with runes)
│       └── components/
│           ├── Sidebar.svelte
│           ├── ListView.svelte
│           ├── TodoRow.svelte
│           └── Inspector.svelte
└── src-tauri/                 Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json        window config + vibrancy
    ├── capabilities/
    │   └── default.json       permissions for plugins
    ├── migrations/
    │   └── 0001_initial.sql
    └── src/
        ├── main.rs
        ├── lib.rs             pool init + command registry
        ├── error.rs           AppError (serializable across IPC)
        ├── markdown.rs        single-list + range renderers
        ├── db/
        │   ├── mod.rs         pool, migrations, test helper
        │   └── models.rs
        └── commands/
            ├── lists.rs
            ├── todos.rs
            ├── tags.rs
            ├── search.rs      search + stats
            └── export.rs      md export + file save
```
