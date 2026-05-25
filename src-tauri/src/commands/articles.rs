use crate::commands::AppState;
use crate::db::models::{Article, ArticleSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn all(pool: &SqlitePool) -> AppResult<Vec<ArticleSummary>> {
    sqlx::query_as::<_, ArticleSummary>(
        "SELECT id, title, pinned, archived, updated_at FROM articles
          ORDER BY updated_at DESC, id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<Article> {
    sqlx::query_as::<_, Article>("SELECT * FROM articles WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("article {id}")))
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<Article> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Article>(
        "INSERT INTO articles (title, body, pinned, created_at, updated_at)
         VALUES (?1, '', 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Article> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Article>(
        "UPDATE articles SET title = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("article {id}")))
}

pub(crate) async fn update_body(pool: &SqlitePool, id: i64, body: &str) -> AppResult<Article> {
    sqlx::query_as::<_, Article>(
        "UPDATE articles SET body = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(body)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("article {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM articles WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("article {id}")));
    }
    Ok(())
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Article> {
    sqlx::query_as::<_, Article>(
        "UPDATE articles SET pinned = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("article {id}")))
}

pub(crate) async fn set_archived(pool: &SqlitePool, id: i64, archived: bool) -> AppResult<Article> {
    sqlx::query_as::<_, Article>(
        "UPDATE articles SET archived = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("article {id}")))
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_articles(state: State<'_, AppState>) -> AppResult<Vec<ArticleSummary>> {
    all(&state.pool).await
}

#[tauri::command]
pub async fn article_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Article> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn create_article(state: State<'_, AppState>, title: String) -> AppResult<Article> {
    create(&state.pool, &title).await
}

#[tauri::command]
pub async fn rename_article(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Article> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn update_article_body(
    state: State<'_, AppState>,
    id: i64,
    body: String,
) -> AppResult<Article> {
    update_body(&state.pool, id, &body).await
}

#[tauri::command]
pub async fn delete_article(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn set_article_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Article> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_article_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Article> {
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
        let a = create(&pool, "Sprint planning").await.unwrap();
        assert_eq!(a.title, "Sprint planning");
        assert_eq!(a.body, "");
        assert!(!a.pinned);
        let got = by_id(&pool, a.id).await.unwrap();
        assert_eq!(got.id, a.id);
    }

    #[tokio::test]
    async fn rejects_empty_title() {
        let pool = test_pool().await;
        let err = create(&pool, "   ").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn update_body_and_rename() {
        let pool = test_pool().await;
        let a = create(&pool, "x").await.unwrap();
        let b = update_body(&pool, a.id, "# hello").await.unwrap();
        assert_eq!(b.body, "# hello");
        let r = rename(&pool, a.id, "y").await.unwrap();
        assert_eq!(r.title, "y");
    }

    #[tokio::test]
    async fn pin_and_unpin() {
        let pool = test_pool().await;
        let a = create(&pool, "x").await.unwrap();
        let pinned = set_pinned(&pool, a.id, true).await.unwrap();
        assert!(pinned.pinned);
        let unpinned = set_pinned(&pool, a.id, false).await.unwrap();
        assert!(!unpinned.pinned);
    }

    #[tokio::test]
    async fn delete_removes() {
        let pool = test_pool().await;
        let a = create(&pool, "x").await.unwrap();
        delete(&pool, a.id).await.unwrap();
        let err = by_id(&pool, a.id).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }
}
