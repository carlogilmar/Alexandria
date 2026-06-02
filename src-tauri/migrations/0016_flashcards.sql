-- Sprint 20: Flash Deck. One global deck of flashcards, grouped by optional
-- categories ("suits") that carry a color + icon. A card has a markdown body,
-- optional hero image, emoji + color accents, and a manual deck position.

CREATE TABLE flashcard_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  color       TEXT,                 -- palette name (see cardColors.ts)
  icon        TEXT,                 -- optional emoji
  position    INTEGER NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE TABLE flashcards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL DEFAULT 'Untitled card',
  category_id INTEGER REFERENCES flashcard_categories(id) ON DELETE SET NULL,
  body        TEXT    NOT NULL DEFAULT '',   -- markdown (the card "back")
  image_url   TEXT,                          -- set ⇒ hero art (else generative)
  emoji       TEXT,                          -- accent glyph
  color       TEXT,                          -- frame/art theme (palette name)
  position    INTEGER NOT NULL,              -- manual deck order
  pinned      INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE INDEX idx_flashcards_position ON flashcards(position);
CREATE INDEX idx_flashcards_category ON flashcards(category_id);
