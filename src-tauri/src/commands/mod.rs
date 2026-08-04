pub mod articles;
pub mod blueprints;
pub mod checkins;
pub mod export;
pub mod feedback;
pub mod flashcards;
pub mod images;
pub mod lists;
pub mod notes;
pub mod pins;
pub mod search;
pub mod secrets;
pub mod storyboards;
pub mod tags;
pub mod todos;
pub mod workflows;

use sqlx::SqlitePool;
use tokio::sync::Mutex;

pub struct AppState {
    pub pool: SqlitePool,
    // Passwords vault (Sprint 41): the Argon2id-derived key lives ONLY here in
    // backend memory while unlocked; None = locked. Zeroized on lock.
    pub vault_key: Mutex<Option<[u8; 32]>>,
}
