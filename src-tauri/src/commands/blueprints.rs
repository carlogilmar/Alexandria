use crate::commands::AppState;
use crate::db::models::{Blueprint, BlueprintEdge, BlueprintNode, BlueprintState, BlueprintSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

const NODE_COLS: &str =
    "id, blueprint_id, kind, title, description, color, content, image_url, x, y, width, height, created_at, updated_at";
const EDGE_COLS: &str =
    "id, blueprint_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at";

// ============================================================
// Blueprints (the documents)
// ============================================================

pub(crate) async fn list(pool: &SqlitePool) -> AppResult<Vec<BlueprintSummary>> {
    sqlx::query_as::<_, BlueprintSummary>(
        "SELECT b.id, b.title, b.pinned, b.archived,
                COUNT(n.id) AS node_count, b.updated_at
           FROM blueprints b
           LEFT JOIN blueprint_nodes n ON n.blueprint_id = b.id
          GROUP BY b.id
          ORDER BY b.updated_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<Blueprint> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Blueprint>(
        "INSERT INTO blueprints (title, pinned, archived, created_at, updated_at)
         VALUES (?1, 0, 0, datetime('now'), datetime('now'))
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(title)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Blueprint> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Blueprint>(
        "UPDATE blueprints SET title = ?1, updated_at = datetime('now')
          WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(title)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint {id}")))
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Blueprint> {
    sqlx::query_as::<_, Blueprint>(
        "UPDATE blueprints SET pinned = ?1 WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(pinned)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint {id}")))
}

pub(crate) async fn set_archived(
    pool: &SqlitePool,
    id: i64,
    archived: bool,
) -> AppResult<Blueprint> {
    sqlx::query_as::<_, Blueprint>(
        "UPDATE blueprints SET archived = ?1 WHERE id = ?2
         RETURNING id, title, pinned, archived, created_at, updated_at",
    )
    .bind(archived)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM blueprints WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("blueprint {id}")));
    }
    Ok(())
}

