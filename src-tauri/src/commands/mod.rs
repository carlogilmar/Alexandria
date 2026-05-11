pub mod export;
pub mod lists;
pub mod search;
pub mod tags;
pub mod todos;

use sqlx::SqlitePool;

pub struct AppState {
    pub pool: SqlitePool,
}
