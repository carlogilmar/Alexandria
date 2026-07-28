# Sprint 41 — Passwords vault (tiny encrypted site-password keeper)

## Why

The user kept site passwords in a plaintext `.txt`. This adds a tiny,
**encrypted** place for them inside the app — "much better than a txt,"
not a hardened enterprise manager. Scope was deliberately kept minimal:
**one entry = { title, password }**, for low-stakes site logins.

## Threat model (honest)

Protects **data at rest**: passwords are ciphertext in the SQLite file, so
a stolen/backed-up DB is useless without the master password. Does **not**
protect against a compromised machine while unlocked (keylogger/memory), or
the OS clipboard (hence auto-clear). Stated plainly in the setup UI.

## Design (decisions from the discussion)

- **Master password**, Argon2id-derived key. No recovery — never stored.
- **Encryption scope kept tiny**: titles are **plaintext** (list is
  browsable/searchable even while locked); only the **password** is
  encrypted.
- **Auto-lock**: ~5 min idle + on quit (process death drops the in-memory
  key).

## Crypto (vetted RustCrypto crates, no hand-rolled algorithms)

- `argon2` (Argon2id, default params) — master password + 16-byte salt →
  32-byte key.
- `chacha20poly1305` (XChaCha20-Poly1305) — each password stored as
  `nonce(24)‖ciphertext`; a fresh random nonce per encryption.
- `zeroize` — the key is wiped on lock / replace.
- **The key lives ONLY in `AppState.vault_key`** (a `tokio::sync::Mutex<
  Option<[u8;32]>>`), backend memory. It never crosses the IPC boundary; a
  plaintext password crosses only via `reveal_secret` when the user
  explicitly reveals/copies one.
- **No stored master password**: `vault_meta` holds the `salt` + a
  `verifier` (the constant `alexandria-vault-v1` encrypted with the key);
  unlock re-derives the key and checks it decrypts the verifier.

## Data model (migration `0022_passwords_vault.sql`)

- `vault_meta(id=1, salt BLOB, verifier BLOB, created_at)` — single row.
- `secrets(id, title TEXT, password_enc BLOB, created_at, updated_at)`.

## Backend — `commands/secrets.rs`

Commands: `vault_status` (`{initialized, unlocked}`), `vault_setup`,
`vault_unlock` (returns `bool` — false on wrong password, no scary error),
`vault_lock`, `list_secrets` (id+title, works while locked), `add_secret`,
`update_secret` (title and/or password; `password=None` leaves it),
`reveal_secret`, `delete_secret`. `with_key` gates the encrypt/decrypt ops
on an unlocked vault. 4 unit tests: roundtrip, wrong-key fails, verifier
match, per-encrypt nonce uniqueness.

## Frontend

- New **Passwords** section at **⌘8** (freed after Alexandria's removal) +
  a TopNav lock icon, command-palette "Passwords" destination + a "Lock
  passwords vault" action, HelpModal ⌘8 row.
- `PasswordsView.svelte`: three states — **setup** (set master password,
  with the no-recovery warning), **locked** (unlock form; shows the entry
  count), **unlocked** (add with a strong-password generator + show/hide;
  list with reveal 👁 / copy 📋 / delete). Copy uses `navigator.clipboard`
  and **auto-clears after 20 s** (only if the clipboard still holds it).
- Store: `vaultInitialized` / `vaultUnlocked` / `secrets` + actions;
  `touchVault()` (idle-timer reset) wired to a global keydown/pointerdown
  listener in `+page.svelte`; fires `lockVault()` after 5 min idle.

## Verification

`cargo test --lib` 100 pass (incl. 4 crypto tests; migration `0022`
applies in the test pool). `svelte-check` clean; `pnpm build` clean.

## Not doing / limitations

- No username/URL/notes, no categories, no reorder, no import/export, no
  password-strength meter, no biometric/Touch ID unlock. Titles are
  plaintext (leaks which sites you keep). It's a convenience keeper, and
  the setup screen says so.
