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

#[tauri::command]
pub async fn save_binary_file(path: String, bytes: Vec<u8>) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::BadInput("path cannot be empty".into()));
    }
    std::fs::write(&path, bytes)?;
    Ok(())
}

// Copy a PNG (raw bytes) to the OS clipboard. WKWebView blocks
// navigator.clipboard.write() for images (NotAllowedError), so the blueprint
// "Copy PNG" path routes through here. `Image::from_bytes` decodes the PNG
// (tauri `image-png` feature) into RGBA, which the clipboard plugin needs.
#[tauri::command]
pub async fn copy_image_to_clipboard(app: tauri::AppHandle, bytes: Vec<u8>) -> AppResult<()> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let image = tauri::image::Image::from_bytes(&bytes)
        .map_err(|e| AppError::Other(format!("could not decode image: {e}")))?;
    app.clipboard()
        .write_image(&image)
        .map_err(|e| AppError::Other(format!("could not write to clipboard: {e}")))?;
    Ok(())
}
