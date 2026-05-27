use crate::commands::AppState;
use crate::db::models::{Diagram, DiagramSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn all(pool: &SqlitePool) -> AppResult<Vec<DiagramSummary>> {
    sqlx::query_as::<_, DiagramSummary>(
        "SELECT id, title, pinned, archived, updated_at FROM diagrams
          ORDER BY updated_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<Diagram> {
    sqlx::query_as::<_, Diagram>("SELECT * FROM diagrams WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("diagram {id}")))
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<Diagram> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Diagram>(
        "INSERT INTO diagrams (title, source, pinned, archived, created_at, updated_at)
         VALUES (?1, '', 0, 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Diagram> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Diagram>(
        "UPDATE diagrams SET title = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("diagram {id}")))
}

pub(crate) async fn update_source(pool: &SqlitePool, id: i64, source: &str) -> AppResult<Diagram> {
    sqlx::query_as::<_, Diagram>(
        "UPDATE diagrams SET source = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(source)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("diagram {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM diagrams WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("diagram {id}")));
    }
    Ok(())
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Diagram> {
    sqlx::query_as::<_, Diagram>(
        "UPDATE diagrams SET pinned = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("diagram {id}")))
}

pub(crate) async fn set_archived(pool: &SqlitePool, id: i64, archived: bool) -> AppResult<Diagram> {
    sqlx::query_as::<_, Diagram>(
        "UPDATE diagrams SET archived = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("diagram {id}")))
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_diagrams(state: State<'_, AppState>) -> AppResult<Vec<DiagramSummary>> {
    all(&state.pool).await
}

#[tauri::command]
pub async fn diagram_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Diagram> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn create_diagram(state: State<'_, AppState>, title: String) -> AppResult<Diagram> {
    create(&state.pool, &title).await
}

#[tauri::command]
pub async fn rename_diagram(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Diagram> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn update_diagram_source(
    state: State<'_, AppState>,
    id: i64,
    source: String,
) -> AppResult<Diagram> {
    update_source(&state.pool, id, &source).await
}

#[tauri::command]
pub async fn delete_diagram(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn set_diagram_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Diagram> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_diagram_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Diagram> {
    set_archived(&state.pool, id, archived).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_fetch() {
        let pool = test_pool().await;
        let d = create(&pool, "System flow").await.unwrap();
        assert_eq!(d.title, "System flow");
        assert_eq!(d.source, "");
        assert!(!d.pinned);
        assert!(!d.archived);
        let got = by_id(&pool, d.id).await.unwrap();
        assert_eq!(got.id, d.id);
    }

    #[tokio::test]
    async fn rejects_empty_title() {
        let pool = test_pool().await;
        let err = create(&pool, "   ").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn update_source_and_rename() {
        let pool = test_pool().await;
        let d = create(&pool, "x").await.unwrap();
        let s = update_source(&pool, d.id, "graph TD; A-->B")
            .await
            .unwrap();
        assert_eq!(s.source, "graph TD; A-->B");
        let r = rename(&pool, d.id, "y").await.unwrap();
        assert_eq!(r.title, "y");
    }

    #[tokio::test]
    async fn pin_and_archive() {
        let pool = test_pool().await;
        let d = create(&pool, "x").await.unwrap();
        let pinned = set_pinned(&pool, d.id, true).await.unwrap();
        assert!(pinned.pinned);
        let archived = set_archived(&pool, d.id, true).await.unwrap();
        assert!(archived.archived);
    }

    #[tokio::test]
    async fn list_excludes_nothing_but_orders_recent_first() {
        let pool = test_pool().await;
        let _a = create(&pool, "first").await.unwrap();
        let b = create(&pool, "second").await.unwrap();
        let rows = all(&pool).await.unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, b.id);
    }

    #[tokio::test]
    async fn delete_removes() {
        let pool = test_pool().await;
        let d = create(&pool, "x").await.unwrap();
        delete(&pool, d.id).await.unwrap();
        let err = by_id(&pool, d.id).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
