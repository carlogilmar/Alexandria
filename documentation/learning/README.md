# Learning · AlertMediaBigPicture

Welcome. This folder is the **knowledge base for new contributors**. It's aimed at developers who are joining the project without prior experience in Rust or Svelte. If you can read TypeScript and SQL, you have enough to follow along.

## What's here

| Document | What it covers | When to read |
|---|---|---|
| [architecture.md](./architecture.md) | The whole-app picture: how the Rust backend and Svelte frontend talk to each other, where state lives, how a feature flows end-to-end | **Read this first.** ~15 minutes. |
| [rust.md](./rust.md) | Rust language essentials (just enough to read this codebase) + a file-by-file tour of `src-tauri/` + why Rust suits this app | Before touching `src-tauri/`. ~25 minutes. |
| [svelte.md](./svelte.md) | Svelte 5 essentials with runes (`$state`, `$derived`, `$effect`, `$props`) + a file-by-file tour of `src/` | Before touching `src/`. ~20 minutes. |

## Recommended path for a new contributor

1. **Day 1 morning — read `architecture.md`.** You should be able to answer: where is the database file? What is the IPC bridge? What are the steps to add a new feature?
2. **Day 1 afternoon — clone, install, run.** Follow the top-level `README.md`. Get `pnpm tauri dev` working. Click around the app while it's open in dev mode — watch how state changes.
3. **Day 2 — read whichever of `rust.md` or `svelte.md` matches your first task.** Both are written to stand alone; you don't need to read the other one until you need to.
4. **First PR — find the smallest thing in the relevant sprint doc (`documentation/SPRINT*.md`) and add it.** The 8-step recipe at the bottom of `architecture.md` is the template.

## What's *not* here

- The product spec — see `REQUIREMENTS.md` at the repo root.
- Setup, dev-loop, and build instructions — see `README.md` at the repo root.
- Per-sprint feature plans — see `documentation/SPRINT1.md` … `SPRINT5.MD`.

If you find something missing from this knowledge base while onboarding, add it. The whole point is that the next person doesn't have to ask the same question.
