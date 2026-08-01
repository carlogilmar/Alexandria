//! Camera check-ins (Sprint 42) — the "lolcommits for todo lists" gallery.
//! The frontend captures + encodes the GIF (webview `getUserMedia` + gifenc)
//! and saves the bytes via `save_image`; here we just record/list/delete the
//! metadata row. Deleting a check-in also removes its GIF file from disk.

use crate::commands::AppState;
use crate::db::models::Checkin;
use crate::error::{AppError, AppResult};
use tauri::State;

#[tauri::command]
pub async fn add_checkin(
    state: State<'_, AppState>,
    path: String,
    list_id: Option<i64>,
) -> AppResult<Checkin> {
    if path.trim().is_empty() {
        return Err(AppError::BadInput("checkin path cannot be empty".into()));
    }
    sqlx::query_as::<_, Checkin>(
        "INSERT INTO checkins (list_id, path, created_at)
         VALUES (?1, ?2, datetime('now'))
         RETURNING id, list_id, path, created_at",
    )
    .bind(list_id)
    .bind(path.trim())
    .fetch_one(&state.pool)
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn list_checkins(state: State<'_, AppState>) -> AppResult<Vec<Checkin>> {
    sqlx::query_as::<_, Checkin>(
        "SELECT id, list_id, path, created_at FROM checkins
          ORDER BY created_at DESC, id DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(Into::into)
}

#[tauri::command]
pub async fn delete_checkin(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    // Fetch the path first so we can also remove the GIF file from disk.
    let path: Option<String> = sqlx::query_scalar("SELECT path FROM checkins WHERE id = ?1")
        .bind(id)
        .fetch_optional(&state.pool)
        .await?;
    let Some(path) = path else {
        return Err(AppError::NotFound(format!("checkin {id}")));
    };
    sqlx::query("DELETE FROM checkins WHERE id = ?1")
        .bind(id)
        .execute(&state.pool)
        .await?;
    // Best-effort file removal — a missing file shouldn't fail the delete.
    let _ = std::fs::remove_file(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn add_list_delete_roundtrip() {
        let pool = test_pool().await;
        // add two
        for p in ["/tmp/a.gif", "/tmp/b.gif"] {
            sqlx::query("INSERT INTO checkins (list_id, path, created_at) VALUES (NULL, ?1, datetime('now'))")
                .bind(p)
                .execute(&pool)
                .await
                .unwrap();
        }
        let rows: Vec<Checkin> =
            sqlx::query_as("SELECT id, list_id, path, created_at FROM checkins ORDER BY id")
                .fetch_all(&pool)
                .await
                .unwrap();
        assert_eq!(rows.len(), 2);
        // delete one row
        sqlx::query("DELETE FROM checkins WHERE id = ?1")
            .bind(rows[0].id)
            .execute(&pool)
            .await
            .unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM checkins")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    #[tokio::test]
    async fn checkin_survives_list_deletion() {
        let pool = test_pool().await;
        let list = crate::commands::lists::create(&pool, "L", "2026-05-10")
            .await
            .unwrap();
        sqlx::query("INSERT INTO checkins (list_id, path, created_at) VALUES (?1, '/tmp/x.gif', datetime('now'))")
            .bind(list.id)
            .execute(&pool)
            .await
            .unwrap();
        // deleting the list should NULL the check-in's list_id, not remove it
        sqlx::query("DELETE FROM lists WHERE id = ?1")
            .bind(list.id)
            .execute(&pool)
            .await
            .unwrap();
        let row: Checkin =
            sqlx::query_as("SELECT id, list_id, path, created_at FROM checkins")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(row.list_id, None);
    }
}
