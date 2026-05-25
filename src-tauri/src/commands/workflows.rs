use crate::commands::AppState;
use crate::db::models::{Workflow, WorkflowStep, WorkflowSummary};
use crate::error::{AppError, AppResult};
use sqlx::SqlitePool;
use tauri::State;

// ============================================================
// Workflows
// ============================================================

pub(crate) async fn all(pool: &SqlitePool) -> AppResult<Vec<WorkflowSummary>> {
    sqlx::query_as::<_, WorkflowSummary>(
        "SELECT w.id, w.title, w.pinned, w.archived,
                (SELECT COUNT(*) FROM workflow_steps s
                  WHERE s.workflow_id = w.id AND s.parent_step_id IS NULL) AS step_count
           FROM workflows w
          ORDER BY w.updated_at DESC, w.id DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn by_id(pool: &SqlitePool, id: i64) -> AppResult<Workflow> {
    sqlx::query_as::<_, Workflow>("SELECT * FROM workflows WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("workflow {id}")))
}

pub(crate) async fn create(pool: &SqlitePool, title: &str) -> AppResult<Workflow> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Workflow>(
        "INSERT INTO workflows (title, description, created_at, updated_at)
         VALUES (?1, NULL, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(title.trim())
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn rename(pool: &SqlitePool, id: i64, title: &str) -> AppResult<Workflow> {
    if title.trim().is_empty() {
        return Err(AppError::BadInput("title cannot be empty".into()));
    }
    sqlx::query_as::<_, Workflow>(
        "UPDATE workflows SET title = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(title.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("workflow {id}")))
}

pub(crate) async fn update_description(
    pool: &SqlitePool,
    id: i64,
    description: Option<&str>,
) -> AppResult<Workflow> {
    sqlx::query_as::<_, Workflow>(
        "UPDATE workflows SET description = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(description)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("workflow {id}")))
}

pub(crate) async fn delete(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM workflows WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("workflow {id}")));
    }
    Ok(())
}

pub(crate) async fn set_pinned(pool: &SqlitePool, id: i64, pinned: bool) -> AppResult<Workflow> {
    sqlx::query_as::<_, Workflow>(
        "UPDATE workflows SET pinned = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(pinned as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("workflow {id}")))
}

pub(crate) async fn set_archived(pool: &SqlitePool, id: i64, archived: bool) -> AppResult<Workflow> {
    sqlx::query_as::<_, Workflow>(
        "UPDATE workflows SET archived = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(archived as i64)
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("workflow {id}")))
}

// ============================================================
// Steps
// ============================================================

pub(crate) async fn list_steps(
    pool: &SqlitePool,
    workflow_id: i64,
) -> AppResult<Vec<WorkflowStep>> {
    sqlx::query_as::<_, WorkflowStep>(
        "SELECT * FROM workflow_steps
          WHERE workflow_id = ?1
          ORDER BY position ASC, id ASC",
    )
    .bind(workflow_id)
    .fetch_all(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn create_step(
    pool: &SqlitePool,
    workflow_id: i64,
    text: &str,
    parent_step_id: Option<i64>,
) -> AppResult<WorkflowStep> {
    if text.trim().is_empty() {
        return Err(AppError::BadInput("step text cannot be empty".into()));
    }
    // Position = next within the same parent (or top level if parent is None).
    let next_pos: i64 = sqlx::query_scalar(
        "SELECT COALESCE(MAX(position) + 1, 0) FROM workflow_steps
          WHERE workflow_id = ?1 AND parent_step_id IS ?2",
    )
    .bind(workflow_id)
    .bind(parent_step_id)
    .fetch_one(pool)
    .await?;

    sqlx::query_as::<_, WorkflowStep>(
        "INSERT INTO workflow_steps
            (workflow_id, parent_step_id, text, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
         RETURNING *",
    )
    .bind(workflow_id)
    .bind(parent_step_id)
    .bind(text.trim())
    .bind(next_pos)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub(crate) async fn update_step(
    pool: &SqlitePool,
    id: i64,
    text: &str,
) -> AppResult<WorkflowStep> {
    if text.trim().is_empty() {
        return Err(AppError::BadInput("step text cannot be empty".into()));
    }
    sqlx::query_as::<_, WorkflowStep>(
        "UPDATE workflow_steps SET text = ?1, updated_at = datetime('now')
           WHERE id = ?2 RETURNING *",
    )
    .bind(text.trim())
    .bind(id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound(format!("step {id}")))
}

pub(crate) async fn delete_step(pool: &SqlitePool, id: i64) -> AppResult<()> {
    let res = sqlx::query("DELETE FROM workflow_steps WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::NotFound(format!("step {id}")));
    }
    Ok(())
}

pub(crate) async fn reorder_steps(
    pool: &SqlitePool,
    workflow_id: i64,
    parent_step_id: Option<i64>,
    ordered_ids: &[i64],
) -> AppResult<()> {
    let mut tx = pool.begin().await?;
    for (idx, id) in ordered_ids.iter().enumerate() {
        sqlx::query(
            "UPDATE workflow_steps
                SET position = ?1, updated_at = datetime('now')
              WHERE id = ?2 AND workflow_id = ?3 AND parent_step_id IS ?4",
        )
        .bind(idx as i64)
        .bind(id)
        .bind(workflow_id)
        .bind(parent_step_id)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

// ============================================================
// Tauri command surface
// ============================================================

#[tauri::command]
pub async fn list_workflows(state: State<'_, AppState>) -> AppResult<Vec<WorkflowSummary>> {
    all(&state.pool).await
}

#[tauri::command]
pub async fn workflow_by_id(state: State<'_, AppState>, id: i64) -> AppResult<Workflow> {
    by_id(&state.pool, id).await
}

#[tauri::command]
pub async fn create_workflow(
    state: State<'_, AppState>,
    title: String,
) -> AppResult<Workflow> {
    create(&state.pool, &title).await
}

#[tauri::command]
pub async fn rename_workflow(
    state: State<'_, AppState>,
    id: i64,
    title: String,
) -> AppResult<Workflow> {
    rename(&state.pool, id, &title).await
}

#[tauri::command]
pub async fn update_workflow_description(
    state: State<'_, AppState>,
    id: i64,
    description: Option<String>,
) -> AppResult<Workflow> {
    update_description(&state.pool, id, description.as_deref()).await
}

#[tauri::command]
pub async fn delete_workflow(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete(&state.pool, id).await
}

#[tauri::command]
pub async fn set_workflow_pinned(
    state: State<'_, AppState>,
    id: i64,
    pinned: bool,
) -> AppResult<Workflow> {
    set_pinned(&state.pool, id, pinned).await
}

#[tauri::command]
pub async fn set_workflow_archived(
    state: State<'_, AppState>,
    id: i64,
    archived: bool,
) -> AppResult<Workflow> {
    set_archived(&state.pool, id, archived).await
}

#[tauri::command]
pub async fn list_workflow_steps(
    state: State<'_, AppState>,
    workflow_id: i64,
) -> AppResult<Vec<WorkflowStep>> {
    list_steps(&state.pool, workflow_id).await
}

#[tauri::command]
pub async fn create_workflow_step(
    state: State<'_, AppState>,
    workflow_id: i64,
    text: String,
    parent_step_id: Option<i64>,
) -> AppResult<WorkflowStep> {
    create_step(&state.pool, workflow_id, &text, parent_step_id).await
}

#[tauri::command]
pub async fn update_workflow_step(
    state: State<'_, AppState>,
    id: i64,
    text: String,
) -> AppResult<WorkflowStep> {
    update_step(&state.pool, id, &text).await
}

#[tauri::command]
pub async fn delete_workflow_step(state: State<'_, AppState>, id: i64) -> AppResult<()> {
    delete_step(&state.pool, id).await
}

#[tauri::command]
pub async fn reorder_workflow_steps(
    state: State<'_, AppState>,
    workflow_id: i64,
    parent_step_id: Option<i64>,
    ordered_ids: Vec<i64>,
) -> AppResult<()> {
    reorder_steps(&state.pool, workflow_id, parent_step_id, &ordered_ids).await
}

// ============================================================
// Tests
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;

    #[tokio::test]
    async fn create_and_fetch_workflow() {
        let pool = test_pool().await;
        let w = create(&pool, "Onboarding").await.unwrap();
        assert_eq!(w.title, "Onboarding");
        let fetched = by_id(&pool, w.id).await.unwrap();
        assert_eq!(fetched.id, w.id);
    }

    #[tokio::test]
    async fn workflow_rejects_empty_title() {
        let pool = test_pool().await;
        let err = create(&pool, "   ").await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn rename_changes_title() {
        let pool = test_pool().await;
        let w = create(&pool, "old").await.unwrap();
        let renamed = rename(&pool, w.id, "new").await.unwrap();
        assert_eq!(renamed.title, "new");
    }

    #[tokio::test]
    async fn description_can_be_set_and_cleared() {
        let pool = test_pool().await;
        let w = create(&pool, "x").await.unwrap();
        let with = update_description(&pool, w.id, Some("a note")).await.unwrap();
        assert_eq!(with.description.as_deref(), Some("a note"));
        let cleared = update_description(&pool, w.id, None).await.unwrap();
        assert!(cleared.description.is_none());
    }

    #[tokio::test]
    async fn delete_removes_workflow() {
        let pool = test_pool().await;
        let w = create(&pool, "x").await.unwrap();
        delete(&pool, w.id).await.unwrap();
        let err = by_id(&pool, w.id).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[tokio::test]
    async fn all_summarizes_step_counts() {
        let pool = test_pool().await;
        let a = create(&pool, "A").await.unwrap();
        let b = create(&pool, "B").await.unwrap();
        create_step(&pool, a.id, "1", None).await.unwrap();
        create_step(&pool, a.id, "2", None).await.unwrap();
        // sublists shouldn't be counted in step_count
        let s = create_step(&pool, a.id, "3", None).await.unwrap();
        create_step(&pool, a.id, "3a", Some(s.id)).await.unwrap();

        let summaries = all(&pool).await.unwrap();
        assert_eq!(summaries.len(), 2);
        let sum_a = summaries.iter().find(|s| s.id == a.id).unwrap();
        let sum_b = summaries.iter().find(|s| s.id == b.id).unwrap();
        assert_eq!(sum_a.step_count, 3); // top-level only
        assert_eq!(sum_b.step_count, 0);
    }

    #[tokio::test]
    async fn create_step_assigns_increasing_positions() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let a = create_step(&pool, w.id, "1", None).await.unwrap();
        let b = create_step(&pool, w.id, "2", None).await.unwrap();
        let c = create_step(&pool, w.id, "3", None).await.unwrap();
        assert_eq!(a.position, 0);
        assert_eq!(b.position, 1);
        assert_eq!(c.position, 2);
    }

    #[tokio::test]
    async fn create_step_rejects_empty_text() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let err = create_step(&pool, w.id, "  ", None).await.unwrap_err();
        assert!(matches!(err, AppError::BadInput(_)));
    }

    #[tokio::test]
    async fn substep_positioning_is_per_parent() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let parent = create_step(&pool, w.id, "top", None).await.unwrap();
        let sub_a = create_step(&pool, w.id, "a", Some(parent.id)).await.unwrap();
        let sub_b = create_step(&pool, w.id, "b", Some(parent.id)).await.unwrap();
        // Top-level position continues independently.
        let next_top = create_step(&pool, w.id, "next-top", None).await.unwrap();
        assert_eq!(sub_a.position, 0);
        assert_eq!(sub_b.position, 1);
        assert_eq!(next_top.position, 1); // not 2 — siblings are in their own scope
    }

    #[tokio::test]
    async fn update_step_changes_text() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let s = create_step(&pool, w.id, "old", None).await.unwrap();
        let updated = update_step(&pool, s.id, "new").await.unwrap();
        assert_eq!(updated.text, "new");
    }

    #[tokio::test]
    async fn delete_step_removes_row_and_cascades_to_substeps() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let parent = create_step(&pool, w.id, "top", None).await.unwrap();
        create_step(&pool, w.id, "sub-a", Some(parent.id)).await.unwrap();
        create_step(&pool, w.id, "sub-b", Some(parent.id)).await.unwrap();
        delete_step(&pool, parent.id).await.unwrap();
        let remaining = list_steps(&pool, w.id).await.unwrap();
        assert!(remaining.is_empty());
    }

    #[tokio::test]
    async fn deleting_workflow_cascades_to_steps() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        create_step(&pool, w.id, "a", None).await.unwrap();
        create_step(&pool, w.id, "b", None).await.unwrap();
        delete(&pool, w.id).await.unwrap();
        // workflow_id reference is dead; verify no steps remain orphaned
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM workflow_steps")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn reorder_steps_writes_positions_in_array_order() {
        let pool = test_pool().await;
        let w = create(&pool, "w").await.unwrap();
        let a = create_step(&pool, w.id, "a", None).await.unwrap();
        let b = create_step(&pool, w.id, "b", None).await.unwrap();
        let c = create_step(&pool, w.id, "c", None).await.unwrap();
        reorder_steps(&pool, w.id, None, &[c.id, a.id, b.id])
            .await
            .unwrap();
        let ordered = list_steps(&pool, w.id).await.unwrap();
        let ids: Vec<i64> = ordered.iter().map(|s| s.id).collect();
        assert_eq!(ids, vec![c.id, a.id, b.id]);
    }
}