pub(crate) async fn get_state(pool: &SqlitePool, id: i64) -> AppResult<BlueprintState> {
    let blueprint = sqlx::query_as::<_, Blueprint>(
        "SELECT id, title, pinned, archived, created_at, updated_at
           FROM blueprints WHERE id = ?1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint {id}")))?;
    let nodes = sqlx::query_as::<_, BlueprintNode>(&format!(
        "SELECT {NODE_COLS} FROM blueprint_nodes WHERE blueprint_id = ?1 ORDER BY id ASC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;
    let edges = sqlx::query_as::<_, BlueprintEdge>(&format!(
        "SELECT {EDGE_COLS} FROM blueprint_edges WHERE blueprint_id = ?1 ORDER BY id ASC"
    ))
    .bind(id)
    .fetch_all(pool)
    .await?;
    Ok(BlueprintState {
        blueprint,
        nodes,
        edges,
    })
}

// Keep the index list's "updated" stamp honest: canvas mutations bump the
// parent blueprint.
async fn touch(pool: &SqlitePool, blueprint_id: i64) -> AppResult<()> {
    sqlx::query("UPDATE blueprints SET updated_at = datetime('now') WHERE id = ?1")
        .bind(blueprint_id)
        .execute(pool)
        .await?;
    Ok(())
}

async fn touch_by_node(pool: &SqlitePool, node_id: i64) -> AppResult<()> {
    sqlx::query(
        "UPDATE blueprints SET updated_at = datetime('now')
          WHERE id = (SELECT blueprint_id FROM blueprint_nodes WHERE id = ?1)",
    )
    .bind(node_id)
    .execute(pool)
    .await?;
    Ok(())
}

// ============================================================
// Nodes
// ============================================================

const VALID_DECORATIVE_KINDS: &[&str] = &["text", "comment", "title"];

pub(crate) async fn add_card(
    pool: &SqlitePool,
    blueprint_id: i64,
    title: &str,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "INSERT INTO blueprint_nodes
             (blueprint_id, kind, title, description, color, content, image_url, x, y, width, height, created_at, updated_at)
         VALUES (?1, 'card', ?2, '', NULL, NULL, NULL, ?3, ?4, NULL, NULL, datetime('now'), datetime('now'))
         RETURNING {NODE_COLS}"
    ))
    .bind(blueprint_id)
    .bind(title)
    .bind(x)
    .bind(y)
    .fetch_one(pool)
    .await?;
    touch(pool, blueprint_id).await?;
    Ok(node)
}

// A card whose body IS a pasted image. Title/description start empty (an
// optional caption); `width` is the frontend's chosen display width, height
// stays NULL so the card auto-sizes to the image's aspect.
pub(crate) async fn add_image_card(
    pool: &SqlitePool,
    blueprint_id: i64,
    image_url: &str,
    x: f64,
    y: f64,
    width: Option<f64>,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "INSERT INTO blueprint_nodes
             (blueprint_id, kind, title, description, color, content, image_url, x, y, width, height, created_at, updated_at)
         VALUES (?1, 'card', '', '', NULL, NULL, ?2, ?3, ?4, ?5, NULL, datetime('now'), datetime('now'))
         RETURNING {NODE_COLS}"
    ))
    .bind(blueprint_id)
    .bind(image_url)
    .bind(x)
    .bind(y)
    .bind(width)
    .fetch_one(pool)
    .await?;
    touch(pool, blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn add_decorative(
    pool: &SqlitePool,
    blueprint_id: i64,
    kind: &str,
    content: &str,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    if !VALID_DECORATIVE_KINDS.contains(&kind) {
        return Err(AppError::BadInput(format!("invalid kind: {kind}")));
    }
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "INSERT INTO blueprint_nodes
             (blueprint_id, kind, title, description, color, content, x, y, width, height, created_at, updated_at)
         VALUES (?1, ?2, '', '', NULL, ?3, ?4, ?5, NULL, NULL, datetime('now'), datetime('now'))
         RETURNING {NODE_COLS}"
    ))
    .bind(blueprint_id)
    .bind(kind)
    .bind(content)
    .bind(x)
    .bind(y)
    .fetch_one(pool)
    .await?;
    touch(pool, blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn update_card(
    pool: &SqlitePool,
    id: i64,
    title: Option<&str>,
    description: Option<&str>,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "UPDATE blueprint_nodes
            SET title = COALESCE(?1, title),
                description = COALESCE(?2, description),
                updated_at = datetime('now')
          WHERE id = ?3
         RETURNING {NODE_COLS}"
    ))
    .bind(title)
    .bind(description)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint node {id}")))?;
    touch(pool, node.blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn set_card_color(
    pool: &SqlitePool,
    id: i64,
    color: Option<&str>,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "UPDATE blueprint_nodes SET color = ?1, updated_at = datetime('now')
          WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(color)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint node {id}")))?;
    touch(pool, node.blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn update_node_content(
    pool: &SqlitePool,
    id: i64,
    content: &str,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "UPDATE blueprint_nodes SET content = ?1, updated_at = datetime('now')
          WHERE id = ?2
         RETURNING {NODE_COLS}"
    ))
    .bind(content)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint node {id}")))?;
    touch(pool, node.blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn move_node(
    pool: &SqlitePool,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "UPDATE blueprint_nodes SET x = ?1, y = ?2, updated_at = datetime('now')
          WHERE id = ?3
         RETURNING {NODE_COLS}"
    ))
    .bind(x)
    .bind(y)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint node {id}")))?;
    touch(pool, node.blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn resize_node(
    pool: &SqlitePool,
    id: i64,
    width: f64,
    height: f64,
) -> AppResult<BlueprintNode> {
    let node = sqlx::query_as::<_, BlueprintNode>(&format!(
        "UPDATE blueprint_nodes SET width = ?1, height = ?2, updated_at = datetime('now')
          WHERE id = ?3
         RETURNING {NODE_COLS}"
    ))
    .bind(width)
    .bind(height)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint node {id}")))?;
    touch(pool, node.blueprint_id).await?;
    Ok(node)
}

pub(crate) async fn remove_node(pool: &SqlitePool, id: i64) -> AppResult<()> {
    touch_by_node(pool, id).await?;
    let res = sqlx::query("DELETE FROM blueprint_nodes WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("blueprint node {id}")));
    }
    Ok(())
}

// ============================================================
// Edges
// ============================================================

pub(crate) async fn add_edge(
    pool: &SqlitePool,
    blueprint_id: i64,
    source_id: i64,
    target_id: i64,
    source_handle: Option<&str>,
    target_handle: Option<&str>,
) -> AppResult<BlueprintEdge> {
    if source_id == target_id {
        return Err(AppError::BadInput("edge cannot loop on itself".into()));
    }
    let edge = sqlx::query_as::<_, BlueprintEdge>(&format!(
        "INSERT INTO blueprint_edges
             (blueprint_id, source_id, target_id, source_handle, target_handle, label, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, datetime('now'), datetime('now'))
         RETURNING {EDGE_COLS}"
    ))
    .bind(blueprint_id)
    .bind(source_id)
    .bind(target_id)
    .bind(source_handle)
    .bind(target_handle)
    .fetch_one(pool)
    .await?;
    touch(pool, blueprint_id).await?;
    Ok(edge)
}

pub(crate) async fn update_edge_label(
    pool: &SqlitePool,
    id: i64,
    label: Option<&str>,
) -> AppResult<BlueprintEdge> {
    let edge = sqlx::query_as::<_, BlueprintEdge>(&format!(
        "UPDATE blueprint_edges SET label = ?1, updated_at = datetime('now')
          WHERE id = ?2
         RETURNING {EDGE_COLS}"
    ))
    .bind(label)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("blueprint edge {id}")))?;
    touch(pool, edge.blueprint_id).await?;
    Ok(edge)
}

pub(crate) async fn remove_edge(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM blueprint_edges WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("blueprint edge {id}")));
    }
    Ok(())
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_blueprints(state: State<'_, AppState>) -> AppResult<Vec<BlueprintSummary>> {
    list(&state.pool).await
}

