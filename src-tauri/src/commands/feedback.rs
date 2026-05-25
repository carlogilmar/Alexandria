use crate::commands::AppState;
use crate::db::models::{
    FeedbackBoard, FeedbackBoardSummary, FeedbackCard, FeedbackCardComment, FeedbackCardSummary,
};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

const VALID_COLUMNS: &[&str] = &["to_implement", "in_definition", "in_progress", "done"];

fn validate_column(column: &str) -> AppResult<()> {
    if !VALID_COLUMNS.contains(&column) {
        return Err(AppError::BadInput(format!("invalid column: {column}")));
    }
    Ok(())
}

// ============================================================
// Boards
// ============================================================

pub(crate) async fn list_boards(
    pool: &SqlitePool,
    include_archived: bool,
) -> AppResult<Vec<FeedbackBoardSummary>> {
    sqlx::query_as::<_, FeedbackBoardSummary>(
        "SELECT b.id, b.title, b.archived,
                (SELECT COUNT(*) FROM feedback_cards c WHERE c.board_id = b.id) AS card_count,
                b.updated_at
           FROM feedback_boards b
          WHERE (?1 = 1 OR b.archived = 0)
          ORDER BY b.updated_at DESC, b.id DESC",
    )
    .bind(include_archived as i64)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_board(pool: &SqlitePool, title: &str) -> AppResult<FeedbackBoard> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, FeedbackBoard>(
        "INSERT INTO feedback_boards (title, archived, created_at, updated_at)
         VALUES (?1, 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename_board(
    pool: &SqlitePool,
    id: i64,
    title: &str,
) -> AppResult<FeedbackBoard> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, FeedbackBoard>(
        "UPDATE feedback_boards SET title = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("feedback board {id}")))
}

pub(crate) async fn set_board_archived(
    pool: &SqlitePool,
    id: i64,
    archived: bool,
) -> AppResult<FeedbackBoard> {
    sqlx::query_as::<_, FeedbackBoard>(
        "UPDATE feedback_boards SET archived = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("feedback board {id}")))
}

pub(crate) async fn delete_board(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM feedback_boards WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("feedback board {id}")));
    }
    Ok(())
}

// ============================================================
// Cards
// ============================================================

pub(crate) async fn list_cards(
    pool: &SqlitePool,
    board_id: i64,
) -> AppResult<Vec<FeedbackCardSummary>> {
    sqlx::query_as::<_, FeedbackCardSummary>(
        "SELECT c.id, c.board_id, c.column_kind, c.title, c.description, c.position,
                (SELECT COUNT(*) FROM feedback_card_comments cc WHERE cc.card_id = c.id) AS comment_count,
                c.created_at, c.updated_at
           FROM feedback_cards c
          WHERE c.board_id = ?1
          ORDER BY c.column_kind ASC, c.position ASC, c.id ASC",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_card(
    pool: &SqlitePool,
    board_id: i64,
    column_kind: &str,
    title: &str,
    description: &str,
) -> AppResult<FeedbackCard> {
    validate_column(column_kind)?;
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    // Append: next position in the target column.
    let next_pos: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM feedback_cards
          WHERE board_id = ?1 AND column_kind = ?2",
    )
    .bind(board_id)
    .bind(column_kind)
    .fetch_one(pool)
    .await?;

    sqlx::query_as::<_, FeedbackCard>(
        "INSERT INTO feedback_cards
            (board_id, column_kind, title, description, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(board_id)
    .bind(column_kind)
    .bind(title.trim())
    .bind(description)
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_card(
    pool: &SqlitePool,
    id: i64,
    title: Option<&str>,
    description: Option<&str>,
) -> AppResult<FeedbackCard> {
    // Two optional fields — we do two conditional updates inside a transaction
    // and then read the row back. Empty title in update is rejected.
    let mut tx = pool.begin().await?;

    if let Some(t) = title {
        let t = t.trim();
        if t.is_empty() {
            return Err(AppError::BadInput("title cannot be empty".into()));
        }
        sqlx::query(
            "UPDATE feedback_cards SET title = ?1, updated_at = datetime('now')
               WHERE id = ?2",
        )
        .bind(t)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    if let Some(d) = description {
        sqlx::query(
            "UPDATE feedback_cards SET description = ?1, updated_at = datetime('now')
               WHERE id = ?2",
        )
        .bind(d)
        .bind(id)
        .execute(&mut *tx)
        .await?;
    }
    let row = sqlx::query_as::<_, FeedbackCard>("SELECT * FROM feedback_cards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("feedback card {id}")))?;
    tx.commit().await?;
    Ok(row)
}

/// Move a card to a target column at a target position. Rewrites positions
/// in source and destination columns inside a single transaction so the
/// invariant "positions are dense 0..n-1 per (board, column)" holds.
pub(crate) async fn move_card(
    pool: &SqlitePool,
    id: i64,
    target_column: &str,
    target_position: i64,
) -> AppResult<FeedbackCard> {
    validate_column(target_column)?;
    let mut tx = pool.begin().await?;

    let current = sqlx::query_as::<_, FeedbackCard>("SELECT * FROM feedback_cards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("feedback card {id}")))?;

    let source_column = current.column_kind.clone();
    let source_position = current.position;
    let board_id = current.board_id;
    let same_column = source_column == target_column;

    // 1. Pull the card out of its current spot by closing the gap.
    sqlx::query(
        "UPDATE feedback_cards
            SET position = position - 1, updated_at = datetime('now')
          WHERE board_id = ?1 AND column_kind = ?2 AND position > ?3",
    )
    .bind(board_id)
    .bind(&source_column)
    .bind(source_position)
    .execute(&mut *tx)
    .await?;

    // 2. Make room in the target column at target_position.
    //    If moving within the same column, account for the just-closed gap.
    let effective_target = if same_column && target_position > source_position {
        target_position - 1
    } else {
        target_position
    };
    sqlx::query(
        "UPDATE feedback_cards
            SET position = position + 1, updated_at = datetime('now')
          WHERE board_id = ?1 AND column_kind = ?2 AND position >= ?3",
    )
    .bind(board_id)
    .bind(target_column)
    .bind(effective_target)
    .execute(&mut *tx)
    .await?;

    // 3. Place the card.
    let moved = sqlx::query_as::<_, FeedbackCard>(
        "UPDATE feedback_cards
            SET column_kind = ?1, position = ?2, updated_at = datetime('now')
          WHERE id = ?3 RETURNING *",
    )
    .bind(target_column)
    .bind(effective_target)
    .bind(id)
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(moved)
}

pub(crate) async fn delete_card(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    let current = sqlx::query_as::<_, FeedbackCard>("SELECT * FROM feedback_cards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("feedback card {id}")))?;
    sqlx::query("DELETE FROM feedback_cards WHERE id = ?1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    // Close the gap left behind.
    sqlx::query(
        "UPDATE feedback_cards
            SET position = position - 1, updated_at = datetime('now')
          WHERE board_id = ?1 AND column_kind = ?2 AND position > ?3",
    )
    .bind(current.board_id)
    .bind(&current.column_kind)
    .bind(current.position)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

// ============================================================
// Comments
// ============================================================

pub(crate) async fn list_comments(
    pool: &SqlitePool,
    card_id: i64,
) -> AppResult<Vec<FeedbackCardComment>> {
    sqlx::query_as::<_, FeedbackCardComment>(
        "SELECT * FROM feedback_card_comments WHERE card_id = ?1 ORDER BY created_at ASC, id ASC",
    )
    .bind(card_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn add_comment(
    pool: &SqlitePool,
    card_id: i64,
    body: &str,
) -> AppResult<FeedbackCardComment> {
    if body.trim().is_empty() {
        return Err(AppError::BadInput("comment cannot be empty".into()));
    }
    sqlx::query_as::<_, FeedbackCardComment>(
        "INSERT INTO feedback_card_comments (card_id, body, created_at)
         VALUES (?1, ?2, datetime('now'))
         RETURNING *",
    )
    .bind(card_id)
    .bind(body.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn delete_comment(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM feedback_card_comments WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("feedback comment {id}")));
    }
    Ok(())
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_feedback_boards(
    state: State<'_, AppState>,
    include_archived: Option<bool>,
) -> AppResult<Vec<FeedbackBoardSummary>> {
    list_boards(&state.pool, include_archived.unwrap_or(false)).await
}

#[tauri::command]
pub async fn create_feedback_board(
    state: State<'_, AppState>,
    title: String,
) -> AppResult<FeedbackBoard> {
    create_board(&state.pool, &title).await
}

#[tauri::command]
pub async fn rename_feedback_board(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<FeedbackBoard> {
    rename_board(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn set_feedback_board_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<FeedbackBoard> {
    set_board_archived(&state.pool, id, archived).await
}

#[tauri::command]
pub async fn delete_feedback_board(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_board(&state.pool, id).await
}

#[tauri::command]
pub async fn list_feedback_cards(
    state: State<'_, AppState>,
    board_id: i64,
) -> AppResult<Vec<FeedbackCardSummary>> {
    list_cards(&state.pool, board_id).await
}

#[tauri::command]
pub async fn create_feedback_card(
    state: State<'_, AppState>,
    board_id: i64,
    column_kind: String,
    title: String,
    description: Option<String>,
) -> AppResult<FeedbackCard> {
    create_card(
        &state.pool,
        board_id,
        &column_kind,
        &title,
        description.as_deref().unwrap_or(""),
    )
    .await
}

#[tauri::command]
pub async fn update_feedback_card(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    description: Option<String>,
) -> AppResult<FeedbackCard> {
    update_card(&state.pool, id, title.as_deref(), description.as_deref()).await
}

#[tauri::command]
pub async fn move_feedback_card(
    state: State<'_, AppState>,
    id: i64,
    target_column: String,
    target_position: i64,
) -> AppResult<FeedbackCard> {
    move_card(&state.pool, id, &target_column, target_position).await
}

#[tauri::command]
pub async fn delete_feedback_card(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_card(&state.pool, id).await
}

#[tauri::command]
pub async fn list_feedback_card_comments(
    state: State<'_, AppState>,
    card_id: i64,
) -> AppResult<Vec<FeedbackCardComment>> {
    list_comments(&state.pool, card_id).await
}

#[tauri::command]
pub async fn add_feedback_card_comment(
    state: State<'_, AppState>,
    card_id: i64,
    body: String,
) -> AppResult<FeedbackCardComment> {
    add_comment(&state.pool, card_id, &body).await
}

#[tauri::command]
pub async fn delete_feedback_card_comment(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_comment(&state.pool, id).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_board_and_card() {
        let pool = test_pool().await;
        let b = create_board(&pool, "Feedback Mayo").await.unwrap();
        let c = create_card(&pool, b.id, "to_implement", "Coffee meetings", "ask manager")
            .await
            .unwrap();
        assert_eq!(c.column_kind, "to_implement");
        assert_eq!(c.position, 0);

        let c2 = create_card(&pool, b.id, "to_implement", "Mentorship", "")
            .await
            .unwrap();
        assert_eq!(c2.position, 1);
    }

    #[tokio::test]
    async fn move_card_within_column_reorders() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let a = create_card(&pool, b.id, "to_implement", "A", "").await.unwrap();
        let bb = create_card(&pool, b.id, "to_implement", "B", "").await.unwrap();
        let c = create_card(&pool, b.id, "to_implement", "C", "").await.unwrap();
        assert_eq!((a.position, bb.position, c.position), (0, 1, 2));

        // Move A to position 2 (end). Within-column: effective_target = 2 - 1 = 1
        // because we're moving forward inside the same column.
        let moved = move_card(&pool, a.id, "to_implement", 2).await.unwrap();
        assert_eq!(moved.position, 1);

        let cards = list_cards(&pool, b.id).await.unwrap();
        let mut sorted: Vec<_> = cards.iter().map(|c| (c.id, c.position)).collect();
        sorted.sort_by_key(|x| x.1);
        // After move, expected order (id, position):
        // B at 0, A at 1, C at 2
        assert_eq!(sorted, vec![(bb.id, 0), (a.id, 1), (c.id, 2)]);
    }

    #[tokio::test]
    async fn move_card_across_columns_reorders_both() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let a = create_card(&pool, b.id, "to_implement", "A", "").await.unwrap();
        let bb = create_card(&pool, b.id, "to_implement", "B", "").await.unwrap();
        let x = create_card(&pool, b.id, "in_progress", "X", "").await.unwrap();
        let y = create_card(&pool, b.id, "in_progress", "Y", "").await.unwrap();

        // Move A → in_progress at position 1 (between X and Y).
        let moved = move_card(&pool, a.id, "in_progress", 1).await.unwrap();
        assert_eq!(moved.column_kind, "in_progress");
        assert_eq!(moved.position, 1);

        let cards = list_cards(&pool, b.id).await.unwrap();
        let by_col = |col: &str| -> Vec<(i64, i64)> {
            let mut v: Vec<_> = cards
                .iter()
                .filter(|c| c.column_kind == col)
                .map(|c| (c.id, c.position))
                .collect();
            v.sort_by_key(|x| x.1);
            v
        };
        assert_eq!(by_col("to_implement"), vec![(bb.id, 0)]);
        assert_eq!(by_col("in_progress"), vec![(x.id, 0), (a.id, 1), (y.id, 2)]);
    }

    #[tokio::test]
    async fn delete_card_closes_gap() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let a = create_card(&pool, b.id, "done", "A", "").await.unwrap();
        let bb = create_card(&pool, b.id, "done", "B", "").await.unwrap();
        let c = create_card(&pool, b.id, "done", "C", "").await.unwrap();
        delete_card(&pool, bb.id).await.unwrap();
        let cards = list_cards(&pool, b.id).await.unwrap();
        let mut sorted: Vec<_> = cards.iter().map(|c| (c.id, c.position)).collect();
        sorted.sort_by_key(|x| x.1);
        assert_eq!(sorted, vec![(a.id, 0), (c.id, 1)]);
    }

    #[tokio::test]
    async fn rejects_invalid_column() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let err = create_card(&pool, b.id, "todo", "x", "").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn comments_round_trip() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let c = create_card(&pool, b.id, "to_implement", "x", "").await.unwrap();
        add_comment(&pool, c.id, "first").await.unwrap();
        add_comment(&pool, c.id, "second").await.unwrap();
        let all = list_comments(&pool, c.id).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].body, "first");
    }

    #[tokio::test]
    async fn deleting_board_cascades_cards_and_comments() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let c = create_card(&pool, b.id, "to_implement", "x", "").await.unwrap();
        add_comment(&pool, c.id, "hello").await.unwrap();
        delete_board(&pool, b.id).await.unwrap();
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_card_comments")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }
}
