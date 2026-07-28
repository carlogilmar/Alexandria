-- Sprint 41: a tiny encrypted "site passwords" keeper.
-- `vault_meta` holds the Argon2id salt + a verifier blob (a known constant
-- encrypted with the derived key) so we can check the master password on unlock
-- WITHOUT ever storing it. Single row (id = 1). `secrets` stores one entry per
-- site: plaintext title (so the list is browsable while locked) + the password
-- encrypted as nonce‖ciphertext (XChaCha20-Poly1305).
CREATE TABLE vault_meta (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  salt       BLOB    NOT NULL,
  verifier   BLOB    NOT NULL,
  created_at TEXT    NOT NULL
);

CREATE TABLE secrets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  password_enc BLOB    NOT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);
