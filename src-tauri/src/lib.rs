mod commands;
mod db;
mod error;
mod markdown;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = db::default_db_path()?;
            let pool = tauri::async_runtime::block_on(db::open_pool(&path))?;
            app.manage(AppState { pool });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::lists::list_today,
            commands::lists::list_by_id,
            commands::lists::list_all,
            commands::lists::create_list,
            commands::lists::rename_list,
            commands::lists::archive_list,
            commands::lists::restore_list,
            commands::todos::list_todos,
            commands::todos::create_todo,
            commands::todos::update_todo,
            commands::todos::toggle_todo,
            commands::todos::delete_todo,
            commands::todos::reorder_todos,
            commands::tags::list_tags,
            commands::tags::tags_for_todo,
            commands::tags::add_tag_to_todo,
            commands::tags::remove_tag_from_todo,
            commands::export::export_list_md,
            commands::export::export_range_md,
            commands::export::save_text_file,
            commands::search::search_todos,
            commands::search::get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
