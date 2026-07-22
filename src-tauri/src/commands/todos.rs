use crate::commands::AppState;
use crate::db::models::{Todo, TodoPatch};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn list_for(pool: &SqlitePool, list_id: i64) -> AppResult<Vec<Todo>> {
    sqlx::query_as::<_, Todo>(
        "SELECT * FROM todos WHERE list_id = ?1 ORDER BY position ASC, id ASC",
    )
    .bind(list_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create(pool: &SqlitePool, list_id: i64, text: &str) -> AppResult<Todo> {
    if text.trim().is_empty() {
        return Err(AppError::BadInput("todo text cannot be empty".into()));
    }
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM todos WHERE list_id = ?1")
            .bind(list_id)
            .fetch_one(pool)
            .await?;

    sqlx::query_as::<_, Todo>(
        "INSERT INTO todos (list_id, text, notes, completed, position, created_at, updated_at)
         VALUES (?1, ?2, NULL, 0, ?3, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(list_id)
    .bind(text.trim())
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

// Re-parent a todo to another list, appending it to the end of that list's
// order. Powers "Send to backlog" and "Pull to today" (Sprint 29).
pub(crate) async fn move_to_list(
    pool: &SqlitePool,
    id: i64,
    target_list_id: i64,
) -> AppResult<Todo> {
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM todos WHERE list_id = ?1")
            .bind(target_list_id)
            .fetch_one(pool)
            .await?;
    sqlx::query_as::<_, Todo>(
        "UPDATE todos SET list_id = ?1, position = ?2, updated_at = datetime('now')
           WHERE id = ?3
       RETURNING *",
    )
    .bind(target_list_id)
    .bind(next_pos)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("todo {id}")))
}

pub(crate) async fn update(pool: &SqlitePool, id: i64, patch: &TodoPatch) -> AppResult<Todo> {
    if let Some(t) = &patch.text {
        if t.trim().is_empty() {
            return Err(AppError::BadInput("todo text cannot be empty".into()));
        }
    }
    sqlx::query_as::<_, Todo>(
        "UPDATE todos SET
             text      = COALESCE(?1, text),
             notes     = COALESCE(?2, notes),
             completed = COALESCE(?3, completed),
             updated_at = datetime('now')
           WHERE id = ?4
       RETURNING *",
    )
    .bind(patch.text.as_deref().map(str::trim))
    .bind(patch.notes.as_deref())
    .bind(patch.completed.map(|b| b as i64))
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("todo {id}")))
}

pub(crate) async fn toggle(pool: &SqlitePool, id: i64) -> AppResult<Todo> {
    sqlx::query_as::<_, Todo>(
        "UPDATE todos SET completed = 1 - completed, updated_at = datetime('now')
         WHERE id = ?1
         RETURNING *",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("todo {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM todos WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("todo {id}")));
    }
    Ok(())
}

