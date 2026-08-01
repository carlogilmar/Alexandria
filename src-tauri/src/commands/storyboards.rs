//! Storyboards (Sprint 43) — a sequence of pages, each a tiny canvas + a
//! markdown note. Structure mirrors `blueprints.rs`, with a `storyboard_pages`
//! layer: nodes/edges belong to a page, each page carries its own `note`.
//! Canvas mutations bump the storyboard's `updated_at`; note edits bump both.

use crate::commands::AppState;
use crate::db::models::{
    Storyboard, StoryboardEdge, StoryboardNode, StoryboardPage, StoryboardState, StoryboardSummary,
};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

const PAGE_COLS: &str = "id, storyboard_id, position, note, created_at, updated_at";
const NODE_COLS: &str =
    "id, page_id, kind, label, icon, color, content, x, y, width, height, created_at, updated_at";
const EDGE_COLS: &str =
    "id, page_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at";

// ---------- updated_at touching ----------

async fn touch(pool: &SqlitePool, storyboard_id: i64) -> AppResult<()> {
    sqlx::query("UPDATE storyboards SET updated_at = datetime('now') WHERE id = ?1")
        .bind(storyboard_id)
        .execute(pool)
        .await?;
    Ok(())
}
async fn touch_by_page(pool: &SqlitePool, page_id: i64) -> AppResult<()> {
    sqlx::query(
        "UPDATE storyboards SET updated_at = datetime('now')
         WHERE id = (SELECT storyboard_id FROM storyboard_pages WHERE id = ?1)",
    )
    .bind(page_id)
    .execute(pool)
    .await?;
    Ok(())
}
async fn touch_by_node(pool: &SqlitePool, node_id: i64) -> AppResult<()> {
    sqlx::query(
        "UPDATE storyboards SET updated_at = datetime('now')
         WHERE id = (SELECT p.storyboard_id FROM storyboard_pages p
                     JOIN storyboard_nodes n ON n.page_id = p.id WHERE n.id = ?1)",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ---------- storyboards (documents) ----------

pub(crate) async fn list(pool: &SqlitePool) -> AppResult<Vec<StoryboardSummary>> {
    sqlx::query_as::<_, StoryboardSummary>(
        "SELECT s.id, s.title, s.pinned, s.archived,
                (SELECT COUNT(*) FROM storyboard_pages p WHERE p.storyboard_id = s.id) AS page_count,
                s.updated_at
           FROM storyboards s
          ORDER BY s.updated_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<Storyboard> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    let sb = sqlx::query_as::<_, Storyboard>(
        "INSERT INTO storyboards (title, pinned, archived, created_at, updated_at)
         VALUES (?1, 0, 0, datetime('now'), datetime('now'))
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(title)
    .fetch_one(pool)
    .await?;
    // Seed a first empty page so the editor always has one.
    sqlx::query(
        "INSERT INTO storyboard_pages (storyboard_id, position, note, created_at, updated_at)
         VALUES (?1, 0, '', datetime('now'), datetime('now'))",
    )
    .bind(sb.id)
    .execute(pool)
    .await?;
    Ok(sb)
}

pub(crate) async fn get_state(pool: &SqlitePool, id: i64) -> AppResult<StoryboardState> {
    let storyboard = sqlx::query_as::<_, Storyboard>(
        "SELECT id, title, pinned, archived, created_at, updated_at FROM storyboards WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("storyboard {id}")))?;

    let pages = sqlx::query_as::<_, StoryboardPage>(&format!(
        "SELECT {PAGE_COLS} FROM storyboard_pages WHERE storyboard_id = ?1 ORDER BY position ASC, id ASC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    let nodes = sqlx::query_as::<_, StoryboardNode>(&format!(
        "SELECT {NODE_COLS} FROM storyboard_nodes
          WHERE page_id IN (SELECT id FROM storyboard_pages WHERE storyboard_id = ?1)
          ORDER BY id ASC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    let edges = sqlx::query_as::<_, StoryboardEdge>(&format!(
        "SELECT {EDGE_COLS} FROM storyboard_edges
          WHERE page_id IN (SELECT id FROM storyboard_pages WHERE storyboard_id = ?1)
          ORDER BY id ASC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;

    Ok(StoryboardState {
        storyboard,
        pages,
        nodes,
        edges,
    })
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Storyboard> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Storyboard>(
        "UPDATE storyboards SET title = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(title)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("storyboard {id}")))
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Storyboard> {
    sqlx::query_as::<_, Storyboard>(
        "UPDATE storyboards SET pinned = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("storyboard {id}")))
}

pub(crate) async fn set_archived(
    pool: &SqlitePool,
    id: i64,
    archived: bool,
) -> AppResult<Storyboard> {
    sqlx::query_as::<_, Storyboard>(
        "UPDATE storyboards SET archived = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("storyboard {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM storyboards WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("storyboard {id}")));
    }
    Ok(())
}

// ---------- pages ----------

pub(crate) async fn add_page(pool: &SqlitePool, storyboard_id: i64) -> AppResult<StoryboardPage> {
    let next: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM storyboard_pages WHERE storyboard_id = ?1",
    )
    .bind(storyboard_id)
    .fetch_one(pool)
    .await?;
    let page = sqlx::query_as::<_, StoryboardPage>(&format!(
        "INSERT INTO storyboard_pages (storyboard_id, position, note, created_at, updated_at)
         VALUES (?1, ?2, '', datetime('now'), datetime('now')) RETURNING {PAGE_COLS}"
    ))
    .bind(storyboard_id)
    .bind(next)
    .fetch_one(pool)
    .await?;
    touch(pool, storyboard_id).await?;
    Ok(page)
}

pub(crate) async fn delete_page(pool: &SqlitePool, page_id: i64) -> AppResult<()> {
    touch_by_page(pool, page_id).await?;
    let res = sqlx::query("DELETE FROM storyboard_pages WHERE id = ?1")
        .bind(page_id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("page {page_id}")));
    }
    Ok(())
}

pub(crate) async fn update_page_note(
    pool: &SqlitePool,
    page_id: i64,
    note: &str,
) -> AppResult<StoryboardPage> {
    let page = sqlx::query_as::<_, StoryboardPage>(&format!(
        "UPDATE storyboard_pages SET note = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {PAGE_COLS}"
    ))
    .bind(note)
    .bind(page_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("page {page_id}")))?;
    touch_by_page(pool, page_id).await?;
    Ok(page)
}

pub(crate) async fn reorder_pages(
    pool: &SqlitePool,
    storyboard_id: i64,
    ordered_ids: &[i64],
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (i, id) in ordered_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE storyboard_pages SET position = ?1 WHERE id = ?2 AND storyboard_id = ?3",
        )
        .bind(i as i64)
        .bind(id)
        .bind(storyboard_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    touch(pool, storyboard_id).await?;
    Ok(())
}

// ---------- nodes ----------

async fn insert_node(
    pool: &SqlitePool,
    page_id: i64,
    kind: &str,
    label: &str,
    icon: Option<&str>,
    content: Option<&str>,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "INSERT INTO storyboard_nodes (page_id, kind, label, icon, content, x, y, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
         RETURNING {NODE_COLS}"
    ))
    .bind(page_id)
    .bind(kind)
    .bind(label)
    .bind(icon)
    .bind(content)
    .bind(x)
    .bind(y)
    .fetch_one(pool)
    .await?;
    touch_by_page(pool, page_id).await?;
    Ok(node)
}

pub(crate) async fn update_node_label(
    pool: &SqlitePool,
    id: i64,
    label: &str,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET label = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(label)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn update_node_content(
    pool: &SqlitePool,
    id: i64,
    content: &str,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET content = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(content)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn set_node_icon(
    pool: &SqlitePool,
    id: i64,
    icon: Option<&str>,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET icon = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(icon)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn set_node_color(
    pool: &SqlitePool,
    id: i64,
    color: Option<&str>,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET color = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(color)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn move_node(
    pool: &SqlitePool,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET x = ?1, y = ?2, updated_at = datetime('now') WHERE id = ?3
         RETURNING {NODE_COLS}"
    ))
    .bind(x)
    .bind(y)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn resize_node(
    pool: &SqlitePool,
    id: i64,
    width: f64,
    height: f64,
) -> AppResult<StoryboardNode> {
    let node = sqlx::query_as::<_, StoryboardNode>(&format!(
        "UPDATE storyboard_nodes SET width = ?1, height = ?2, updated_at = datetime('now') WHERE id = ?3
         RETURNING {NODE_COLS}"
    ))
    .bind(width)
    .bind(height)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("node {id}")))?;
    touch_by_node(pool, id).await?;
    Ok(node)
}

pub(crate) async fn remove_node(pool: &SqlitePool, id: i64) -> AppResult<()> {
    touch_by_node(pool, id).await?;
    let res = sqlx::query("DELETE FROM storyboard_nodes WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("node {id}")));
    }
    Ok(())
}

// ---------- edges ----------

pub(crate) async fn add_edge(
    pool: &SqlitePool,
    page_id: i64,
    source_id: i64,
    target_id: i64,
    source_handle: Option<&str>,
    target_handle: Option<&str>,
) -> AppResult<StoryboardEdge> {
    if source_id == target_id {
        return Err(AppError::BadInput("cannot connect a node to itself".into()));
    }
    let edge = sqlx::query_as::<_, StoryboardEdge>(&format!(
        "INSERT INTO storyboard_edges
           (page_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, datetime('now'), datetime('now'))
         RETURNING {EDGE_COLS}"
    ))
    .bind(page_id)
    .bind(source_id)
    .bind(target_id)
    .bind(source_handle)
    .bind(target_handle)
    .fetch_one(pool)
    .await?;
    touch_by_page(pool, page_id).await?;
    Ok(edge)
}

pub(crate) async fn update_edge_label(
    pool: &SqlitePool,
    id: i64,
    label: Option<&str>,
) -> AppResult<StoryboardEdge> {
    sqlx::query_as::<_, StoryboardEdge>(&format!(
        "UPDATE storyboard_edges SET label = ?1, updated_at = datetime('now') WHERE id = ?2
         RETURNING {EDGE_COLS}"
    ))
    .bind(label)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("edge {id}")))
}

pub(crate) async fn remove_edge(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM storyboard_edges WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("edge {id}")));
    }
    Ok(())
}

// ---------- Tauri command surface ----------

#[tauri::command]
pub async fn list_storyboards(state: State<'_, AppState>) -> AppResult<Vec<StoryboardSummary>> {
    list(&state.pool).await
}
#[tauri::command]
pub async fn create_storyboard(state: State<'_, AppState>, title: String) -> AppResult<Storyboard> {
    create(&state.pool, &title).await
}
#[tauri::command]
pub async fn get_storyboard(state: State<'_, AppState>, id: i64) -> AppResult<StoryboardState> {
    get_state(&state.pool, id).await
}
#[tauri::command]
pub async fn rename_storyboard(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Storyboard> {
    rename(&state.pool, id, &title).await
}
#[tauri::command]
pub async fn set_storyboard_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Storyboard> {
    set_pinned(&state.pool, id, pinned).await
}
#[tauri::command]
pub async fn set_storyboard_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Storyboard> {
    set_archived(&state.pool, id, archived).await
}
#[tauri::command]
pub async fn delete_storyboard(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn add_storyboard_page(
    state: State<'_, AppState>,
    storyboard_id: i64,
) -> AppResult<StoryboardPage> {
    add_page(&state.pool, storyboard_id).await
}
#[tauri::command]
pub async fn delete_storyboard_page(state: State<'_, AppState>, page_id: i64) -> AppResult<()> {
    delete_page(&state.pool, page_id).await
}
#[tauri::command]
pub async fn update_storyboard_page_note(
    state: State<'_, AppState>,
    page_id: i64,
    note: String,
) -> AppResult<StoryboardPage> {
    update_page_note(&state.pool, page_id, &note).await
}
#[tauri::command]
pub async fn reorder_storyboard_pages(
    state: State<'_, AppState>,
    storyboard_id: i64,
    ordered_ids: Vec<i64>,
) -> AppResult<()> {
    reorder_pages(&state.pool, storyboard_id, &ordered_ids).await
}

#[tauri::command]
pub async fn add_storyboard_box(
    state: State<'_, AppState>,
    page_id: i64,
    label: String,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    insert_node(&state.pool, page_id, "box", &label, None, None, x, y).await
}
#[tauri::command]
pub async fn add_storyboard_icon(
    state: State<'_, AppState>,
    page_id: i64,
    icon: String,
    label: String,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    insert_node(&state.pool, page_id, "icon", &label, Some(&icon), None, x, y).await
}
#[tauri::command]
pub async fn add_storyboard_header(
    state: State<'_, AppState>,
    page_id: i64,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    insert_node(&state.pool, page_id, "header", "", None, Some(&content), x, y).await
}
#[tauri::command]
pub async fn add_storyboard_comment(
    state: State<'_, AppState>,
    page_id: i64,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    insert_node(&state.pool, page_id, "comment", "", None, Some(&content), x, y).await
}
#[tauri::command]
pub async fn update_storyboard_node_label(
    state: State<'_, AppState>,
    id: i64,
    label: String,
) -> AppResult<StoryboardNode> {
    update_node_label(&state.pool, id, &label).await
}
#[tauri::command]
pub async fn update_storyboard_node_content(
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> AppResult<StoryboardNode> {
    update_node_content(&state.pool, id, &content).await
}
#[tauri::command]
pub async fn set_storyboard_node_icon(
    state: State<'_, AppState>,
    id: i64,
    icon: Option<String>,
) -> AppResult<StoryboardNode> {
    set_node_icon(&state.pool, id, icon.as_deref()).await
}
#[tauri::command]
pub async fn set_storyboard_node_color(
    state: State<'_, AppState>,
    id: i64,
    color: Option<String>,
) -> AppResult<StoryboardNode> {
    set_node_color(&state.pool, id, color.as_deref()).await
}
#[tauri::command]
pub async fn move_storyboard_node(
    state: State<'_, AppState>,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<StoryboardNode> {
    move_node(&state.pool, id, x, y).await
}
#[tauri::command]
pub async fn resize_storyboard_node(
    state: State<'_, AppState>,
    id: i64,
    width: f64,
    height: f64,
) -> AppResult<StoryboardNode> {
    resize_node(&state.pool, id, width, height).await
}
#[tauri::command]
pub async fn remove_storyboard_node(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    remove_node(&state.pool, id).await
}

#[tauri::command]
pub async fn add_storyboard_edge(
    state: State<'_, AppState>,
    page_id: i64,
    source_id: i64,
    target_id: i64,
    source_handle: Option<String>,
    target_handle: Option<String>,
) -> AppResult<StoryboardEdge> {
    add_edge(
        &state.pool,
        page_id,
        source_id,
        target_id,
        source_handle.as_deref(),
        target_handle.as_deref(),
    )
    .await
}
#[tauri::command]
pub async fn update_storyboard_edge_label(
    state: State<'_, AppState>,
    id: i64,
    label: Option<String>,
) -> AppResult<StoryboardEdge> {
    update_edge_label(&state.pool, id, label.as_deref()).await
}
#[tauri::command]
pub async fn remove_storyboard_edge(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    remove_edge(&state.pool, id).await
}

// ---------- tests ----------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_seeds_a_first_page() {
        let pool = test_pool().await;
        let sb = create(&pool, "My board").await.unwrap();
        let state = get_state(&pool, sb.id).await.unwrap();
        assert_eq!(state.pages.len(), 1);
        assert_eq!(state.storyboard.title, "My board");
    }

    #[tokio::test]
    async fn nodes_and_edges_scope_to_page_and_cascade() {
        let pool = test_pool().await;
        let sb = create(&pool, "B").await.unwrap();
        let page = get_state(&pool, sb.id).await.unwrap().pages[0].id;
        let a = insert_node(&pool, page, "box", "A", None, None, 0.0, 0.0)
            .await
            .unwrap();
        let b = insert_node(&pool, page, "icon", "B", Some("🔌"), None, 40.0, 0.0)
            .await
            .unwrap();
        add_edge(&pool, page, a.id, b.id, Some("r"), Some("l"))
            .await
            .unwrap();
        let state = get_state(&pool, sb.id).await.unwrap();
        assert_eq!(state.nodes.len(), 2);
        assert_eq!(state.edges.len(), 1);
        // deleting the page cascades nodes + edges
        delete_page(&pool, page).await.unwrap();
        let after = get_state(&pool, sb.id).await.unwrap();
        assert_eq!(after.nodes.len(), 0);
        assert_eq!(after.edges.len(), 0);
    }

    #[tokio::test]
    async fn self_loop_edge_rejected() {
        let pool = test_pool().await;
        let sb = create(&pool, "B").await.unwrap();
        let page = get_state(&pool, sb.id).await.unwrap().pages[0].id;
        let a = insert_node(&pool, page, "box", "A", None, None, 0.0, 0.0)
            .await
            .unwrap();
        assert!(add_edge(&pool, page, a.id, a.id, None, None).await.is_err());
    }

    #[tokio::test]
    async fn pages_add_and_reorder() {
        let pool = test_pool().await;
        let sb = create(&pool, "B").await.unwrap();
        let p1 = get_state(&pool, sb.id).await.unwrap().pages[0].id;
        let p2 = add_page(&pool, sb.id).await.unwrap().id;
        reorder_pages(&pool, sb.id, &[p2, p1]).await.unwrap();
        let pages = get_state(&pool, sb.id).await.unwrap().pages;
        assert_eq!(pages[0].id, p2);
        assert_eq!(pages[1].id, p1);
    }
}
