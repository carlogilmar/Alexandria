use crate::commands::AppState;
use crate::error::{AppError, AppResult};
use crate::markdown;
use tauri::State;

#[tauri::command]
pub async fn export_list_md(state: State<'_, AppState>, id: i64) -> AppResult<String> {
    markdown::render_list(&state.pool, id).await
}

#[tauri::command]
pub async fn export_range_md(
    state: State<'_, AppState>,
    from: Option<String>,
    to: Option<String>,
) -> AppResult<String> {
    markdown::render_range(&state.pool, from.as_deref(), to.as_deref()).await
}

#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::BadInput("path cannot be empty".into()));
    }
    std::fs::write(&path, content)?;
    Ok(())
}
