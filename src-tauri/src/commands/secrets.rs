//! Passwords vault (Sprint 41) — a tiny encrypted "site passwords" keeper.
//!
//! Security shape:
//! - Master password → 32-byte key via **Argon2id** (salt stored in DB).
//! - Each password encrypted with **XChaCha20-Poly1305** as `nonce‖ciphertext`.
//! - The derived key lives ONLY in `AppState.vault_key` (backend memory) while
//!   unlocked, and is zeroized on lock. It never crosses the IPC boundary; the
//!   frontend only receives a plaintext password when it explicitly reveals one.
//! - No recovery: the master password is never stored. A `verifier` blob (a
//!   known constant encrypted with the key) lets us check the password on
//!   unlock without keeping it.
//!
//! We use vetted RustCrypto crates only — no hand-rolled algorithms.

use crate::commands::AppState;
use crate::db::models::{SecretMeta, VaultStatus};
use crate::error::{AppError, AppResult};
use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    XChaCha20Poly1305, XNonce,
};
use sqlx::SqlitePool;
use tauri::State;
use zeroize::Zeroize;

const VERIFIER_PLAINTEXT: &[u8] = b"alexandria-vault-v1";
const NONCE_LEN: usize = 24; // XChaCha20-Poly1305 nonce

// ---------- crypto helpers ----------

fn derive_key(password: &str, salt: &[u8]) -> AppResult<[u8; 32]> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| AppError::Other(format!("key derivation failed: {e}")))?;
    Ok(key)
}

fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ct = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AppError::Other("encryption failed".into()))?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt(key: &[u8; 32], blob: &[u8]) -> AppResult<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        return Err(AppError::Other("ciphertext too short".into()));
    }
    let (nonce, ct) = blob.split_at(NONCE_LEN);
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(XNonce::from_slice(nonce), ct)
        .map_err(|_| AppError::Other("decryption failed".into()))
}

fn random_salt() -> [u8; 16] {
    use chacha20poly1305::aead::rand_core::RngCore;
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    salt
}

// ---------- vault lifecycle ----------

async fn meta_row(pool: &SqlitePool) -> AppResult<Option<(Vec<u8>, Vec<u8>)>> {
    let row: Option<(Vec<u8>, Vec<u8>)> =
        sqlx::query_as("SELECT salt, verifier FROM vault_meta WHERE id = 1")
            .fetch_optional(pool)
            .await?;
    Ok(row)
}

// Replace the in-memory key, zeroizing any previous one.
async fn set_key(state: &AppState, key: Option<[u8; 32]>) {
    let mut guard = state.vault_key.lock().await;
    if let Some(mut old) = guard.take() {
        old.zeroize();
    }
    *guard = key;
}

#[tauri::command]
pub async fn vault_status(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    let initialized = meta_row(&state.pool).await?.is_some();
    let unlocked = state.vault_key.lock().await.is_some();
    Ok(VaultStatus {
        initialized,
        unlocked,
    })
}

// First-time setup: choose the master password. Rejected if already set up.
#[tauri::command]
pub async fn vault_setup(state: State<'_, AppState>, password: String) -> AppResult<()> {
    if password.is_empty() {
        return Err(AppError::BadInput("master password cannot be empty".into()));
    }
    if meta_row(&state.pool).await?.is_some() {
        return Err(AppError::BadInput("vault already initialized".into()));
    }
    let salt = random_salt();
    let key = derive_key(&password, &salt)?;
    let verifier = encrypt(&key, VERIFIER_PLAINTEXT)?;
    sqlx::query(
        "INSERT INTO vault_meta (id, salt, verifier, created_at)
         VALUES (1, ?1, ?2, datetime('now'))",
    )
    .bind(salt.to_vec())
    .bind(verifier)
    .execute(&state.pool)
    .await?;
    set_key(&state, Some(key)).await;
    Ok(())
}

// Unlock with the master password. Returns false on a wrong password (no error,
// so the UI can show a gentle "incorrect" without a scary screen).
#[tauri::command]
pub async fn vault_unlock(state: State<'_, AppState>, password: String) -> AppResult<bool> {
    let Some((salt, verifier)) = meta_row(&state.pool).await? else {
        return Err(AppError::BadInput("vault not initialized".into()));
    };
    let mut key = derive_key(&password, &salt)?;
    match decrypt(&key, &verifier) {
        Ok(pt) if pt == VERIFIER_PLAINTEXT => {
            set_key(&state, Some(key)).await;
            Ok(true)
        }
        _ => {
            key.zeroize();
            Ok(false)
        }
    }
}

#[tauri::command]
pub async fn vault_lock(state: State<'_, AppState>) -> AppResult<()> {
    set_key(&state, None).await;
    Ok(())
}

// ---------- entries ----------

