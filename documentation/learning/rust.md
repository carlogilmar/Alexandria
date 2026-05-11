# Rust fundamentals + the Rust backend

This document is for developers who have never written Rust. By the end you should be able to read every file under `src-tauri/src/` and know what it does and why.

It has two halves:
1. **Rust the language** — just enough to read this codebase.
2. **The Rust backend** — file-by-file tour, plus the conventions we follow.

---

## Part 1 — Rust, the absolute minimum

### Why Rust for this app?

Rust gives us four things that matter for a local-first desktop app:

1. **Memory safety without a garbage collector.** No leaks, no use-after-free, no GC pauses. The app stays snappy even on an old MacBook.
2. **Tiny binary, low memory.** A release build of the `.app` is single-digit megabytes; idle RAM is a few dozen MB. An Electron equivalent would be 5–10× that.
3. **An honest type system.** If a value can be missing, the type says `Option<T>`. If a call can fail, it returns `Result<T, E>`. We never hit a "value is undefined" at runtime — the compiler refuses to build code that ignores either case.
4. **`sqlx` with compile-time checked queries.** Your SQL is verified against the schema while you compile. Bad column names fail to build instead of failing in production.

The trade-off is a steeper learning curve and longer compile times. For a small app like this, those are worth paying once.

### The minimum syntax you need

#### Variables

```rust
let x = 5;                 // immutable
let mut y = 5;             // mutable
let name: String = "hi".into();   // explicit type
```

Everything is **immutable by default**. You opt into mutation with `mut`. This sounds annoying for ten minutes and then you stop noticing.

#### Functions

```rust
fn add(a: i64, b: i64) -> i64 {
    a + b               // no semicolon = this is the return value
}
```

The last expression in a block is the return value. `return` exists but is rarely used.

#### Structs

A struct is a record / data class:

```rust
pub struct Todo {
    pub id: i64,
    pub text: String,
    pub completed: bool,
}
```

`pub` makes a field visible from other modules. No `pub` = private.

#### Enums

Enums in Rust are *tagged unions* — each variant can carry data:

```rust
enum AppError {
    Sqlx(sqlx::Error),     // wraps a database error
    BadInput(String),      // wraps a message
    NotFound(String),
}
```

`Option<T>` and `Result<T, E>` are just enums:

```rust
enum Option<T>     { Some(T), None }
enum Result<T, E>  { Ok(T),   Err(E) }
```

`Option<String>` is "a String that might be missing." `Result<Todo, AppError>` is "either a Todo on success, or an AppError on failure." You see these everywhere.

#### The `?` operator

Reading any command file you'll see lines ending in `?`:

```rust
let pool = open_pool(&path).await?;
```

`?` means: "if this is `Err(...)`, return the error from the current function; otherwise unwrap the `Ok` value." It is the entire reason Rust error handling stays readable. The TypeScript equivalent would be:

```ts
const result = await openPool(path);
if (result.kind === "err") return result;
const pool = result.value;
```

`?` collapses that to one character.

#### Derive macros

Above many structs you'll see:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
```

These are **derive macros** — code generators that add trait implementations at compile time:
- `Debug` — printable with `{:?}`
- `Clone` — `.clone()` makes a copy
- `Serialize` / `Deserialize` — can be turned into / from JSON (via `serde`)
- `FromRow` — can be built from a database row (via `sqlx`)

You don't write the implementations; the compiler generates them.

#### Attributes

`#[tauri::command]` above a function is an **attribute** — it tells the Tauri macro to wrap this function so it can be invoked from JavaScript. `#[cfg(test)]` says "only compile this when running tests." Attributes look like decorators in Python but happen at compile time, not runtime.

#### `async` / `await`

Rust has `async/await` that looks similar to TypeScript:

```rust
pub async fn list_today(state: State<'_, AppState>) -> AppResult<List> {
    today(&state.pool).await
}
```

`async fn` returns a `Future`. `.await` yields until it resolves. The runtime that polls those futures is **Tokio**, which we depend on via `sqlx` and Tauri.

#### Borrowing — `&` and `&mut`

```rust
fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<List>
```

`&SqlitePool` is "a *reference* to a pool" — we don't take ownership, we borrow it. `&str` is "a borrowed string slice" (not a heap-allocated `String`). The compiler tracks who owns what, so you can't accidentally use a value after it's been freed.

This is the famously-tricky part of Rust. The good news: in a CRUD app like this, the patterns are stable, and you can mostly read code by treating `&T` as "T, but cheap to pass." Look up "ownership and borrowing" when you need to write something new.

#### Modules

Files under `src/` are modules. `mod foo;` in a parent file pulls in `foo.rs` (or `foo/mod.rs`). Visibility is controlled by `pub`. Our backend lays out as:

