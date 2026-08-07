# Add per-IP rate limiting + audit log

Adds a rate limiter in front of the sync API and records every write to a new
`audit_log` table. Backend-only — no UI changes.

> [!NOTE]
> Paste this whole file into a new note in Alexandria and click outside to
> render. Hover any block for a **📷** button (copy PNG). Blocks with motion
> (`pulse` / `animated` / flow / compare) also show a **GIF** button — save the
> loop and drag it into the PR.

## At a glance

```stats
heading: At a glance
Lines: +312 / −47
Files: 4
Migrations: 1
Tests: 131 ✓ pulse
```

```spec violet
heading: Migration plan
Risk: **Low** — additive table, no backfill
Migration: `0028_audit_log.sql`
Rollback: revert the migration
Touches: `commands/sync` · `db/audit` · limiter
```

## What changed

The tree — new files pulse so a reviewer sees the shape of the change:

```tree Backend changes
src-tauri/src/
  commands/
    rate_limit.rs - new pulse
    sync.rs - edit
  db/
    audit.rs - new pulse
  migrations/
    0028_audit_log.sql - new
```

```files
A src-tauri/src/commands/rate_limit.rs — Token-bucket limiter, keyed per IP. `check()` returns `429` when over budget.
A src-tauri/src/db/audit.rs — `record(db, ip, action)` — one indexed insert per write.
M src-tauri/src/commands/sync.rs — Calls the limiter, then records the sync in the **audit log**.
A src-tauri/migrations/0028_audit_log.sql — New `audit_log(id, ip, action, created_at)` table.
```

## How a request flows now

```flow Request lifecycle
Request: ip, token
RateLimiter: new · 60/min
Auth: verify bearer
Handler: sync(since)
audit::record: new
sqlx: batched read
SQLite: todos.db
```

## The query got batched, too

```compare Batched read
-- N+1: one query per list
SELECT * FROM todos WHERE list_id = ?;
---
-- single batched read
SELECT id, title, done FROM todos
WHERE list_id IN (?, ?, ?) AND archived = 0;
```

## How to test

```terminal zsh — src-tauri animated
$ sqlx migrate run
Applied 0028_audit_log (2.14ms)
$ cargo test --lib
   Running 131 tests
test result: ok. 131 passed; 0 failed
```

## Review notes

### > Implementation details

The limiter is a token bucket in `AppState` (`Mutex<HashMap<IpAddr, Bucket>>`),
refilled lazily on `check()`. No background task.

```flow check() path
check(ip): refill
compare budget
allow / 429
```

### > Rollout

Additive only — the migration creates a table and the limiter defaults to a
generous budget. Safe to ship dark; tighten the budget in a follow-up.

## Impact

| Area        | Change                                   |
| ----------- | ---------------------------------------- |
| sync API    | +1 limiter check, +1 audit insert / write |
| DB          | new `audit_log` table (indexed on `ip`)  |
| Clients     | may now see `429` — must back off         |

> [!WARNING]
> Clients without retry/back-off will fail hard once the budget tightens.

---

_Written in Alexandria · powered markdown_
