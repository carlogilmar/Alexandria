//! Sidebar pin order (Sprint 49). A single persisted ordering for the unified
//! "Pinned" list, spanning every entity kind. The frontend owns the order and
//! rewrites the whole set on each drag-and-drop reorder.

use crate::commands::AppState;
use crate::db::models::{PinKey, PinOrder};
use crate::error::AppResult;
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn get_pin_order(pool: &SqlitePool) -> AppResult<Vec<PinOrder>> {
    sqlx::query_as::<_, PinOrder>(
        "SELECT kind, entity_id, position FROM pin_order ORDER BY position ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

// Replace the whole ordering with `order` (position = index). Wholesale
// replace keeps it simple and self-heals stale rows.
pub(crate) async fn set_pin_order(pool: &SqlitePool, order: &[PinKey]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM pin_order").execute(&mut *tx).await?;
    for (i, key) in order.iter().enumerate() {
        sqlx::query("INSERT INTO pin_order (kind, entity_id, position) VALUES (?1, ?2, ?3)")
            .bind(&key.kind)
            .bind(key.entity_id)
            .bind(i as i64)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[tauri::command]
pub async fn get_pin_order_cmd(state: State<'_, AppState>) -> AppResult<Vec<PinOrder>> {
    get_pin_order(&state.pool).await
}

#[tauri::command]
pub async fn set_pin_order_cmd(state: State<'_, AppState>, order: Vec<PinKey>) -> AppResult<()> {
    set_pin_order(&state.pool, &order).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::models::PinKey;
    use crate::db::test_pool;

    #[tokio::test]
    async fn set_then_get_roundtrips_order() {
        let pool = test_pool().await;
        let order = vec![
            PinKey { kind: "note".into(), entity_id: 7 },
            PinKey { kind: "blueprint".into(), entity_id: 3 },
            PinKey { kind: "article".into(), entity_id: 5 },
        ];
        set_pin_order(&pool, &order).await.unwrap();
        let got = get_pin_order(&pool).await.unwrap();
        assert_eq!(got.len(), 3);
        assert_eq!((got[0].kind.as_str(), got[0].entity_id), ("note", 7));
        assert_eq!((got[1].kind.as_str(), got[1].entity_id), ("blueprint", 3));
        assert_eq!(got[2].position, 2);

        // Rewriting replaces wholesale.
        set_pin_order(&pool, &[PinKey { kind: "note".into(), entity_id: 7 }])
            .await
            .unwrap();
        let got = get_pin_order(&pool).await.unwrap();
        assert_eq!(got.len(), 1);
    }
}