pub(crate) async fn reorder(
    pool: &SqlitePool,
    list_id: i64,
    ordered_ids: &[i64],
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (idx, id) in ordered_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE todos SET position = ?1, updated_at = datetime('now')
              WHERE id = ?2 AND list_id = ?3",
        )
        .bind(idx as i64)
        .bind(id)
        .bind(list_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn list_todos(state: State<'_, AppState>, list_id: i64) -> AppResult<Vec<Todo>> {
    list_for(&state.pool, list_id).await
}

#[tauri::command]
pub async fn create_todo(
    state: State<'_, AppState>,
    list_id: i64,
    text: String,
) -> AppResult<Todo> {
    create(&state.pool, list_id, &text).await
}

#[tauri::command]
pub async fn update_todo(
    state: State<'_, AppState>,
    id: i64,
    patch: TodoPatch,
) -> AppResult<Todo> {
    update(&state.pool, id, &patch).await
}

#[tauri::command]
pub async fn toggle_todo(state: State<'_, AppState>, id: i64) -> AppResult<Todo> {
    toggle(&state.pool, id).await
}

#[tauri::command]
pub async fn move_todo(
    state: State<'_, AppState>,
    id: i64,
    target_list_id: i64,
) -> AppResult<Todo> {
    move_to_list(&state.pool, id, target_list_id).await
}

#[tauri::command]
pub async fn delete_todo(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn reorder_todos(
    state: State<'_, AppState>,
    list_id: i64,
    ordered_ids: Vec<i64>,
) -> AppResult<()> {
    reorder(&state.pool, list_id, &ordered_ids).await
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::lists;
    use crate::db::test_pool;

    async fn fresh_list(pool: &SqlitePool) -> i64 {
        lists::create(pool, "test list", "2026-05-10")
            .await
            .unwrap()
            .id
    }

    #[tokio::test]
    async fn create_assigns_increasing_positions() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let a = create(&pool, list_id, "first").await.unwrap();
        let b = create(&pool, list_id, "second").await.unwrap();
        let c = create(&pool, list_id, "third").await.unwrap();
        assert_eq!(a.position, 0);
        assert_eq!(b.position, 1);
        assert_eq!(c.position, 2);
    }

    #[tokio::test]
    async fn move_to_list_reparents_and_appends() {
        let pool = test_pool().await;
        let src = fresh_list(&pool).await;
        let dst = lists::create(&pool, "dest", "2026-05-11").await.unwrap().id;
        // Seed the destination so the moved item must land at the end.
        create(&pool, dst, "existing").await.unwrap();
        let t = create(&pool, src, "to move").await.unwrap();

        let moved = move_to_list(&pool, t.id, dst).await.unwrap();
        assert_eq!(moved.list_id, dst);
        assert_eq!(moved.position, 1, "appended after the existing todo");

        // It left the source list.
        let remaining = list_for(&pool, src).await.unwrap();
        assert!(remaining.iter().all(|x| x.id != t.id));
    }

    #[tokio::test]
    async fn create_rejects_empty_text() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let err = create(&pool, list_id, "   ").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn toggle_flips_completed() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let t = create(&pool, list_id, "x").await.unwrap();
        assert!(!t.completed);
        let toggled = toggle(&pool, t.id).await.unwrap();
        assert!(toggled.completed);
        let untoggled = toggle(&pool, t.id).await.unwrap();
        assert!(!untoggled.completed);
    }

    #[tokio::test]
    async fn update_patches_only_provided_fields() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let t = create(&pool, list_id, "original").await.unwrap();

        let patched = update(
            &pool,
            t.id,
            &TodoPatch {
                notes: Some("a note".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(patched.text, "original");
        assert_eq!(patched.notes.as_deref(), Some("a note"));
        assert!(!patched.completed);

        let patched = update(
            &pool,
            t.id,
            &TodoPatch {
                text: Some("renamed".into()),
                completed: Some(true),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(patched.text, "renamed");
        assert!(patched.completed);
        assert_eq!(patched.notes.as_deref(), Some("a note"));
    }

    #[tokio::test]
    async fn delete_removes_row() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let t = create(&pool, list_id, "x").await.unwrap();
        delete(&pool, t.id).await.unwrap();
        let err = update(&pool, t.id, &TodoPatch::default()).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn deleting_list_cascades_to_todos() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        create(&pool, list_id, "x").await.unwrap();
        sqlx::query("DELETE FROM lists WHERE id = ?1")
            .bind(list_id)
            .execute(&pool)
            .await
            .unwrap();
        let remaining = list_for(&pool, list_id).await.unwrap();
        assert!(remaining.is_empty());
    }

    #[tokio::test]
    async fn reorder_writes_positions_in_array_order() {
        let pool = test_pool().await;
        let list_id = fresh_list(&pool).await;
        let a = create(&pool, list_id, "a").await.unwrap();
        let b = create(&pool, list_id, "b").await.unwrap();
        let c = create(&pool, list_id, "c").await.unwrap();

        reorder(&pool, list_id, &[c.id, a.id, b.id]).await.unwrap();
        let ordered = list_for(&pool, list_id).await.unwrap();
        let ids: Vec<i64> = ordered.iter().map(|t| t.id).collect();
        assert_eq!(ids, vec![c.id, a.id, b.id]);
    }
}
