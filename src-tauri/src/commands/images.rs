use crate::db::BUNDLE_ID;
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn images_dir() -> AppResult<PathBuf> {
    let base = dirs::data_dir().ok_or_else(|| {
        AppError::BadInput("could not resolve Application Support directory".into())
    })?;
    Ok(base.join(BUNDLE_ID).join("images"))
}

fn sanitize_extension(raw: &str) -> String {
    let cleaned: String = raw
        .trim_start_matches('.')
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(8)
        .collect();
    if cleaned.is_empty() {
        "png".into()
    } else {
        cleaned.to_ascii_lowercase()
    }
}

/// Persist image bytes to the app's images directory and return the absolute
/// file path. The frontend converts this to an asset URL via convertFileSrc.
#[tauri::command]
pub async fn save_image(bytes: Vec<u8>, extension: String) -> AppResult<String> {
    if bytes.is_empty() {
        return Err(AppError::BadInput("image is empty".into()));
    }
    let dir = images_dir()?;
    std::fs::create_dir_all(&dir)?;

    let ext = sanitize_extension(&extension);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| AppError::BadInput(e.to_string()))?
        .as_millis();
    let seq = COUNTER.fetch_add(1, Ordering::Relaxed);
    let filename = format!("{now}-{seq}.{ext}");

    let path = dir.join(&filename);
    std::fs::write(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_extension_strips_unsafe_chars() {
        assert_eq!(sanitize_extension("png"), "png");
        assert_eq!(sanitize_extension(".PNG"), "png");
        // Strips slashes/dots and truncates at 8 chars — no path traversal.
        assert_eq!(sanitize_extension("../etc/passwd"), "etcpassw");
        assert_eq!(sanitize_extension(""), "png");
        assert_eq!(sanitize_extension("jpeg"), "jpeg");
    }
}
