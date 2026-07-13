-- Sprint 24: images on blueprint cards.
-- A pasted image becomes a card node carrying an image_url (the app's asset
-- URL from save_image). Nullable, no CHECK-constraint change, so this is a
-- plain additive ALTER — no table recreation.
ALTER TABLE blueprint_nodes ADD COLUMN image_url TEXT;
