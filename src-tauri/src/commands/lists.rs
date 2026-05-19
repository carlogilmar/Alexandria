use crate::commands::AppState;
use crate::db::models::{List, ListSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn today(pool: &SqlitePool) -> AppResult<List> {
    let today: String = sqlx::query_scalar("SELECT date('now', 'localtime')")
        .fetch_one(pool)
        .await?;

    if let Some(existing) = sqlx::query_as::<_, List>(
        "SELECT * FROM lists WHERE date = ?1 AND archived = 0 ORDER BY id ASC LIMIT 1",
    )
    .bind(&today)
    .fetch_optional(pool)
    .await?
    {
        return Ok(existing);
    }

    create(pool, &today, &today).await
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<List> {
    sqlx::query_as::<_, List>("SELECT * FROM lists WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("list {id}")))
}

pub(crate) async fn all(
    pool: &SqlitePool,
    from: Option<&str>,
    to: Option<&str>,
    include_archived: bool,
) -> AppResult<Vec<ListSummary>> {
    sqlx::query_as::<_, ListSummary>(
        "SELECT l.id, l.title, l.date, l.archived, l.pinned,
                COUNT(t.id) AS total,
                COALESCE(SUM(t.completed), 0) AS done
           FROM lists l
           LEFT JOIN todos t ON t.list_id = l.id
          WHERE (?1 IS NULL OR l.date >= ?1)
            AND (?2 IS NULL OR l.date <= ?2)
            AND (?3 = 1 OR l.archived = 0)
          GROUP BY l.id
          ORDER BY l.date DESC, l.id DESC",
    )
    .bind(from)
    .bind(to)
    .bind(include_archived as i64)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create(pool: &SqlitePool, title: &str, date: &str) -> AppResult<List> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, List>(
        "INSERT INTO lists (title, date, archived, created_at, updated_at)
         VALUES (?1, ?2, 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .bind(date)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<List> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, List>(
        "UPDATE lists SET title = ?1, updated_at = datetime('now') WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("list {id}")))
}

pub(crate) async fn set_archived(pool: &SqlitePool, id: i64, archived: bool) -> AppResult<List> {
    sqlx::query_as::<_, List>(
        "UPDATE lists SET archived = ?1, updated_at = datetime('now') WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("list {id}")))
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<List> {
    sqlx::query_as::<_, List>(
        "UPDATE lists SET pinned = ?1, updated_at = datetime('now') WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("list {id}")))
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn list_today(state: State<'_, AppState>) -> AppResult<List> {
    today(&state.pool).await
}

#[tauri::command]
pub async fn list_by_id(state: State<'_, AppState>, id: i64) -> AppResult<List> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn list_all(
    state: State<'_, AppState>,
    from: Option<String>,
    to: Option<String>,
    include_archived: Option<bool>,
) -> AppResult<Vec<ListSummary>> {
    all(
        &state.pool,
        from.as_deref(),
        to.as_deref(),
        include_archived.unwrap_or(false),
    )
    .await
}

#[tauri::command]
pub async fn create_list(
    state: State<'_, AppState>,
    title: String,
    date: String,
) -> AppResult<List> {
    create(&state.pool, &title, &date).await
}

#[tauri::command]
pub async fn rename_list(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<List> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn archive_list(state: State<'_, AppState>, id: i64) -> AppResult<List> {
    set_archived(&state.pool, id, true).await
}

#[tauri::command]
pub async fn restore_list(state: State<'_, AppState>, id: i64) -> AppResult<List> {
    set_archived(&state.pool, id, false).await
}

#[tauri::command]
pub async fn set_list_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<List> {
    set_pinned(&state.pool, id, pinned).await
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_fetch() {
        let pool = test_pool().await;
        let list = create(&pool, "Monday plan", "2026-05-10").await.unwrap();
        assert_eq!(list.title, "Monday plan");
        assert_eq!(list.date, "2026-05-10");
        assert!(!list.archived);

        let fetched = by_id(&pool, list.id).await.unwrap();
        assert_eq!(fetched.id, list.id);
    }

    #[tokio::test]
    async fn rejects_empty_title() {
        let pool = test_pool().await;
        let err = create(&pool, "   ", "2026-05-10").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn today_is_idempotent() {
        let pool = test_pool().await;
        let a = today(&pool).await.unwrap();
        let b = today(&pool).await.unwrap();
        assert_eq!(a.id, b.id, "list_today should reuse existing list");
    }

    #[tokio::test]
    async fn archive_and_restore() {
        let pool = test_pool().await;
        let l = create(&pool, "A", "2026-05-01").await.unwrap();
        let archived = set_archived(&pool, l.id, true).await.unwrap();
        assert!(archived.archived);
        let restored = set_archived(&pool, l.id, false).await.unwrap();
        assert!(!restored.archived);
    }

    #[tokio::test]
    async fn rename_changes_title() {
        let pool = test_pool().await;
        let l = create(&pool, "Old", "2026-05-01").await.unwrap();
        let renamed = rename(&pool, l.id, "New").await.unwrap();
        assert_eq!(renamed.title, "New");
    }

    #[tokio::test]
    async fn all_excludes_archived_by_default() {
        let pool = test_pool().await;
        let a = create(&pool, "Keep", "2026-05-09").await.unwrap();
        let b = create(&pool, "Hide", "2026-05-08").await.unwrap();
        set_archived(&pool, b.id, true).await.unwrap();

        let visible = all(&pool, None, None, false).await.unwrap();
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0].id, a.id);

        let everything = all(&pool, None, None, true).await.unwrap();
        assert_eq!(everything.len(), 2);
    }

    #[tokio::test]
    async fn all_respects_date_range() {
        let pool = test_pool().await;
        create(&pool, "early", "2026-04-30").await.unwrap();
        let mid = create(&pool, "mid", "2026-05-05").await.unwrap();
        create(&pool, "late", "2026-05-15").await.unwrap();

        let in_range = all(&pool, Some("2026-05-01"), Some("2026-05-10"), false)
            .await
            .unwrap();
        assert_eq!(in_range.len(), 1);
        assert_eq!(in_range[0].id, mid.id);
    }
}
