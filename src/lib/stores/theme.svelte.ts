export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "theme";
const TINT_KEY = "sidebarTint";

// Selectable sidebar tints. `hue` null = neutral grey. `dark: true` = a solid
// dark surface (the sidebar flips to light text — see ThemeStore.isSidebarDark
// + Sidebar.svelte). Light/translucent tints adapt to light/dark in apply();
// dark tints look the same in both modes. Order = swatch order in the UI.
export type Tint = {
  name: string;
  label: string;
  hue: number | null;
  dark?: boolean;
  // Animated gradient surfaces (Sprint 23): `aurora` lists the blob colors
  // the Sidebar drifts over `base` (a deep dark backdrop), plus a noise
  // grain overlay. Aurora tints are always dark surfaces (light text).
  aurora?: string[];
  base?: string;
};

export const SIDEBAR_TINTS: Tint[] = [
  { name: "neutral", label: "Neutral", hue: null },
  { name: "slate", label: "Slate", hue: 215 },
  { name: "blue", label: "Blue", hue: 217 },
  { name: "violet", label: "Violet", hue: 265 },
  { name: "emerald", label: "Emerald", hue: 155 },
  { name: "amber", label: "Amber", hue: 38 },
  { name: "rose", label: "Rose", hue: 350 },
  // Dark surfaces (light text).
  { name: "ink", label: "Ink (black)", hue: null, dark: true },
  { name: "graphite", label: "Graphite", hue: 220, dark: true },
  { name: "navy", label: "Navy", hue: 222, dark: true },
  { name: "forest", label: "Forest", hue: 155, dark: true },
  { name: "wine", label: "Wine", hue: 345, dark: true },
  // Animated aurora gradients (dark, light text).
  {
    name: "aurora",
    label: "Aurora (animated)",
    hue: null,
    dark: true,
    base: "hsl(228 42% 9%)",
    aurora: ["#2dd4bf", "#4ade80", "#818cf8"],
  },
  {
    name: "nebula",
    label: "Nebula (animated)",
    hue: null,
    dark: true,
    base: "hsl(262 45% 10%)",
    aurora: ["#e879f9", "#818cf8", "#38bdf8"],
  },
  {
    name: "ember",
    label: "Ember (animated)",
    hue: null,
    dark: true,
    base: "hsl(340 45% 9%)",
    aurora: ["#fb923c", "#f472b6", "#a78bfa"],
  },
];

function findTint(name: string): Tint | undefined {
  return SIDEBAR_TINTS.find((t) => t.name === name);
}

function readStoredTint(): string {
  if (typeof localStorage === "undefined") return "neutral";
  const v = localStorage.getItem(TINT_KEY);
  return v && SIDEBAR_TINTS.some((t) => t.name === v) ? v : "neutral";
}

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
  // Selectable sidebar background tint (see SIDEBAR_TINTS).
  sidebarTint = $state<string>("neutral");

  init() {
    if (typeof document === "undefined") return;
    this.preference = readStored();
    this.sidebarTint = readStoredTint();
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

  setSidebarTint(name: string) {
    this.sidebarTint = name;
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TINT_KEY, name);
    }
    this.applyTint();
  }

  private apply() {
    if (typeof document === "undefined") return;
    const isDark =
      this.preference === "dark" ||
      (this.preference === "system" && systemPrefersDark());
    document.documentElement.classList.toggle("dark", isDark);
    this.resolved = isDark ? "dark" : "light";
    // The tint background depends on light/dark, so recompute it here too.
    this.applyTint();
  }

  // True when the selected tint is a dark surface — the Sidebar then renders its
  // contents with light text (adds the `dark` class locally) regardless of the
  // app's light/dark mode.
  get isSidebarDark(): boolean {
    return findTint(this.sidebarTint)?.dark ?? false;
  }

  // Blob colors of the active aurora tint, or null for flat tints. The
  // Sidebar renders the animated layer from this.
  get sidebarAurora(): string[] | null {
    return findTint(this.sidebarTint)?.aurora ?? null;
  }

  // Write the sidebar tint as CSS vars on <html>; the Sidebar reads them.
  // Translucent (so macOS vibrancy still shows through). Neutral = original
  // (transparent bg, faint neutral border). Dark tints = a deep, mostly-opaque
  // surface, same in light and dark mode.
  private applyTint() {
    if (typeof document === "undefined") return;
    const isDark = this.resolved === "dark";
    const root = document.documentElement.style;
    const tint = findTint(this.sidebarTint);
    const hue = tint?.hue ?? null;

    if (tint?.aurora) {
      // Deep opaque base — the animated blobs + noise render on top of it
      // inside the Sidebar itself.
      root.setProperty("--sidebar-bg", tint.base ?? "hsl(228 42% 9%)");
      root.setProperty("--sidebar-border", "rgba(255, 255, 255, 0.14)");
    } else if (tint?.dark) {
      root.setProperty(
        "--sidebar-bg",
        hue == null
          ? "hsl(0 0% 9% / 0.94)"
          : `hsl(${hue} 30% 14% / 0.95)`,
      );
      root.setProperty(
        "--sidebar-border",
        hue == null
          ? "rgba(255, 255, 255, 0.12)"
          : `hsl(${hue} 45% 70% / 0.22)`,
      );
    } else if (hue == null) {
      root.setProperty("--sidebar-bg", "transparent");
      root.setProperty(
        "--sidebar-border",
        isDark ? "rgba(115, 115, 115, 0.25)" : "rgba(212, 212, 212, 0.4)",
      );
    } else {
      root.setProperty(
        "--sidebar-bg",
        isDark ? `hsl(${hue} 42% 48% / 0.16)` : `hsl(${hue} 70% 55% / 0.12)`,
      );
      root.setProperty(
        "--sidebar-border",
        isDark ? `hsl(${hue} 40% 58% / 0.32)` : `hsl(${hue} 45% 45% / 0.28)`,
      );
    }
  }
}

export const theme = new ThemeStore();
