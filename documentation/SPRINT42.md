# Sprint 42 — Camera check-ins ("lolcommits for todo lists")

## Why

Inspired by [lolcommits](https://lolcommits.github.io/) (a webcam selfie per
git commit): when the user creates a **today's list**, snap a ~1-second
webcam **GIF** as a memory of the moment, and browse them in a gallery.
Purely for fun / personal memory.

## Privacy (baked in, per the discussion)

- **Opt-in, default OFF.** Nothing touches the camera until the user flips
  the toggle in the Check-ins tab. Persisted in `localStorage`
  (`checkinsEnabled`, in the theme store).
- **Local only** — the GIF is saved to the app's images dir; never
  uploaded. A one-line note says so next to the toggle.
- **Visible capture indicator** — a red "📸 Capturing check-in…" pill
  (top-right) while the camera is on; never silent.
- **Delete** any check-in (removes the row *and* the GIF file from disk).

## How the capture works

`$lib/checkin.ts` `captureCheckinGif()` (webview):
`getUserMedia({video})` → hidden `<video>` → draw ~10 frames (mirrored,
downscaled to 240×180, ~100ms apart) onto a `<canvas>` → encode with
**gifenc** (new dep — tiny, dependency-free, offline/CSP-safe) → returns
GIF bytes. The stream tracks are stopped in a `finally`.

Trigger: `app.newList()` (the deliberate "create today's list" path — NOT
the focus/pull auto-create paths) calls `maybeCaptureCheckin(listId)`,
fire-and-forget so it never blocks list creation. If the camera is
unavailable/denied, it flashes "Check-in skipped" and moves on.

Storage: bytes → `save_image(bytes, "gif")` (reuses existing infra) →
absolute path → `add_checkin(path, listId)`. The gallery shows them via
`convertFileSrc`.

## macOS camera permission

Added `src-tauri/Info.plist` with **`NSCameraUsageDescription`** — macOS
shows this string on the first camera prompt. **This is the one thing that
needs a real-app test** (`pnpm tauri dev`): confirm the OS prompt appears
and a frame is captured. If WKWebView refuses `getUserMedia`, the fallback
would be Rust-side capture (`nokhwa`) — a bigger lift, not built here.

## Data / backend

- Migration `0023_checkins.sql`: `checkins(id, list_id →lists ON DELETE SET
  NULL, path, created_at)` — a check-in survives its list being deleted.
- `commands/checkins.rs`: `add_checkin`, `list_checkins`, `delete_checkin`
  (also `fs::remove_file`s the GIF). Model `Checkin`. 2 tests
  (roundtrip; check-in survives list deletion → `list_id` NULLed).

## Frontend

- `ipc.ts`: `Checkin` type + `saveImageBytes` (raw path), `checkinSrc`,
  `addCheckin`, `listCheckins`, `deleteCheckin`.
- Store: `checkins` / `capturingCheckin` state; `refreshCheckins`,
  `deleteCheckin`, `maybeCaptureCheckin`. `theme.checkinsEnabled` +
  `setCheckinsEnabled`.
- Gallery: a **"Check-ins" tab in Activity** (grid of GIFs by date, delete
  on hover) with the opt-in toggle + privacy note at the top. `+page.svelte`
  shows the capture indicator.
- **List view miniature** (follow-up): `ListView` shows a small looping GIF
  thumbnail in the header when the open list has check-in(s) — `app.checkins
  .filter(c => c.listId === selected.id)`. Requires `app.checkins` loaded
  app-wide, so `init()` now loads it (not just the Activity tab).
- **Shared `CheckinLightbox.svelte`** (follow-up): a click-to-enlarge overlay
  (big GIF + date + delete + a thumbnail strip when >1; Esc / ←→ / backdrop
  to navigate/close; z-[110] so it sits above Focus mode). Used by ListView
  (miniature → lightbox), ActivityView (each gallery GIF is clickable), and
  FocusMode (a today's-list check-in miniature top-left → lightbox; Focus's
  own Esc handler defers to the lightbox when it's open).
- Note: each `newList` captures a GIF, so re-creating today's list adds a
  *second* check-in to the same `list_id` — surfaced via the count badge +
  the lightbox's thumbnail strip. A distinct new list gets its own.

## Verification

`cargo test --lib` 102 pass (incl. 2 check-in tests; migration `0023`
applies). `svelte-check` + `pnpm build` clean. **Camera capture itself is
UNTESTED from here** — needs the user's `pnpm tauri dev` run.

## Not doing

- No captions, no per-list-type triggering (only today's-list creation),
  no video/photo formats, no retake/preview, no front/back selection.
