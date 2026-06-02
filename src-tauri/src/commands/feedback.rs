use crate::commands::AppState;
use crate::db::models::{
    FeedbackBoard, FeedbackBoardSummary, FeedbackCard, FeedbackCardComment, FeedbackCardSummary,
    FeedbackColumn,
};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

// Columns seeded for every new board. After creation they're fully editable
// (rename / add / remove) per board — see the column commands below.
const DEFAULT_COLUMNS: &[&str] = &["To Implement", "In Definition", "In Progress", "Done"];

// ============================================================
// Boards
// ============================================================

pub(crate) async fn list_boards(
    pool: &SqlitePool,
    include_archived: bool,
) -> AppResult<Vec<FeedbackBoardSummary>> {
    sqlx::query_as::<_, FeedbackBoardSummary>(
        "SELECT b.id, b.title, b.archived, b.pinned,
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
    let mut tx = pool.begin().await?;
    let board = sqlx::query_as::<_, FeedbackBoard>(
        "INSERT INTO feedback_boards (title, archived, pinned, created_at, updated_at)
         VALUES (?1, 0, 0, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .fetch_one(&mut *tx)
    .await?;
    // Seed the default columns.
    for (i, name) in DEFAULT_COLUMNS.iter().enumerate() {
        sqlx::query(
            "INSERT INTO feedback_columns (board_id, name, position, created_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
        )
        .bind(board.id)
        .bind(name)
        .bind(i as i64)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(board)
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

pub(crate) async fn set_board_pinned(
    pool: &SqlitePool,
    id: i64,
    pinned: bool,
) -> AppResult<FeedbackBoard> {
    sqlx::query_as::<_, FeedbackBoard>(
        "UPDATE feedback_boards SET pinned = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
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
// Columns
// ============================================================

pub(crate) async fn list_columns(
    pool: &SqlitePool,
    board_id: i64,
) -> AppResult<Vec<FeedbackColumn>> {
    sqlx::query_as::<_, FeedbackColumn>(
        "SELECT * FROM feedback_columns WHERE board_id = ?1 ORDER BY position ASC, id ASC",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_column(
    pool: &SqlitePool,
    board_id: i64,
    name: &str,
) -> AppResult<FeedbackColumn> {
    if name.trim().is_empty() {
        return Err(AppError::BadInput("column name cannot be empty".into()));
    }
    let next_pos: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(position) + 1, 0) FROM feedback_columns WHERE board_id = ?1")
            .bind(board_id)
            .fetch_one(pool)
            .await?;
    sqlx::query_as::<_, FeedbackColumn>(
        "INSERT INTO feedback_columns (board_id, name, position, created_at)
         VALUES (?1, ?2, ?3, datetime('now')) RETURNING *",
    )
    .bind(board_id)
    .bind(name.trim())
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename_column(
    pool: &SqlitePool,
    id: i64,
    name: &str,
) -> AppResult<FeedbackColumn> {
    if name.trim().is_empty() {
        return Err(AppError::BadInput("column name cannot be empty".into()));
    }
    sqlx::query_as::<_, FeedbackColumn>(
        "UPDATE feedback_columns SET name = ?1 WHERE id = ?2 RETURNING *",
    )
    .bind(name.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("feedback column {id}")))
}

/// Delete a column. Cards in it cascade-delete (the UI confirms first).
pub(crate) async fn delete_column(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM feedback_columns WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("feedback column {id}")));
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
        "SELECT c.id, c.board_id, c.column_id, c.title, c.description, c.color, c.position,
                (SELECT COUNT(*) FROM feedback_card_comments cc WHERE cc.card_id = c.id) AS comment_count,
                c.created_at, c.updated_at
           FROM feedback_cards c
          WHERE c.board_id = ?1
          ORDER BY c.column_id ASC, c.position ASC, c.id ASC",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_card(
    pool: &SqlitePool,
    column_id: i64,
    title: &str,
    description: &str,
) -> AppResult<FeedbackCard> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    // Resolve the board from the column (and validate the column exists).
    let board_id: i64 =
        sqlx::query_scalar("SELECT board_id FROM feedback_columns WHERE id = ?1")
            .bind(column_id)
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| AppError::NotFound(format!("feedback column {column_id}")))?;

    let next_pos: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM feedback_cards WHERE column_id = ?1",
    )
    .bind(column_id)
    .fetch_one(pool)
    .await?;

    sqlx::query_as::<_, FeedbackCard>(
        "INSERT INTO feedback_cards
            (board_id, column_id, title, description, color, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(board_id)
    .bind(column_id)
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
    let mut tx = pool.begin().await?;
    if let Some(t) = title {
        let t = t.trim();
        if t.is_empty() {
            return Err(AppError::BadInput("title cannot be empty".into()));
        }
        sqlx::query("UPDATE feedback_cards SET title = ?1, updated_at = datetime('now') WHERE id = ?2")
            .bind(t)
            .bind(id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(d) = description {
        sqlx::query(
            "UPDATE feedback_cards SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
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

/// Set (or clear, with None) a card's color.
pub(crate) async fn set_card_color(
    pool: &SqlitePool,
    id: i64,
    color: Option<&str>,
) -> AppResult<FeedbackCard> {
    sqlx::query_as::<_, FeedbackCard>(
        "UPDATE feedback_cards SET color = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(color)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("feedback card {id}")))
}

/// Move a card to a target column at a target position, keeping positions dense
/// (0..n-1) within each column.
pub(crate) async fn move_card(
    pool: &SqlitePool,
    id: i64,
    target_column_id: i64,
    target_position: i64,
) -> AppResult<FeedbackCard> {
    let mut tx = pool.begin().await?;

    let current = sqlx::query_as::<_, FeedbackCard>("SELECT * FROM feedback_cards WHERE id = ?1")
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("feedback card {id}")))?;

    let source_column = current.column_id;
    let source_position = current.position;
    let same_column = source_column == target_column_id;

    // 1. Close the gap in the source column.
    sqlx::query(
        "UPDATE feedback_cards SET position = position - 1, updated_at = datetime('now')
          WHERE column_id = ?1 AND position > ?2",
    )
    .bind(source_column)
    .bind(source_position)
    .execute(&mut *tx)
    .await?;

    // 2. Open room in the target column.
    let effective_target = if same_column && target_position > source_position {
        target_position - 1
    } else {
        target_position
    };
    sqlx::query(
        "UPDATE feedback_cards SET position = position + 1, updated_at = datetime('now')
          WHERE column_id = ?1 AND position >= ?2",
    )
    .bind(target_column_id)
    .bind(effective_target)
    .execute(&mut *tx)
    .await?;

    // 3. Place the card.
    let moved = sqlx::query_as::<_, FeedbackCard>(
        "UPDATE feedback_cards
            SET column_id = ?1, position = ?2, updated_at = datetime('now')
          WHERE id = ?3 RETURNING *",
    )
    .bind(target_column_id)
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
    sqlx::query(
        "UPDATE feedback_cards SET position = position - 1, updated_at = datetime('now')
          WHERE column_id = ?1 AND position > ?2",
    )
    .bind(current.column_id)
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
pub async fn set_feedback_board_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<FeedbackBoard> {
    set_board_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn delete_feedback_board(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_board(&state.pool, id).await
}

#[tauri::command]
pub async fn list_feedback_columns(
    state: State<'_, AppState>,
    board_id: i64,
) -> AppResult<Vec<FeedbackColumn>> {
    list_columns(&state.pool, board_id).await
}

#[tauri::command]
pub async fn create_feedback_column(
    state: State<'_, AppState>,
    board_id: i64,
    name: String,
) -> AppResult<FeedbackColumn> {
    create_column(&state.pool, board_id, &name).await
}

#[tauri::command]
pub async fn rename_feedback_column(
    state: State<'_, AppState>,
    id: i64,
    name: String,
) -> AppResult<FeedbackColumn> {
    rename_column(&state.pool, id, &name).await
}

#[tauri::command]
pub async fn delete_feedback_column(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_column(&state.pool, id).await
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
    column_id: i64,
    title: String,
    description: Option<String>,
) -> AppResult<FeedbackCard> {
    create_card(
        &state.pool,
        column_id,
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
pub async fn set_feedback_card_color(
    state: State<'_, AppState>,
    id: i64,
    color: Option<String>,
) -> AppResult<FeedbackCard> {
    set_card_color(&state.pool, id, color.as_deref()).await
}

#[tauri::command]
pub async fn move_feedback_card(
    state: State<'_, AppState>,
    id: i64,
    target_column_id: i64,
    target_position: i64,
) -> AppResult<FeedbackCard> {
    move_card(&state.pool, id, target_column_id, target_position).await
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

    /// Create a board and return (board, its column ids in seeded order).
    async fn board_with_cols(pool: &SqlitePool) -> (FeedbackBoard, Vec<i64>) {
        let b = create_board(pool, "b").await.unwrap();
        let cols = list_columns(pool, b.id).await.unwrap();
        let ids = cols.iter().map(|c| c.id).collect();
        (b, ids)
    }

    #[tokio::test]
    async fn create_board_seeds_default_columns() {
        let pool = test_pool().await;
        let b = create_board(&pool, "Feedback Mayo").await.unwrap();
        let cols = list_columns(&pool, b.id).await.unwrap();
        assert_eq!(cols.len(), 4);
        assert_eq!(cols[0].name, "To Implement");
        assert_eq!(cols[3].name, "Done");
    }

    #[tokio::test]
    async fn create_card_appends_position() {
        let pool = test_pool().await;
        let (_b, cols) = board_with_cols(&pool).await;
        let c = create_card(&pool, cols[0], "Coffee meetings", "ask manager")
            .await
            .unwrap();
        assert_eq!(c.column_id, cols[0]);
        assert_eq!(c.position, 0);
        let c2 = create_card(&pool, cols[0], "Mentorship", "").await.unwrap();
        assert_eq!(c2.position, 1);
    }

    #[tokio::test]
    async fn move_card_within_column_reorders() {
        let pool = test_pool().await;
        let (b, cols) = board_with_cols(&pool).await;
        let a = create_card(&pool, cols[0], "A", "").await.unwrap();
        let bb = create_card(&pool, cols[0], "B", "").await.unwrap();
        let c = create_card(&pool, cols[0], "C", "").await.unwrap();
        assert_eq!((a.position, bb.position, c.position), (0, 1, 2));

        let moved = move_card(&pool, a.id, cols[0], 2).await.unwrap();
        assert_eq!(moved.position, 1);

        let cards = list_cards(&pool, b.id).await.unwrap();
        let mut sorted: Vec<_> = cards.iter().map(|c| (c.id, c.position)).collect();
        sorted.sort_by_key(|x| x.1);
        assert_eq!(sorted, vec![(bb.id, 0), (a.id, 1), (c.id, 2)]);
    }

    #[tokio::test]
    async fn move_card_across_columns_reorders_both() {
        let pool = test_pool().await;
        let (b, cols) = board_with_cols(&pool).await;
        let a = create_card(&pool, cols[0], "A", "").await.unwrap();
        let bb = create_card(&pool, cols[0], "B", "").await.unwrap();
        let x = create_card(&pool, cols[2], "X", "").await.unwrap();
        let y = create_card(&pool, cols[2], "Y", "").await.unwrap();

        let moved = move_card(&pool, a.id, cols[2], 1).await.unwrap();
        assert_eq!(moved.column_id, cols[2]);
        assert_eq!(moved.position, 1);

        let cards = list_cards(&pool, b.id).await.unwrap();
        let by_col = |col: i64| -> Vec<(i64, i64)> {
            let mut v: Vec<_> = cards
                .iter()
                .filter(|c| c.column_id == col)
                .map(|c| (c.id, c.position))
                .collect();
            v.sort_by_key(|x| x.1);
            v
        };
        assert_eq!(by_col(cols[0]), vec![(bb.id, 0)]);
        assert_eq!(by_col(cols[2]), vec![(x.id, 0), (a.id, 1), (y.id, 2)]);
    }

    #[tokio::test]
    async fn delete_card_closes_gap() {
        let pool = test_pool().await;
        let (b, cols) = board_with_cols(&pool).await;
        let a = create_card(&pool, cols[3], "A", "").await.unwrap();
        let bb = create_card(&pool, cols[3], "B", "").await.unwrap();
        let c = create_card(&pool, cols[3], "C", "").await.unwrap();
        delete_card(&pool, bb.id).await.unwrap();
        let cards = list_cards(&pool, b.id).await.unwrap();
        let mut sorted: Vec<_> = cards.iter().map(|c| (c.id, c.position)).collect();
        sorted.sort_by_key(|x| x.1);
        assert_eq!(sorted, vec![(a.id, 0), (c.id, 1)]);
    }

    #[tokio::test]
    async fn custom_columns_crud() {
        let pool = test_pool().await;
        let b = create_board(&pool, "b").await.unwrap();
        let col = create_column(&pool, b.id, "Backlog").await.unwrap();
        assert_eq!(col.position, 4); // after the 4 defaults
        let renamed = rename_column(&pool, col.id, "Icebox").await.unwrap();
        assert_eq!(renamed.name, "Icebox");
        // Deleting a column cascades its cards.
        create_card(&pool, col.id, "x", "").await.unwrap();
        delete_column(&pool, col.id).await.unwrap();
        let cols = list_columns(&pool, b.id).await.unwrap();
        assert_eq!(cols.len(), 4);
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_cards")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn set_color_round_trip() {
        let pool = test_pool().await;
        let (_b, cols) = board_with_cols(&pool).await;
        let c = create_card(&pool, cols[0], "x", "").await.unwrap();
        assert!(c.color.is_none());
        let colored = set_card_color(&pool, c.id, Some("blue")).await.unwrap();
        assert_eq!(colored.color.as_deref(), Some("blue"));
        let cleared = set_card_color(&pool, c.id, None).await.unwrap();
        assert!(cleared.color.is_none());
    }

    #[tokio::test]
    async fn comments_round_trip() {
        let pool = test_pool().await;
        let (_b, cols) = board_with_cols(&pool).await;
        let c = create_card(&pool, cols[0], "x", "").await.unwrap();
        add_comment(&pool, c.id, "first").await.unwrap();
        add_comment(&pool, c.id, "second").await.unwrap();
        let all = list_comments(&pool, c.id).await.unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].body, "first");
    }

    #[tokio::test]
    async fn deleting_board_cascades() {
        let pool = test_pool().await;
        let (b, cols) = board_with_cols(&pool).await;
        let c = create_card(&pool, cols[0], "x", "").await.unwrap();
        add_comment(&pool, c.id, "hello").await.unwrap();
        delete_board(&pool, b.id).await.unwrap();
        let cols_left: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_columns")
            .fetch_one(&pool)
            .await
            .unwrap();
        let comments: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feedback_card_comments")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(cols_left, 0);
        assert_eq!(comments, 0);
    }
}
