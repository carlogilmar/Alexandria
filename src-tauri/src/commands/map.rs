use crate::commands::AppState;
use crate::db::models::{MapEdge, MapNode, MapState};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

const VALID_ENTITY_KINDS: &[&str] = &["note", "article", "workflow"];

pub(crate) async fn get_state(pool: &SqlitePool) -> AppResult<MapState> {
    let nodes = sqlx::query_as::<_, MapNode>(
        "SELECT id, kind, entity_id, x, y, content, created_at, updated_at
           FROM map_nodes ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;
    let edges = sqlx::query_as::<_, MapEdge>(
        "SELECT id, source_id, target_id, label, created_at, updated_at
           FROM map_edges ORDER BY id ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(MapState { nodes, edges })
}

pub(crate) async fn add_node(
    pool: &SqlitePool,
    kind: &str,
    entity_id: i64,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    if !VALID_ENTITY_KINDS.contains(&kind) {
        return Err(AppError::BadInput(format!("invalid kind: {kind}")));
    }
    sqlx::query_as::<_, MapNode>(
        "INSERT INTO map_nodes (kind, entity_id, x, y, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, NULL, datetime('now'), datetime('now'))
         RETURNING id, kind, entity_id, x, y, content, created_at, updated_at",
    )
    .bind(kind)
    .bind(entity_id)
    .bind(x)
    .bind(y)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn add_text(
    pool: &SqlitePool,
    content: &str,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_freeform(pool, "text", content, x, y).await
}

pub(crate) async fn add_comment(
    pool: &SqlitePool,
    content: &str,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_freeform(pool, "comment", content, x, y).await
}

pub(crate) async fn add_custom(
    pool: &SqlitePool,
    content: &str,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_freeform(pool, "custom", content, x, y).await
}

async fn add_freeform(
    pool: &SqlitePool,
    kind: &str,
    content: &str,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    sqlx::query_as::<_, MapNode>(
        "INSERT INTO map_nodes (kind, entity_id, x, y, content, created_at, updated_at)
         VALUES (?1, 0, ?2, ?3, ?4, datetime('now'), datetime('now'))
         RETURNING id, kind, entity_id, x, y, content, created_at, updated_at",
    )
    .bind(kind)
    .bind(x)
    .bind(y)
    .bind(content)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_node_content(
    pool: &SqlitePool,
    id: i64,
    content: &str,
) -> AppResult<MapNode> {
    sqlx::query_as::<_, MapNode>(
        "UPDATE map_nodes SET content = ?1, updated_at = datetime('now')
           WHERE id = ?2
         RETURNING id, kind, entity_id, x, y, content, created_at, updated_at",
    )
    .bind(content)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("map node {id}")))
}

pub(crate) async fn move_node(
    pool: &SqlitePool,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    sqlx::query_as::<_, MapNode>(
        "UPDATE map_nodes SET x = ?1, y = ?2, updated_at = datetime('now')
           WHERE id = ?3
         RETURNING id, kind, entity_id, x, y, content, created_at, updated_at",
    )
    .bind(x)
    .bind(y)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("map node {id}")))
}

pub(crate) async fn remove_node(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM map_nodes WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("map node {id}")));
    }
    Ok(())
}

pub(crate) async fn add_edge(
    pool: &SqlitePool,
    source_id: i64,
    target_id: i64,
    label: Option<&str>,
) -> AppResult<MapEdge> {
    if source_id == target_id {
        return Err(AppError::BadInput("edge cannot loop on itself".into()));
    }
    sqlx::query_as::<_, MapEdge>(
        "INSERT INTO map_edges (source_id, target_id, label, created_at, updated_at)
         VALUES (?1, ?2, ?3, datetime('now'), datetime('now'))
         RETURNING id, source_id, target_id, label, created_at, updated_at",
    )
    .bind(source_id)
    .bind(target_id)
    .bind(label)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_edge_label(
    pool: &SqlitePool,
    id: i64,
    label: Option<&str>,
) -> AppResult<MapEdge> {
    sqlx::query_as::<_, MapEdge>(
        "UPDATE map_edges SET label = ?1, updated_at = datetime('now')
           WHERE id = ?2
         RETURNING id, source_id, target_id, label, created_at, updated_at",
    )
    .bind(label)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("map edge {id}")))
}

pub(crate) async fn remove_edge(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM map_edges WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("map edge {id}")));
    }
    Ok(())
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn get_map(state: State<'_, AppState>) -> AppResult<MapState> {
    get_state(&state.pool).await
}

#[tauri::command]
pub async fn add_map_node(
    state: State<'_, AppState>,
    kind: String,
    entity_id: i64,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_node(&state.pool, &kind, entity_id, x, y).await
}

#[tauri::command]
pub async fn add_map_text(
    state: State<'_, AppState>,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_text(&state.pool, &content, x, y).await
}

