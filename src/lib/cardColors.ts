// Named card colors → hue. Stored as the name string on the card (null = none).
export const CARD_COLORS: { name: string; hue: number }[] = [
  { name: "red", hue: 0 },
  { name: "orange", hue: 28 },
  { name: "amber", hue: 45 },
  { name: "green", hue: 145 },
  { name: "teal", hue: 175 },
  { name: "blue", hue: 215 },
  { name: "violet", hue: 265 },
  { name: "pink", hue: 330 },
  { name: "gray", hue: 220 },
];

export function cardHue(name: string | null): number | null {
  if (!name) return null;
  const found = CARD_COLORS.find((c) => c.name === name);
  if (!found) return null;
  return name === "gray" ? -1 : found.hue; // -1 sentinel: desaturated
}

// CSS color for the card's accent stripe given a stored color name.
export function cardAccent(name: string | null): string | null {
  if (!name) return null;
  if (name === "gray") return "hsl(220 8% 60%)";
  const h = cardHue(name);
  return h === null ? null : `hsl(${h} 70% 52%)`;
}
