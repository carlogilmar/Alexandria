use crate::commands::AppState;
use crate::db::models::{Flashcard, FlashcardCategory};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

// ============================================================
// Categories ("suits")
// ============================================================

pub(crate) async fn list_categories(pool: &SqlitePool) -> AppResult<Vec<FlashcardCategory>> {
    sqlx::query_as::<_, FlashcardCategory>(
        "SELECT * FROM flashcard_categories ORDER BY position ASC, id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_category(
    pool: &SqlitePool,
    name: &str,
    color: Option<&str>,
    icon: Option<&str>,
) -> AppResult<FlashcardCategory> {
    if name.trim().is_empty() {
        return Err(AppError::BadInput("category name cannot be empty".into()));
    }
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM flashcard_categories")
            .fetch_one(pool)
            .await?;
    sqlx::query_as::<_, FlashcardCategory>(
        "INSERT INTO flashcard_categories (name, color, icon, position, created_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now')) RETURNING *",
    )
    .bind(name.trim())
    .bind(color)
    .bind(icon)
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_category(
    pool: &SqlitePool,
    id: i64,
    name: Option<&str>,
    color: Option<&str>,
    icon: Option<&str>,
) -> AppResult<FlashcardCategory> {
    let mut tx = pool.begin().await?;
    if let Some(n) = name {
        if n.trim().is_empty() {
            return Err(AppError::BadInput("category name cannot be empty".into()));
        }
        sqlx::query("UPDATE flashcard_categories SET name = ?1 WHERE id = ?2")
            .bind(n.trim())
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(c) = color {
        sqlx::query("UPDATE flashcard_categories SET color = ?1 WHERE id = ?2")
            .bind(c)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(ic) = icon {
        sqlx::query("UPDATE flashcard_categories SET icon = ?1 WHERE id = ?2")
            .bind(ic)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let row =
        sqlx::query_as::<_, FlashcardCategory>("SELECT * FROM flashcard_categories WHERE id = ?1")
            .bind(id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("flashcard category {id}")))?;
    tx.commit().await?;
    Ok(row)
}

pub(crate) async fn delete_category(pool: &SqlitePool, id: i64) -> AppResult<()> {
    // Cards keep existing — their category_id is set NULL by the FK.
    let res = sqlx::query("DELETE FROM flashcard_categories WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("flashcard category {id}")));
    }
    Ok(())
}

// ============================================================
// Cards
// ============================================================

pub(crate) async fn list_cards(pool: &SqlitePool) -> AppResult<Vec<Flashcard>> {
    sqlx::query_as::<_, Flashcard>(
        "SELECT * FROM flashcards ORDER BY position ASC, id ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<Flashcard> {
    sqlx::query_as::<_, Flashcard>("SELECT * FROM flashcards WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("flashcard {id}")))
}

pub(crate) async fn create_card(pool: &SqlitePool, title: &str) -> AppResult<Flashcard> {
    let t = title.trim();
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM flashcards")
            .fetch_one(pool)
            .await?;
    sqlx::query_as::<_, Flashcard>(
        "INSERT INTO flashcards (title, body, position, created_at, updated_at)
         VALUES (?1, '', ?2, datetime('now'), datetime('now')) RETURNING *",
    )
    .bind(if t.is_empty() { "Untitled card" } else { t })
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_card(
    pool: &SqlitePool,
    id: i64,
    title: Option<&str>,
    body: Option<&str>,
) -> AppResult<Flashcard> {
    let mut tx = pool.begin().await?;
    if let Some(t) = title {
        let t = t.trim();
        if t.is_empty() {
            return Err(AppError::BadInput("title cannot be empty".into()));
        }
        sqlx::query("UPDATE flashcards SET title = ?1, updated_at = datetime('now') WHERE id = ?2")
            .bind(t)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(b) = body {
        sqlx::query("UPDATE flashcards SET body = ?1, updated_at = datetime('now') WHERE id = ?2")
            .bind(b)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    let row = sqlx::query_as::<_, Flashcard>("SELECT * FROM flashcards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("flashcard {id}")))?;
    tx.commit().await?;
    Ok(row)
}

/// Set one nullable metadata field by name. Dedicated setter so we can clear
/// (None → NULL) unambiguously.
async fn set_field(
    pool: &SqlitePool,
    id: i64,
    sql: &str,
    value: Option<&str>,
) -> AppResult<Flashcard> {
    sqlx::query(sql).bind(value).bind(id).execute(pool).await?;
    by_id(pool, id).await
}

pub(crate) async fn set_card_category(
    pool: &SqlitePool,
    id: i64,
    category_id: Option<i64>,
) -> AppResult<Flashcard> {
    sqlx::query(
        "UPDATE flashcards SET category_id = ?1, updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(category_id)
    .bind(id)
    .execute(pool)
    .await?;
    by_id(pool, id).await
}

pub(crate) async fn set_card_color(
    pool: &SqlitePool,
    id: i64,
    color: Option<&str>,
) -> AppResult<Flashcard> {
    set_field(
        pool,
        id,
        "UPDATE flashcards SET color = ?1, updated_at = datetime('now') WHERE id = ?2",
        color,
    )
    .await
}

pub(crate) async fn set_card_emoji(
    pool: &SqlitePool,
    id: i64,
    emoji: Option<&str>,
) -> AppResult<Flashcard> {
    set_field(
        pool,
        id,
        "UPDATE flashcards SET emoji = ?1, updated_at = datetime('now') WHERE id = ?2",
        emoji,
    )
    .await
}

pub(crate) async fn set_card_image(
    pool: &SqlitePool,
    id: i64,
    image_url: Option<&str>,
) -> AppResult<Flashcard> {
    set_field(
        pool,
        id,
        "UPDATE flashcards SET image_url = ?1, updated_at = datetime('now') WHERE id = ?2",
        image_url,
    )
    .await
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Flashcard> {
    sqlx::query("UPDATE flashcards SET pinned = ?1, updated_at = datetime('now') WHERE id = ?2")
        .bind(pinned as i64)
        .bind(id)
        .execute(pool)
        .await?;
    by_id(pool, id).await
}

pub(crate) async fn set_archived(
    pool: &SqlitePool,
    id: i64,
    archived: bool,
) -> AppResult<Flashcard> {
    sqlx::query("UPDATE flashcards SET archived = ?1, updated_at = datetime('now') WHERE id = ?2")
        .bind(archived as i64)
        .bind(id)
        .execute(pool)
        .await?;
    by_id(pool, id).await
}

/// Move a card to a target position in the deck, keeping positions dense.
pub(crate) async fn move_card(
    pool: &SqlitePool,
    id: i64,
    target_position: i64,
) -> AppResult<Flashcard> {
    let mut tx = pool.begin().await?;
    let current = sqlx::query_as::<_, Flashcard>("SELECT * FROM flashcards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("flashcard {id}")))?;
    let source = current.position;
    // Close gap at source.
    sqlx::query("UPDATE flashcards SET position = position - 1 WHERE position > ?1")
        .bind(source)
        .execute(&mut *tx)
        .await?;
    let target = if target_position > source {
        target_position - 1
    } else {
        target_position
    };
    // Open room at target.
    sqlx::query("UPDATE flashcards SET position = position + 1 WHERE position >= ?1")
        .bind(target)
        .execute(&mut *tx)
        .await?;
    let moved = sqlx::query_as::<_, Flashcard>(
        "UPDATE flashcards SET position = ?1, updated_at = datetime('now') WHERE id = ?2 RETURNING *",
    )
    .bind(target)
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(moved)
}

pub(crate) async fn delete_card(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let current = sqlx::query_as::<_, Flashcard>("SELECT * FROM flashcards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("flashcard {id}")))?;
    sqlx::query("DELETE FROM flashcards WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("UPDATE flashcards SET position = position - 1 WHERE position > ?1")
        .bind(current.position)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_flashcard_categories(
    state: State<'_, AppState>,
) -> AppResult<Vec<FlashcardCategory>> {
    list_categories(&state.pool).await
}

#[tauri::command]
pub async fn create_flashcard_category(
    state: State<'_, AppState>,
    name: String,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<FlashcardCategory> {
    create_category(&state.pool, &name, color.as_deref(), icon.as_deref()).await
}

#[tauri::command]
pub async fn update_flashcard_category(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    color: Option<String>,
    icon: Option<String>,
) -> AppResult<FlashcardCategory> {
    update_category(
        &state.pool,
        id,
        name.as_deref(),
        color.as_deref(),
        icon.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn delete_flashcard_category(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_category(&state.pool, id).await
}

#[tauri::command]
pub async fn list_flashcards(state: State<'_, AppState>) -> AppResult<Vec<Flashcard>> {
    list_cards(&state.pool).await
}

#[tauri::command]
pub async fn flashcard_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Flashcard> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn create_flashcard(state: State<'_, AppState>, title: String) -> AppResult<Flashcard> {
    create_card(&state.pool, &title).await
}

#[tauri::command]
pub async fn update_flashcard(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    body: Option<String>,
) -> AppResult<Flashcard> {
    update_card(&state.pool, id, title.as_deref(), body.as_deref()).await
}

#[tauri::command]
pub async fn set_flashcard_category(
    state: State<'_, AppState>,
    id: i64,
    category_id: Option<i64>,
) -> AppResult<Flashcard> {
    set_card_category(&state.pool, id, category_id).await
}

#[tauri::command]
pub async fn set_flashcard_color(
    state: State<'_, AppState>,
    id: i64,
    color: Option<String>,
) -> AppResult<Flashcard> {
    set_card_color(&state.pool, id, color.as_deref()).await
}

#[tauri::command]
pub async fn set_flashcard_emoji(
    state: State<'_, AppState>,
    id: i64,
    emoji: Option<String>,
) -> AppResult<Flashcard> {
    set_card_emoji(&state.pool, id, emoji.as_deref()).await
}

#[tauri::command]
pub async fn set_flashcard_image(
    state: State<'_, AppState>,
    id: i64,
    image_url: Option<String>,
) -> AppResult<Flashcard> {
    set_card_image(&state.pool, id, image_url.as_deref()).await
}

#[tauri::command]
pub async fn set_flashcard_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Flashcard> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_flashcard_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Flashcard> {
    set_archived(&state.pool, id, archived).await
}

#[tauri::command]
pub async fn move_flashcard(
    state: State<'_, AppState>,
    id: i64,
    target_position: i64,
) -> AppResult<Flashcard> {
    move_card(&state.pool, id, target_position).await
}

#[tauri::command]
pub async fn delete_flashcard(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_card(&state.pool, id).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_list_orders_by_position() {
        let pool = test_pool().await;
        let a = create_card(&pool, "A").await.unwrap();
        let b = create_card(&pool, "B").await.unwrap();
        assert_eq!((a.position, b.position), (0, 1));
        let all = list_cards(&pool).await.unwrap();
        assert_eq!(all.iter().map(|c| c.id).collect::<Vec<_>>(), vec![a.id, b.id]);
    }

    #[tokio::test]
    async fn move_reorders_densely() {
        let pool = test_pool().await;
        let a = create_card(&pool, "A").await.unwrap();
        let b = create_card(&pool, "B").await.unwrap();
        let c = create_card(&pool, "C").await.unwrap();
        // Move A to the end.
        move_card(&pool, a.id, 3).await.unwrap();
        let all = list_cards(&pool).await.unwrap();
        let order: Vec<_> = all.iter().map(|x| (x.id, x.position)).collect();
        assert_eq!(order, vec![(b.id, 0), (c.id, 1), (a.id, 2)]);
    }

    #[tokio::test]
    async fn delete_closes_gap() {
        let pool = test_pool().await;
        let a = create_card(&pool, "A").await.unwrap();
        let b = create_card(&pool, "B").await.unwrap();
        let c = create_card(&pool, "C").await.unwrap();
        delete_card(&pool, b.id).await.unwrap();
        let all = list_cards(&pool).await.unwrap();
        assert_eq!(
            all.iter().map(|x| (x.id, x.position)).collect::<Vec<_>>(),
            vec![(a.id, 0), (c.id, 1)]
        );
    }

    #[tokio::test]
    async fn category_setters_and_clear() {
        let pool = test_pool().await;
        let cat = create_category(&pool, "Strategy", Some("blue"), Some("♠"))
            .await
            .unwrap();
        let card = create_card(&pool, "x").await.unwrap();
        let withcat = set_card_category(&pool, card.id, Some(cat.id)).await.unwrap();
        assert_eq!(withcat.category_id, Some(cat.id));
        let colored = set_card_color(&pool, card.id, Some("violet")).await.unwrap();
        assert_eq!(colored.color.as_deref(), Some("violet"));
        let cleared = set_card_color(&pool, card.id, None).await.unwrap();
        assert!(cleared.color.is_none());
    }

    #[tokio::test]
    async fn deleting_category_nulls_card_link() {
        let pool = test_pool().await;
        let cat = create_category(&pool, "Risk", None, None).await.unwrap();
        let card = create_card(&pool, "x").await.unwrap();
        set_card_category(&pool, card.id, Some(cat.id)).await.unwrap();
        delete_category(&pool, cat.id).await.unwrap();
        let reloaded = by_id(&pool, card.id).await.unwrap();
        assert!(reloaded.category_id.is_none());
    }
}
