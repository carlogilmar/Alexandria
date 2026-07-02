pub mod articles;
pub mod blueprints;
pub mod export;
pub mod feedback;
pub mod flashcards;
pub mod images;
pub mod lists;
pub mod map;
pub mod notes;
pub mod search;
pub mod tags;
pub mod todos;
pub mod workflows;

use sqlx::SqlitePool;

pub struct AppState {
    pub pool: SqlitePool,
}
