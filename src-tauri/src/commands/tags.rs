use crate::commands::AppState;
use crate::db::models::Tag;
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn all(pool: &SqlitePool) -> AppResult<Vec<Tag>> {
    sqlx::query_as::<_, Tag>("SELECT * FROM tags ORDER BY name ASC")
        .fetch_all(pool)
        .await
        .map_err(Into::into)
}

pub(crate) async fn for_todo(pool: &SqlitePool, todo_id: i64) -> AppResult<Vec<Tag>> {
    sqlx::query_as::<_, Tag>(
        "SELECT t.* FROM tags t
           JOIN todo_tags tt ON tt.tag_id = t.id
          WHERE tt.todo_id = ?1
          ORDER BY t.name ASC",
    )
    .bind(todo_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn add_to_todo(pool: &SqlitePool, todo_id: i64, name: &str) -> AppResult<Tag> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::BadInput("tag name cannot be empty".into()));
    }
    let mut tx = pool.begin().await?;
    sqlx::query("INSERT OR IGNORE INTO tags (name) VALUES (?1)")
        .bind(name)
        .execute(&mut *tx)
        .await?;
    let tag: Tag = sqlx::query_as("SELECT * FROM tags WHERE name = ?1")
        .bind(name)
        .fetch_one(&mut *tx)
        .await?;
    sqlx::query("INSERT OR IGNORE INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)")
        .bind(todo_id)
        .bind(tag.id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(tag)
}

pub(crate) async fn remove_from_todo(
    pool: &SqlitePool,
    todo_id: i64,
    tag_id: i64,
) -> AppResult<()> {
    sqlx::query("DELETE FROM todo_tags WHERE todo_id = ?1 AND tag_id = ?2")
        .bind(todo_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    all(&state.pool).await
}

#[tauri::command]
pub async fn tags_for_todo(state: State<'_, AppState>, todo_id: i64) -> AppResult<Vec<Tag>> {
    for_todo(&state.pool, todo_id).await
}

#[tauri::command]
pub async fn add_tag_to_todo(
    state: State<'_, AppState>,
    todo_id: i64,
    name: String,
) -> AppResult<Tag> {
    add_to_todo(&state.pool, todo_id, &name).await
}

#[tauri::command]
pub async fn remove_tag_from_todo(
    state: State<'_, AppState>,
    todo_id: i64,
    tag_id: i64,
) -> AppResult<()> {
    remove_from_todo(&state.pool, todo_id, tag_id).await
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::{lists, todos};
    use crate::db::test_pool;

    async fn fresh_todo(pool: &SqlitePool) -> i64 {
        let list = lists::create(pool, "t", "2026-05-10").await.unwrap();
        todos::create(pool, list.id, "todo").await.unwrap().id
    }

    #[tokio::test]
    async fn add_creates_and_links() {
        let pool = test_pool().await;
        let todo_id = fresh_todo(&pool).await;
        let tag = add_to_todo(&pool, todo_id, "home").await.unwrap();
        assert_eq!(tag.name, "home");

        let tags = for_todo(&pool, todo_id).await.unwrap();
        assert_eq!(tags.len(), 1);
        assert_eq!(tags[0].name, "home");
    }

    #[tokio::test]
    async fn add_is_idempotent() {
        let pool = test_pool().await;
        let todo_id = fresh_todo(&pool).await;
        let t1 = add_to_todo(&pool, todo_id, "home").await.unwrap();
        let t2 = add_to_todo(&pool, todo_id, "home").await.unwrap();
        assert_eq!(t1.id, t2.id, "same tag id reused");

        let tags = for_todo(&pool, todo_id).await.unwrap();
        assert_eq!(tags.len(), 1);

        let all_tags = all(&pool).await.unwrap();
        assert_eq!(all_tags.len(), 1);
    }

    #[tokio::test]
    async fn remove_unlinks_but_keeps_tag() {
        let pool = test_pool().await;
        let todo_id = fresh_todo(&pool).await;
        let tag = add_to_todo(&pool, todo_id, "home").await.unwrap();
        remove_from_todo(&pool, todo_id, tag.id).await.unwrap();

        assert!(for_todo(&pool, todo_id).await.unwrap().is_empty());
        assert_eq!(all(&pool).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn deleting_todo_unlinks_tags() {
        let pool = test_pool().await;
        let todo_id = fresh_todo(&pool).await;
        let tag = add_to_todo(&pool, todo_id, "home").await.unwrap();

        sqlx::query("DELETE FROM todos WHERE id = ?1")
            .bind(todo_id)
            .execute(&pool)
            .await
            .unwrap();

        let links: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM todo_tags WHERE tag_id = ?1")
                .bind(tag.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(links, 0);
    }

    #[tokio::test]
    async fn empty_tag_name_is_rejected() {
        let pool = test_pool().await;
        let todo_id = fresh_todo(&pool).await;
        let err = add_to_todo(&pool, todo_id, "   ").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }
}