#[tauri::command]
pub async fn create_blueprint(state: State<'_, AppState>, title: String) -> AppResult<Blueprint> {
    create(&state.pool, &title).await
}

#[tauri::command]
pub async fn rename_blueprint(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Blueprint> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn set_blueprint_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Blueprint> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_blueprint_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Blueprint> {
    set_archived(&state.pool, id, archived).await
}

#[tauri::command]
pub async fn delete_blueprint(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn get_blueprint(state: State<'_, AppState>, id: i64) -> AppResult<BlueprintState> {
    get_state(&state.pool, id).await
}

#[tauri::command]
pub async fn add_blueprint_card(
    state: State<'_, AppState>,
    blueprint_id: i64,
    title: String,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    add_card(&state.pool, blueprint_id, &title, x, y).await
}

#[tauri::command]
pub async fn add_blueprint_image_card(
    state: State<'_, AppState>,
    blueprint_id: i64,
    image_url: String,
    x: f64,
    y: f64,
    width: Option<f64>,
) -> AppResult<BlueprintNode> {
    add_image_card(&state.pool, blueprint_id, &image_url, x, y, width).await
}

#[tauri::command]
pub async fn add_blueprint_decorative(
    state: State<'_, AppState>,
    blueprint_id: i64,
    kind: String,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    add_decorative(&state.pool, blueprint_id, &kind, &content, x, y).await
}

#[tauri::command]
pub async fn update_blueprint_card(
    state: State<'_, AppState>,
    id: i64,
    title: Option<String>,
    description: Option<String>,
) -> AppResult<BlueprintNode> {
    update_card(&state.pool, id, title.as_deref(), description.as_deref()).await
}

#[tauri::command]
pub async fn set_blueprint_card_color(
    state: State<'_, AppState>,
    id: i64,
    color: Option<String>,
) -> AppResult<BlueprintNode> {
    set_card_color(&state.pool, id, color.as_deref()).await
}

#[tauri::command]
pub async fn update_blueprint_node_content(
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> AppResult<BlueprintNode> {
    update_node_content(&state.pool, id, &content).await
}

#[tauri::command]
pub async fn move_blueprint_node(
    state: State<'_, AppState>,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<BlueprintNode> {
    move_node(&state.pool, id, x, y).await
}

#[tauri::command]
pub async fn resize_blueprint_node(
    state: State<'_, AppState>,
    id: i64,
    width: f64,
    height: f64,
) -> AppResult<BlueprintNode> {
    resize_node(&state.pool, id, width, height).await
}

#[tauri::command]
pub async fn remove_blueprint_node(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    remove_node(&state.pool, id).await
}

#[tauri::command]
pub async fn add_blueprint_edge(
    state: State<'_, AppState>,
    blueprint_id: i64,
    source_id: i64,
    target_id: i64,
    source_handle: Option<String>,
    target_handle: Option<String>,
) -> AppResult<BlueprintEdge> {
    add_edge(
        &state.pool,
        blueprint_id,
        source_id,
        target_id,
        source_handle.as_deref(),
        target_handle.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn update_blueprint_edge_label(
    state: State<'_, AppState>,
    id: i64,
    label: Option<String>,
) -> AppResult<BlueprintEdge> {
    update_edge_label(&state.pool, id, label.as_deref()).await
}

#[tauri::command]
pub async fn remove_blueprint_edge(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    remove_edge(&state.pool, id).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_list() {
        let pool = test_pool().await;
        let b = create(&pool, "Auth flow").await.unwrap();
        assert_eq!(b.title, "Auth flow");
        let all = list(&pool).await.unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].node_count, 0);
    }

    #[tokio::test]
    async fn rejects_empty_title() {
        let pool = test_pool().await;
        assert!(matches!(
            create(&pool, "  ").await,
            Err(AppError::BadInput(_))
        ));
    }

    #[tokio::test]
    async fn card_round_trip() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let n = add_card(&pool, b.id, "API gateway", 10.0, 20.0).await.unwrap();
        assert_eq!(n.kind, "card");
        assert_eq!(n.title, "API gateway");
        let n2 = update_card(&pool, n.id, None, Some("routes requests"))
            .await
            .unwrap();
        assert_eq!(n2.title, "API gateway");
        assert_eq!(n2.description, "routes requests");
        let n3 = set_card_color(&pool, n.id, Some("blue")).await.unwrap();
        assert_eq!(n3.color.as_deref(), Some("blue"));
        let n4 = move_node(&pool, n.id, 100.0, 200.0).await.unwrap();
        assert_eq!(n4.x, 100.0);
    }

    #[tokio::test]
    async fn image_card_round_trip() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let n = add_image_card(&pool, b.id, "asset://img/1.png", 5.0, 6.0, Some(280.0))
            .await
            .unwrap();
        assert_eq!(n.kind, "card");
        assert_eq!(n.image_url.as_deref(), Some("asset://img/1.png"));
        assert_eq!(n.width, Some(280.0));
        assert_eq!(n.title, "");
        // Re-read to confirm it persisted through get_state.
        let s = get_state(&pool, b.id).await.unwrap();
        assert_eq!(s.nodes[0].image_url.as_deref(), Some("asset://img/1.png"));
    }

    #[tokio::test]
    async fn decorative_kinds_validated() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let t = add_decorative(&pool, b.id, "text", "hello", 0.0, 0.0)
            .await
            .unwrap();
        assert_eq!(t.content.as_deref(), Some("hello"));
        assert!(matches!(
            add_decorative(&pool, b.id, "card", "x", 0.0, 0.0).await,
            Err(AppError::BadInput(_))
        ));
    }

    #[tokio::test]
    async fn edges_persist_handles_and_cascade() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let a = add_card(&pool, b.id, "A", 0.0, 0.0).await.unwrap();
        let c = add_card(&pool, b.id, "B", 100.0, 0.0).await.unwrap();
        let e = add_edge(&pool, b.id, a.id, c.id, Some("b"), Some("t"))
            .await
            .unwrap();
        assert_eq!(e.source_handle.as_deref(), Some("b"));
        assert_eq!(e.target_handle.as_deref(), Some("t"));
        remove_node(&pool, a.id).await.unwrap();
        let s = get_state(&pool, b.id).await.unwrap();
        assert!(s.edges.is_empty());
        assert_eq!(s.nodes.len(), 1);
    }

    #[tokio::test]
    async fn delete_blueprint_cascades_everything() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let a = add_card(&pool, b.id, "A", 0.0, 0.0).await.unwrap();
        let c = add_card(&pool, b.id, "B", 100.0, 0.0).await.unwrap();
        add_edge(&pool, b.id, a.id, c.id, None, None).await.unwrap();
        delete(&pool, b.id).await.unwrap();
        assert!(get_state(&pool, b.id).await.is_err());
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM blueprint_nodes")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn edge_rejects_self_loop_and_duplicates() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let a = add_card(&pool, b.id, "A", 0.0, 0.0).await.unwrap();
        let c = add_card(&pool, b.id, "B", 100.0, 0.0).await.unwrap();
        assert!(add_edge(&pool, b.id, a.id, a.id, None, None).await.is_err());
        add_edge(&pool, b.id, a.id, c.id, None, None).await.unwrap();
        assert!(add_edge(&pool, b.id, a.id, c.id, None, None).await.is_err());
    }

    #[tokio::test]
    async fn edge_label_round_trip() {
        let pool = test_pool().await;
        let b = create(&pool, "bp").await.unwrap();
        let a = add_card(&pool, b.id, "A", 0.0, 0.0).await.unwrap();
        let c = add_card(&pool, b.id, "B", 100.0, 0.0).await.unwrap();
        let e = add_edge(&pool, b.id, a.id, c.id, None, None).await.unwrap();
        let e2 = update_edge_label(&pool, e.id, Some("calls")).await.unwrap();
        assert_eq!(e2.label.as_deref(), Some("calls"));
        let e3 = update_edge_label(&pool, e.id, None).await.unwrap();
        assert!(e3.label.is_none());
    }
}
