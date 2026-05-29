// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }

  // Injected by Vite `define` (see vite.config.js) — the git commit the
  // bundle was built from, e.g. "a1b2c3d" or "a1b2c3d-dirty".
  const __APP_COMMIT__: string;
  // Full commit message (subject + body) of the build's HEAD commit.
  const __APP_COMMIT_MESSAGE__: string;
  // Committer ISO date of the build's HEAD commit.
  const __APP_COMMIT_DATE__: string;
}

export {};
