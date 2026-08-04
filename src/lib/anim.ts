// Tiny animation helpers built on the native Web Animations API — no
// dependency (same approach as the Mirror's hand-rolled easing). Used for
// entrance choreography on Home; reusable anywhere.

const EASE = "cubic-bezier(.22, 1, .36, 1)";

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type RevealParams = { delay?: number; y?: number; duration?: number };

/**
 * Svelte action: fade + slide an element up on mount. Respects
 * `prefers-reduced-motion` (skips, leaving the element visible). Usage:
 *   <div use:reveal={{ delay: 80 }}>…</div>
 */
export function reveal(node: HTMLElement, params: RevealParams = {}) {
  if (prefersReducedMotion()) return {};
  node.animate(
    [
      { opacity: 0, transform: `translateY(${params.y ?? 10}px)` },
      { opacity: 1, transform: "none" },
    ],
    {
      duration: params.duration ?? 460,
      delay: params.delay ?? 0,
      easing: EASE,
      fill: "both",
    },
  );
  return {};
}
