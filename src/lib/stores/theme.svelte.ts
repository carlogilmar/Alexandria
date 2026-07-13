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
  { name: "teal", label: "Teal", hue: 185 },
  { name: "amber", label: "Amber", hue: 38 },
  { name: "rose", label: "Rose", hue: 350 },
  { name: "indigo", label: "Indigo", hue: 245 },
  // Dark surfaces (light text).
  { name: "ink", label: "Ink (black)", hue: null, dark: true },
  { name: "graphite", label: "Graphite", hue: 220, dark: true },
  { name: "navy", label: "Navy", hue: 222, dark: true },
  { name: "forest", label: "Forest", hue: 155, dark: true },
  { name: "wine", label: "Wine", hue: 345, dark: true },
  { name: "espresso", label: "Espresso", hue: 25, dark: true },
  { name: "plum", label: "Plum", hue: 290, dark: true },
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
  {
    name: "borealis",
    label: "Borealis (animated)",
    hue: null,
    dark: true,
    base: "hsl(170 50% 8%)",
    aurora: ["#4ade80", "#a3e635", "#22d3ee"],
  },
  {
    name: "ocean",
    label: "Ocean (animated)",
    hue: null,
    dark: true,
    base: "hsl(215 55% 10%)",
    aurora: ["#38bdf8", "#22d3ee", "#6366f1"],
  },
  {
    name: "sunset",
    label: "Sunset (animated)",
    hue: null,
    dark: true,
    base: "hsl(268 40% 10%)",
    aurora: ["#f97316", "#ef4444", "#fbbf24"],
  },
  {
    name: "orchid",
    label: "Orchid (animated)",
    hue: null,
    dark: true,
    base: "hsl(300 40% 9%)",
    aurora: ["#f472b6", "#c084fc", "#fb7185"],
  },
  {
    name: "ice",
    label: "Ice (animated)",
    hue: null,
    dark: true,
    base: "hsl(210 30% 12%)",
    aurora: ["#e2e8f0", "#94a3b8", "#38bdf8"],
  },
  {
    name: "cosmos",
    label: "Cosmos (animated)",
    hue: null,
    dark: true,
    base: "hsl(250 48% 8%)",
    aurora: ["#6366f1", "#d946ef", "#22d3ee"],
  },
  {
    name: "lagoon",
    label: "Lagoon (animated)",
    hue: null,
    dark: true,
    base: "hsl(190 55% 8%)",
    aurora: ["#2dd4bf", "#0ea5e9", "#a3e635"],
  },
  {
    name: "magma",
    label: "Magma (animated)",
    hue: null,
    dark: true,
    base: "hsl(12 50% 8%)",
    aurora: ["#f97316", "#dc2626", "#facc15"],
  },
  // Light aurora surfaces (dark text): pastel blobs multiply-blended over a
  // near-white base — see Sidebar.svelte's .aurora-light rules.
  {
    name: "daybreak",
    label: "Daybreak (animated, light)",
    hue: null,
    base: "hsl(210 60% 97%)",
    aurora: ["#7dd3fc", "#a5b4fc", "#6ee7b7"],
  },
  {
    name: "meadow",
    label: "Meadow (animated, light)",
    hue: null,
    base: "hsl(140 45% 97%)",
    aurora: ["#86efac", "#fde047", "#5eead4"],
  },
  {
    name: "blossom",
    label: "Blossom (animated, light)",
    hue: null,
    base: "hsl(330 60% 97%)",
    aurora: ["#f9a8d4", "#c4b5fd", "#fda4af"],
  },
  {
    name: "citrus",
    label: "Citrus (animated, light)",
    hue: null,
    base: "hsl(45 80% 97%)",
    aurora: ["#fde047", "#fdba74", "#bef264"],
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
      // Opaque base — the animated blobs + noise render on top of it inside
      // the Sidebar itself. Dark auroras get a light border, light auroras a
      // dark one.
      root.setProperty(
        "--sidebar-bg",
        tint.base ?? (tint.dark ? "hsl(228 42% 9%)" : "hsl(0 0% 98%)"),
      );
      root.setProperty(
        "--sidebar-border",
        tint.dark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.1)",
      );
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
