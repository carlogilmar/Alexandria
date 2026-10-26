use crate::commands::AppState;
use crate::db::models::{HubMeta, HubPage, HubPagePatch};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

pub(crate) async fn list(pool: &SqlitePool) -> AppResult<Vec<HubPage>> {
    sqlx::query_as::<_, HubPage>("SELECT * FROM hub_pages ORDER BY position ASC, id ASC")
        .fetch_all(pool)
        .await
        .map_err(Into::into)
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<HubPage> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadInput("tab title cannot be empty".into()));
    }
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM hub_pages")
            .fetch_one(pool)
            .await?;
    sqlx::query_as::<_, HubPage>(
        "INSERT INTO hub_pages (title, body, position, created_at, updated_at)
         VALUES (?1, '', ?2, datetime('now'), datetime('now')) RETURNING *",
    )
    .bind(title)
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update(
    pool: &SqlitePool,
    id: i64,
    patch: &HubPagePatch,
) -> AppResult<HubPage> {
    if let Some(t) = &patch.title {
        if t.trim().is_empty() {
            return Err(AppError::BadInput("tab title cannot be empty".into()));
        }
    }
    sqlx::query_as::<_, HubPage>(
        "UPDATE hub_pages SET
             title = COALESCE(?1, title),
             body  = COALESCE(?2, body),
             updated_at = datetime('now')
           WHERE id = ?3
       RETURNING *",
    )
    .bind(patch.title.as_deref().map(str::trim))
    .bind(patch.body.as_deref())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("hub page {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM hub_pages WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("hub page {id}")));
    }
    Ok(())
}

pub(crate) async fn reorder(pool: &SqlitePool, ordered_ids: &[i64]) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (idx, id) in ordered_ids.iter().enumerate() {
        sqlx::query("UPDATE hub_pages SET position = ?1 WHERE id = ?2")
            .bind(idx as i64)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub(crate) async fn meta(pool: &SqlitePool) -> AppResult<HubMeta> {
    sqlx::query_as::<_, HubMeta>("SELECT title, subtitle FROM hub_meta WHERE id = 1")
        .fetch_one(pool)
        .await
        .map_err(Into::into)
}

pub(crate) async fn set_meta(
    pool: &SqlitePool,
    title: &str,
    subtitle: &str,
) -> AppResult<HubMeta> {
    sqlx::query_as::<_, HubMeta>(
        "UPDATE hub_meta SET title = ?1, subtitle = ?2 WHERE id = 1 RETURNING title, subtitle",
    )
    .bind(title.trim())
    .bind(subtitle.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn list_hub_pages(state: State<'_, AppState>) -> AppResult<Vec<HubPage>> {
    list(&state.pool).await
}

#[tauri::command]
pub async fn create_hub_page(state: State<'_, AppState>, title: String) -> AppResult<HubPage> {
    create(&state.pool, &title).await
}

#[tauri::command]
pub async fn update_hub_page(
    state: State<'_, AppState>,
    id: i64,
    patch: HubPagePatch,
) -> AppResult<HubPage> {
    update(&state.pool, id, &patch).await
}

#[tauri::command]
pub async fn delete_hub_page(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn reorder_hub_pages(
    state: State<'_, AppState>,
    ordered_ids: Vec<i64>,
) -> AppResult<()> {
    reorder(&state.pool, &ordered_ids).await
}

#[tauri::command]
pub async fn get_hub_meta(state: State<'_, AppState>) -> AppResult<HubMeta> {
    meta(&state.pool).await
}

#[tauri::command]
pub async fn update_hub_meta(
    state: State<'_, AppState>,
    title: String,
    subtitle: String,
) -> AppResult<HubMeta> {
    set_meta(&state.pool, &title, &subtitle).await
}

// ---------- Tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_list_update_delete_roundtrip() {
        let pool = test_pool().await;
        let a = create(&pool, "Development").await.unwrap();
        let b = create(&pool, "Trainings").await.unwrap();
        assert_eq!(a.position, 0);
        assert_eq!(b.position, 1);

        let upd = update(
            &pool,
            a.id,
            &HubPagePatch { title: Some("Dev".into()), body: Some("# hi".into()) },
        )
        .await
        .unwrap();
        assert_eq!(upd.title, "Dev");
        assert_eq!(upd.body, "# hi");

        reorder(&pool, &[b.id, a.id]).await.unwrap();
        let pages = list(&pool).await.unwrap();
        assert_eq!(pages[0].id, b.id);

        delete(&pool, a.id).await.unwrap();
        assert_eq!(list(&pool).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn meta_defaults_and_updates() {
        let pool = test_pool().await;
        let m = meta(&pool).await.unwrap();
        assert!(!m.title.is_empty());
        let m2 = set_meta(&pool, "My Base", "sub").await.unwrap();
        assert_eq!(m2.title, "My Base");
        assert_eq!(m2.subtitle, "sub");
    }

    #[tokio::test]
    async fn empty_title_rejected() {
        let pool = test_pool().await;
        assert!(matches!(create(&pool, "  ").await.unwrap_err(), AppError::BadInput(_)));
    }
}
