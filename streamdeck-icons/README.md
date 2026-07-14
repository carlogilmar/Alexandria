# Alexandria — Stream Deck icons

288×288 PNG icons for the app's quick-action keyboard shortcuts. Colour-coded
to match each entity's hue in the app.

| PNG | Shortcut | Action |
|-----|----------|--------|
| `today.png` (green) | ⌘⇧T | Open today's list (if one exists) |
| `note.png` (blue) | ⌘⇧N | New note |
| `blueprint.png` (sky) | ⌘⇧B | New blueprint |
| `summary.png` (slate) | ⌘⇧S | Summary |
| `article.png` (violet ★) | ⌘⇧A | Open the starred "quick article" |

## Add to Stream Deck

1. Drag a **Hotkey** action onto a key.
2. Record the combo (e.g. ⌘⇧T).
3. Set the key **Image** to the matching PNG above (drag it in, or use "Set from file").
4. Optionally clear the key **Title** — the icons already carry a label.

## Tweak / regenerate

Edit `gen.mjs` (hues, labels, glyphs) then run `./build.sh`. It writes the
SVGs and rasterizes them to PNG with macOS `qlmanage` — no extra tooling.
