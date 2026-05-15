export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStored(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

class ThemeStore {
  preference = $state<Theme>("system");
  // Resolved (effective) theme — what's actually applied right now.
  resolved = $state<"light" | "dark">("light");

  init() {
    if (typeof document === "undefined") return;
    this.preference = readStored();
    this.apply();

    // Re-apply when the system preference flips, but only if we're following
    // the system. Each user-driven preference change goes through set().
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", () => {
      if (this.preference === "system") this.apply();
    });
  }

  set(next: Theme) {
    this.preference = next;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, next);
    }
    this.apply();
  }

  cycle() {
    const order: Theme[] = ["system", "light", "dark"];
    const idx = order.indexOf(this.preference);
    this.set(order[(idx + 1) % order.length]);
  }

  private apply() {
    if (typeof document === "undefined") return;
    const isDark =
      this.preference === "dark" ||
      (this.preference === "system" && systemPrefersDark());
    document.documentElement.classList.toggle("dark", isDark);
    this.resolved = isDark ? "dark" : "light";
  }
}

export const theme = new ThemeStore();
