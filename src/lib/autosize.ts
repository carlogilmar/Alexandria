// Svelte action: grow a <textarea> to fit its content so long notes aren't
// trapped in a small scrolling box. Re-measures on input and whenever the
// bound value changes (pass the draft as the action parameter so programmatic
// edits — inserted images/tables/links — also trigger a re-measure).
//
// `min-height` (set via CSS/inline) still applies as the floor: short content
// keeps the comfortable starting size, longer content expands.
export function autosize(node: HTMLTextAreaElement, _value?: string) {
  const resize = () => {
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  };
  // Measure once laid out (offscreen/initial mount reports 0 otherwise).
  queueMicrotask(resize);
  node.addEventListener("input", resize);
  return {
    update() {
      queueMicrotask(resize);
    },
    destroy() {
      node.removeEventListener("input", resize);
    },
  };
}