```
src/
├── lib.rs               // declares modules + Tauri wiring
├── error.rs             // AppError, AppResult
├── markdown.rs          // export rendering
├── db/
│   ├── mod.rs           // pool, migrations
│   └── models.rs        // data structs
└── commands/
    ├── mod.rs           // declares submodules + AppState
    ├── lists.rs
    ├── todos.rs
    ├── tags.rs
    ├── search.rs
    ├── export.rs
    └── workflows.rs
```

`lib.rs` says `mod commands; mod db; …`. `commands/mod.rs` says `pub mod lists; pub mod todos; …`. That's how every file gets wired up.

That's it for syntax. The rest you can learn from the code.

---

## Part 2 — The Rust backend, file by file

### `src-tauri/Cargo.toml`

The Rust equivalent of `package.json`. Three things to know:

- `[dependencies]` lists the crates we use: `tauri`, `sqlx`, `serde`, `tokio`, `thiserror`, `dirs`.
- `crate-type = ["staticlib", "cdylib", "rlib"]` makes the crate buildable as both a library (linked into the Tauri runtime) and a binary.
- `sqlx` features: we only pull in `runtime-tokio + sqlite + macros + migrate`. Each feature you don't enable is code you don't compile, which keeps build times sane.

### `src-tauri/src/main.rs`

Two lines. It exists because Cargo wants a binary entry point, but all the real work is in `lib.rs::run()`. That separation lets us also publish the library for tests.

### `src-tauri/src/lib.rs` — the wiring

The most important file. Walk through it:

```rust
mod commands;
mod db;
mod error;
mod markdown;
```

Declares the four top-level modules.

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = db::default_db_path()?;
            let pool = tauri::async_runtime::block_on(db::open_pool(&path))?;
            app.manage(AppState { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lists::list_today,
            // … every command, by name
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

What it does:

1. Adds plugins (file dialog, system "open" command).
2. **`setup`** runs once at startup: it resolves the database path, opens the SQLite pool, runs migrations (inside `open_pool`), and stores the pool in Tauri's managed state via `app.manage(AppState { pool })`. From now on, any command can ask for `State<'_, AppState>` and Tauri injects the pool.
3. **`invoke_handler`** registers every command. Anything not in this array cannot be called from the frontend, even if it's marked `#[tauri::command]`. This is the most common reason a new command "doesn't work."
4. **`run`** hands control to the Tauri event loop, which opens the window and starts processing IPC.

### `src-tauri/src/error.rs`

Defines a single error type for the whole crate:

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]    Sqlx(#[from] sqlx::Error),
    #[error("migration error: {0}")]   Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("io error: {0}")]          Io(#[from] std::io::Error),
    #[error("invalid input: {0}")]     BadInput(String),
    #[error("not found: {0}")]         NotFound(String),
}
```

Two crate idioms here:

- **`thiserror`** generates the `Display` and `Error` trait impls from the `#[error("…")]` attributes.
- **`#[from]`** generates `impl From<sqlx::Error> for AppError` etc., which makes `?` automatically convert any `sqlx::Error` into an `AppError::Sqlx`. That's why our commands can write `pool.fetch_one(…).await?` and the error type "just works."

The manual `Serialize` impl at the bottom turns the error into a plain JSON string when it crosses the IPC boundary — the frontend never has to decode an enum variant, just gets `"not found: list 42"`.

`pub type AppResult<T> = Result<T, AppError>` is a one-line convenience so we can write `AppResult<List>` instead of `Result<List, AppError>` everywhere.

### `src-tauri/src/db/mod.rs`

Opens the SQLite connection pool. The interesting bits:

```rust
let opts = SqliteConnectOptions::new()
    .filename(path)
    .create_if_missing(true)
    .foreign_keys(true);
```

`foreign_keys(true)` is **mandatory in SQLite** — they're off by default, which silently breaks `ON DELETE CASCADE`. We turn them on at connection time.

```rust
sqlx::migrate!("./migrations").run(&pool).await?;
```

The `migrate!` macro reads every `*.sql` file in `migrations/` at compile time and embeds them in the binary. At runtime it applies the ones that haven't run yet, tracked in an internal `_sqlx_migrations` table.

There's also a `#[cfg(test)] pub async fn test_pool()` that returns an in-memory database — that's what the unit tests use.

### `src-tauri/src/db/models.rs`

Plain Rust structs that mirror the database tables. Each one carries three pieces of magic:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: i64,
    pub list_id: i64,
    pub text: String,
    pub notes: Option<String>,
    pub completed: bool,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}
```

- `FromRow` lets `sqlx` build the struct directly from a `SELECT * FROM todos` query.
- `Serialize / Deserialize` lets `serde` turn it into / from JSON.
- `#[serde(rename_all = "camelCase")]` translates the snake_case Rust fields to camelCase JSON, so the TypeScript side stays idiomatic.

`Option<String>` is how nullable columns show up — `NULL` in SQLite becomes `None` in Rust.

### `src-tauri/src/commands/mod.rs`

Three lines you can almost ignore:

```rust
pub mod export; pub mod lists; pub mod search; pub mod tags; pub mod todos; pub mod workflows;

pub struct AppState { pub pool: SqlitePool }
```

