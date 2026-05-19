pub mod articles;
pub mod export;
pub mod images;
pub mod lists;
pub mod notes;
pub mod search;
pub mod tags;
pub mod todos;
pub mod workflows;

use sqlx::SqlitePool;

pub struct AppState {
    pub pool: SqlitePool,
}
