import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// Capture the git commit the bundle was built from, so the running app can
// show which local version is loaded. Resolved at dev-server start / build
// time. A "-dirty" suffix flags uncommitted working-tree changes.
function gitInfo() {
  try {
    const hash = execSync("git rev-parse --short HEAD").toString().trim();
    const dirty =
      execSync("git status --porcelain").toString().trim().length > 0;
    // Full message (subject + body) and committer ISO date of HEAD, so the UI
    // can show "what was in this build" when the hash is clicked.
    const message = execSync("git show -s --format=%B HEAD").toString().trim();
    const date = execSync("git show -s --format=%cI HEAD").toString().trim();
    return { hash: dirty ? `${hash}-dirty` : hash, message, date };
  } catch {
    return { hash: "unknown", message: "", date: "" };
  }
}

const git = gitInfo();

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [tailwindcss(), sveltekit()],

  define: {
    __APP_COMMIT__: JSON.stringify(git.hash),
    __APP_COMMIT_MESSAGE__: JSON.stringify(git.message),
    __APP_COMMIT_DATE__: JSON.stringify(git.date),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
