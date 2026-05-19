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
            commands::lists::set_list_pinned,
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
            commands::search::list_all_todos,
            commands::search::get_stats,
            commands::search::get_daily_stats,
            commands::workflows::list_workflows,
            commands::workflows::workflow_by_id,
            commands::workflows::create_workflow,
            commands::workflows::rename_workflow,
            commands::workflows::update_workflow_description,
            commands::workflows::delete_workflow,
            commands::workflows::set_workflow_pinned,
            commands::workflows::list_workflow_steps,
            commands::workflows::create_workflow_step,
            commands::workflows::update_workflow_step,
            commands::workflows::delete_workflow_step,
            commands::workflows::reorder_workflow_steps,
            commands::notes::list_notes,
            commands::notes::list_notes_for_date,
            commands::notes::note_by_id,
            commands::notes::create_note,
            commands::notes::rename_note,
            commands::notes::update_note_body,
            commands::notes::delete_note,
            commands::notes::set_note_pinned,
            commands::notes::get_index_doc,
            commands::notes::update_index_doc,
            commands::articles::list_articles,
            commands::articles::article_by_id,
            commands::articles::create_article,
            commands::articles::rename_article,
            commands::articles::update_article_body,
            commands::articles::delete_article,
            commands::articles::set_article_pinned,
            commands::images::save_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
