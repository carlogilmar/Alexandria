use crate::commands::AppState;
use crate::db::models::{IndexDoc, Note, NoteSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

// ============================================================
// Notes
// ============================================================

pub(crate) async fn all(pool: &SqlitePool) -> AppResult<Vec<NoteSummary>> {
    sqlx::query_as::<_, NoteSummary>(
        "SELECT id, title, date, pinned, archived FROM notes ORDER BY date DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn for_date(pool: &SqlitePool, date: &str) -> AppResult<Vec<NoteSummary>> {
    sqlx::query_as::<_, NoteSummary>(
        "SELECT id, title, date, pinned, archived FROM notes WHERE date = ?1 ORDER BY id ASC",
    )
    .bind(date)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<Note> {
    sqlx::query_as::<_, Note>("SELECT * FROM notes WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

pub(crate) async fn create(pool: &SqlitePool, title: &str, date: &str) -> AppResult<Note> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Note>(
        "INSERT INTO notes (title, date, body, created_at, updated_at)
         VALUES (?1, ?2, '', datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .bind(date)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Note> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Note>(
        "UPDATE notes SET title = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

pub(crate) async fn update_body(pool: &SqlitePool, id: i64, body: &str) -> AppResult<Note> {
    sqlx::query_as::<_, Note>(
        "UPDATE notes SET body = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(body)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM notes WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("note {id}")));
    }
    Ok(())
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Note> {
    sqlx::query_as::<_, Note>(
        "UPDATE notes SET pinned = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

pub(crate) async fn set_archived(pool: &SqlitePool, id: i64, archived: bool) -> AppResult<Note> {
    sqlx::query_as::<_, Note>(
        "UPDATE notes SET archived = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("note {id}")))
}

// ============================================================
// Index document (singleton)
// ============================================================

pub(crate) async fn get_index(pool: &SqlitePool) -> AppResult<IndexDoc> {
    sqlx::query_as::<_, IndexDoc>(
        "SELECT body, updated_at FROM index_doc WHERE id = 1",
    )
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("index doc".into()))
}

pub(crate) async fn set_index(pool: &SqlitePool, body: &str) -> AppResult<IndexDoc> {
    sqlx::query_as::<_, IndexDoc>(
        "UPDATE index_doc SET body = ?1, updated_at = datetime('now')
           WHERE id = 1 RETURNING body, updated_at",
    )
    .bind(body)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("index doc".into()))
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_notes(state: State<'_, AppState>) -> AppResult<Vec<NoteSummary>> {
    all(&state.pool).await
}

#[tauri::command]
pub async fn list_notes_for_date(
    state: State<'_, AppState>,
    date: String,
) -> AppResult<Vec<NoteSummary>> {
    for_date(&state.pool, &date).await
}

#[tauri::command]
pub async fn note_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Note> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn create_note(
    state: State<'_, AppState>,
    title: String,
    date: String,
) -> AppResult<Note> {
    create(&state.pool, &title, &date).await
}

#[tauri::command]
pub async fn rename_note(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Note> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn update_note_body(
    state: State<'_, AppState>,
    id: i64,
    body: String,
) -> AppResult<Note> {
    update_body(&state.pool, id, &body).await
}

#[tauri::command]
pub async fn delete_note(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn set_note_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Note> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_note_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Note> {
    set_archived(&state.pool, id, archived).await
}

#[tauri::command]
pub async fn get_index_doc(state: State<'_, AppState>) -> AppResult<IndexDoc> {
    get_index(&state.pool).await
}

#[tauri::command]
pub async fn update_index_doc(
    state: State<'_, AppState>,
    body: String,
) -> AppResult<IndexDoc> {
    set_index(&state.pool, &body).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_fetch_note() {
        let pool = test_pool().await;
        let n = create(&pool, "Morning thoughts", "2026-05-14").await.unwrap();
        assert_eq!(n.title, "Morning thoughts");
        assert_eq!(n.date, "2026-05-14");
        assert_eq!(n.body, "");
        let got = by_id(&pool, n.id).await.unwrap();
        assert_eq!(got.id, n.id);
    }

    #[tokio::test]
    async fn rejects_empty_title() {
        let pool = test_pool().await;
        let err = create(&pool, "  ", "2026-05-14").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn for_date_filters_correctly() {
        let pool = test_pool().await;
        create(&pool, "a", "2026-05-14").await.unwrap();
        create(&pool, "b", "2026-05-14").await.unwrap();
        create(&pool, "c", "2026-05-15").await.unwrap();
        let today = for_date(&pool, "2026-05-14").await.unwrap();
        assert_eq!(today.len(), 2);
        let other = for_date(&pool, "2026-05-15").await.unwrap();
        assert_eq!(other.len(), 1);
    }

    #[tokio::test]
    async fn update_body_persists() {
        let pool = test_pool().await;
        let n = create(&pool, "x", "2026-05-14").await.unwrap();
        let upd = update_body(&pool, n.id, "# hello\n\nworld").await.unwrap();
        assert_eq!(upd.body, "# hello\n\nworld");
    }

    #[tokio::test]
    async fn rename_changes_title() {
        let pool = test_pool().await;
        let n = create(&pool, "old", "2026-05-14").await.unwrap();
        let renamed = rename(&pool, n.id, "new").await.unwrap();
        assert_eq!(renamed.title, "new");
    }

    #[tokio::test]
    async fn delete_removes_note() {
        let pool = test_pool().await;
        let n = create(&pool, "x", "2026-05-14").await.unwrap();
        delete(&pool, n.id).await.unwrap();
        let err = by_id(&pool, n.id).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn index_doc_starts_empty_and_is_updatable() {
        let pool = test_pool().await;
        let got = get_index(&pool).await.unwrap();
        assert_eq!(got.body, "");
        let upd = set_index(&pool, "# Index\n\n- item").await.unwrap();
        assert_eq!(upd.body, "# Index\n\n- item");
        let got = get_index(&pool).await.unwrap();
        assert_eq!(got.body, "# Index\n\n- item");
    }
}