#[tauri::command]
pub async fn add_map_comment(
    state: State<'_, AppState>,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_comment(&state.pool, &content, x, y).await
}

#[tauri::command]
pub async fn add_map_custom(
    state: State<'_, AppState>,
    content: String,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    add_custom(&state.pool, &content, x, y).await
}

#[tauri::command]
pub async fn update_map_node_content(
    state: State<'_, AppState>,
    id: i64,
    content: String,
) -> AppResult<MapNode> {
    update_node_content(&state.pool, id, &content).await
}

#[tauri::command]
pub async fn move_map_node(
    state: State<'_, AppState>,
    id: i64,
    x: f64,
    y: f64,
) -> AppResult<MapNode> {
    move_node(&state.pool, id, x, y).await
}

#[tauri::command]
pub async fn remove_map_node(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    remove_node(&state.pool, id).await
}

#[tauri::command]
pub async fn add_map_edge(
    state: State<'_, AppState>,
    source_id: i64,
    target_id: i64,
    label: Option<String>,
) -> AppResult<MapEdge> {
    add_edge(&state.pool, source_id, target_id, label.as_deref()).await
}

#[tauri::command]
pub async fn update_map_edge_label(
    state: State<'_, AppState>,
    id: i64,
    label: Option<String>,
) -> AppResult<MapEdge> {
    update_edge_label(&state.pool, id, label.as_deref()).await
}

#[tauri::command]
pub async fn remove_map_edge(state: State<'_, AppState>, id: i64) -> AppResult<()> {
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
    async fn empty_state() {
        let pool = test_pool().await;
        let s = get_state(&pool).await.unwrap();
        assert!(s.nodes.is_empty());
        assert!(s.edges.is_empty());
    }

    #[tokio::test]
    async fn add_and_move_node() {
        let pool = test_pool().await;
        let n = add_node(&pool, "article", 1, 10.0, 20.0).await.unwrap();
        assert_eq!(n.kind, "article");
        assert_eq!(n.entity_id, 1);
        assert_eq!(n.x, 10.0);
        let n2 = move_node(&pool, n.id, 100.0, 200.0).await.unwrap();
        assert_eq!(n2.x, 100.0);
        assert_eq!(n2.y, 200.0);
    }

    #[tokio::test]
    async fn unique_kind_entity() {
        let pool = test_pool().await;
        add_node(&pool, "article", 1, 0.0, 0.0).await.unwrap();
        // Second placement of same entity must fail.
        let err = add_node(&pool, "article", 1, 50.0, 50.0).await;
        assert!(err.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_kind() {
        let pool = test_pool().await;
        let err = add_node(&pool, "todo", 1, 0.0, 0.0).await;
        assert!(matches!(err, Err(AppError::BadInput(_))));
    }

    #[tokio::test]
    async fn edges_cascade_when_node_removed() {
        let pool = test_pool().await;
        let a = add_node(&pool, "article", 1, 0.0, 0.0).await.unwrap();
        let b = add_node(&pool, "note", 1, 100.0, 0.0).await.unwrap();
        add_edge(&pool, a.id, b.id, None).await.unwrap();
        let s = get_state(&pool).await.unwrap();
        assert_eq!(s.edges.len(), 1);
        remove_node(&pool, a.id).await.unwrap();
        let s2 = get_state(&pool).await.unwrap();
        assert!(s2.edges.is_empty());
    }

    #[tokio::test]
    async fn edge_rejects_self_loop() {
        let pool = test_pool().await;
        let a = add_node(&pool, "article", 1, 0.0, 0.0).await.unwrap();
        let err = add_edge(&pool, a.id, a.id, None).await;
        assert!(matches!(err, Err(AppError::BadInput(_))));
    }

    #[tokio::test]
    async fn edge_label_round_trip() {
        let pool = test_pool().await;
        let a = add_node(&pool, "article", 1, 0.0, 0.0).await.unwrap();
        let b = add_node(&pool, "note", 1, 100.0, 0.0).await.unwrap();
        let e = add_edge(&pool, a.id, b.id, Some("explains")).await.unwrap();
        assert_eq!(e.label.as_deref(), Some("explains"));
        let cleared = update_edge_label(&pool, e.id, None).await.unwrap();
        assert!(cleared.label.is_none());
    }

    #[tokio::test]
    async fn text_nodes_can_repeat_and_edit() {
        let pool = test_pool().await;
        // Multiple text nodes are allowed (partial unique index excludes 'text').
        let t1 = add_text(&pool, "first", 0.0, 0.0).await.unwrap();
        let t2 = add_text(&pool, "second", 50.0, 50.0).await.unwrap();
        assert_eq!(t1.kind, "text");
        assert_eq!(t2.kind, "text");
        assert_eq!(t1.content.as_deref(), Some("first"));
        let edited = update_node_content(&pool, t1.id, "edited").await.unwrap();
        assert_eq!(edited.content.as_deref(), Some("edited"));
    }
}