// Titles are plaintext, so the list is browsable even while locked.
#[tauri::command]
pub async fn list_secrets(state: State<'_, AppState>) -> AppResult<Vec<SecretMeta>> {
    sqlx::query_as::<_, SecretMeta>(
        "SELECT id, title FROM secrets ORDER BY title COLLATE NOCASE ASC, id ASC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(Into::into)
}

// Run `f` with the unlocked key, or error if the vault is locked.
async fn with_key<T, F>(state: &AppState, f: F) -> AppResult<T>
where
    F: FnOnce(&[u8; 32]) -> AppResult<T>,
{
    let guard = state.vault_key.lock().await;
    match guard.as_ref() {
        Some(key) => f(key),
        None => Err(AppError::BadInput("vault is locked".into())),
    }
}

#[tauri::command]
pub async fn add_secret(
    state: State<'_, AppState>,
    title: String,
    password: String,
) -> AppResult<SecretMeta> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    let enc = with_key(&state, |key| encrypt(key, password.as_bytes())).await?;
    let row = sqlx::query_as::<_, SecretMeta>(
        "INSERT INTO secrets (title, password_enc, created_at, updated_at)
         VALUES (?1, ?2, datetime('now'), datetime('now'))
         RETURNING id, title",
    )
    .bind(&title)
    .bind(enc)
    .fetch_one(&state.pool)
    .await?;
    Ok(row)
}

// Update the title and/or password. `password = None` leaves it unchanged
// (so renaming a title doesn't require re-encrypting).
#[tauri::command]
pub async fn update_secret(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    password: Option<String>,
) -> AppResult<SecretMeta> {
    if let Some(t) = &title {
        if t.trim().is_empty() {
            return Err(AppError::BadInput("title cannot be empty".into()));
        }
    }
    if let Some(pw) = password {
        let enc = with_key(&state, |key| encrypt(key, pw.as_bytes())).await?;
        sqlx::query(
            "UPDATE secrets SET password_enc = ?1, updated_at = datetime('now') WHERE id = ?2",
        )
        .bind(enc)
        .bind(id)
        .execute(&state.pool)
        .await?;
    }
    let row = sqlx::query_as::<_, SecretMeta>(
        "UPDATE secrets
            SET title = COALESCE(?1, title), updated_at = datetime('now')
          WHERE id = ?2
          RETURNING id, title",
    )
    .bind(title.map(|t| t.trim().to_string()))
    .bind(id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("secret {id}")))?;
    Ok(row)
}

// Decrypt and return one password (requires unlock). This is the ONLY path a
// plaintext password crosses the IPC boundary.
#[tauri::command]
pub async fn reveal_secret(state: State<'_, AppState>, id: i64) -> AppResult<String> {
    let enc: Vec<u8> = sqlx::query_scalar("SELECT password_enc FROM secrets WHERE id = ?1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("secret {id}")))?;
    let plain = with_key(&state, |key| decrypt(key, &enc)).await?;
    String::from_utf8(plain).map_err(|_| AppError::Other("password not valid UTF-8".into()))
}

#[tauri::command]
pub async fn delete_secret(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM secrets WHERE id = ?1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("secret {id}")));
    }
    Ok(())
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_encrypt_decrypt() {
        let key = derive_key("hunter2", &random_salt()).unwrap();
        let blob = encrypt(&key, b"s3cret-value").unwrap();
        assert_ne!(&blob[NONCE_LEN..], b"s3cret-value"); // actually encrypted
        assert_eq!(decrypt(&key, &blob).unwrap(), b"s3cret-value");
    }

    #[test]
    fn wrong_key_fails_to_decrypt() {
        let salt = random_salt();
        let good = derive_key("correct-horse", &salt).unwrap();
        let bad = derive_key("wrong-horse", &salt).unwrap();
        let blob = encrypt(&good, b"x").unwrap();
        assert!(decrypt(&bad, &blob).is_err());
    }

    #[test]
    fn verifier_matches_only_with_right_password() {
        let salt = random_salt();
        let key = derive_key("pw", &salt).unwrap();
        let verifier = encrypt(&key, VERIFIER_PLAINTEXT).unwrap();
        // right password
        let k2 = derive_key("pw", &salt).unwrap();
        assert_eq!(decrypt(&k2, &verifier).unwrap(), VERIFIER_PLAINTEXT);
        // wrong password
        let k3 = derive_key("nope", &salt).unwrap();
        assert!(decrypt(&k3, &verifier).is_err());
    }

    #[test]
    fn nonce_is_unique_per_encrypt() {
        let key = derive_key("pw", &random_salt()).unwrap();
        let a = encrypt(&key, b"same").unwrap();
        let b = encrypt(&key, b"same").unwrap();
        assert_ne!(a, b, "each encryption must use a fresh nonce");
    }
}