`AppState` is what `lib.rs` stuffs into Tauri's managed state. Every command extracts the pool via `State<'_, AppState>`.

### `src-tauri/src/commands/lists.rs` (and the others)

Each command module follows the **same shape** — once you understand one, you understand them all. Using `lists.rs` as the canonical example:

**1. Pure functions that take a `&SqlitePool`:**

```rust
pub(crate) async fn create(pool: &SqlitePool, title: &str, date: &str) -> AppResult<List> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, List>(
        "INSERT INTO lists (title, date, archived, created_at, updated_at)
         VALUES (?1, ?2, 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .bind(date)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}
```

This is the actual logic. It takes a pool, validates input, runs SQL, returns the result. Notice:

- `?1`, `?2` are positional parameter placeholders (SQLite syntax). `.bind(…)` fills them in order. We never use string interpolation — that's how SQL injection happens.
- `query_as::<_, List>(…)` parses the result row into a `List` struct using the `FromRow` derive.
- `.fetch_one(pool)` runs the query expecting exactly one row. `.fetch_optional(pool)` returns `Option<T>`; `.fetch_all(pool)` returns `Vec<T>`.
- `.map_err(Into::into)` converts the `sqlx::Error` into our `AppError` via the `#[from]` implementation. (Often we just write `?` and rely on the same conversion.)
- The query uses `RETURNING *` (SQLite 3.35+) to give us back the inserted row in one round-trip.

**2. A thin `#[tauri::command]` wrapper:**

```rust
#[tauri::command]
pub async fn create_list(
    state: State<'_, AppState>,
    title: String,
    date: String,
) -> AppResult<List> {
    create(&state.pool, &title, &date).await
}
```

This is the function the frontend can `invoke()`. It does no work — it just unpacks `state`, calls the pure function, and returns the result.

**Why split them?** Because the pure function is **testable** without spinning up Tauri:

```rust
#[tokio::test]
async fn create_and_fetch() {
    let pool = test_pool().await;
    let list = create(&pool, "Monday plan", "2026-05-10").await.unwrap();
    assert_eq!(list.title, "Monday plan");
}
```

This is the dominant pattern in the whole backend. Look at `todos.rs`, `tags.rs`, `workflows.rs` — same structure.

### `src-tauri/src/commands/search.rs`

A little more interesting:

- Uses `LIKE ?` with escaped wildcards so a literal `%` in the query doesn't accidentally match everything. There are explicit tests for that.
- `get_daily_stats` aggregates by date for the dotted activity grid on the welcome page.
- `get_stats` computes the day-streak by counting back from today.

### `src-tauri/src/commands/workflows.rs`

Workflows are reusable templates of steps. Same shape as todos — a parent record plus an ordered child collection — but with no date and no completion flag. Steps support an optional `parent_step_id`, which lets us nest steps. Reordering goes through a single transaction so positions never overlap.

### `src-tauri/src/markdown.rs`

Renders a single list, or a date range of lists, to Markdown. Pure functions — no IO, no IPC. They take Rust structs in and produce a `String` out. Tested directly.

### `src-tauri/migrations/0001_initial.sql`, `0002_workflows.sql`

The schema, versioned. Migrations are append-only: when you change the schema, add a new file with the next number prefix. Editing an applied migration breaks the world (sqlx remembers their hashes).

---

## Conventions

A few things to internalize before contributing:

1. **Two-layer command files.** Pure functions take `&SqlitePool` and are unit-tested with `test_pool()`. The `#[tauri::command]` wrapper does nothing but pass `&state.pool` through.
2. **Always validate at the top.** `BadInput` is returned for empty strings, negative IDs, etc. before any SQL runs.
3. **Use `RETURNING *`.** Don't insert-then-select; do it in one query and parse into the model.
4. **Cascades are real.** `todos.list_id REFERENCES lists(id) ON DELETE CASCADE`. Verified by the `deleting_list_cascades_to_todos` test.
5. **Reorder = transaction.** When rewriting `position` columns, wrap the loop in `pool.begin().await?` / `tx.commit().await?` so the table never lands in a half-updated state.
6. **Every new command must be registered in `lib.rs`.** If the frontend gets "command not found," that's the reason 90% of the time.
7. **Run the tests.** `cargo test --manifest-path src-tauri/Cargo.toml`. They run in well under a second using in-memory SQLite.

---

## Further reading

- [The Rust Book](https://doc.rust-lang.org/book/) — official and free. Read chapters 3, 4, 5, 6, 9, 10 to cover everything you'll see in this codebase.
- [Rust by Example](https://doc.rust-lang.org/rust-by-example/) — short executable snippets.
- [Tauri 2 docs](https://v2.tauri.app/) — focus on Commands and State Management.
- [sqlx README](https://github.com/launchbadge/sqlx) — query macros and migrations.
- [serde docs](https://serde.rs/) — the derive attributes you'll see throughout `models.rs`.
