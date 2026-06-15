use tauri::Manager;

mod commands;
mod db;

use commands::{
    db_create_project, db_delete_project, db_get_project_by_id, db_get_project_state,
    db_initialize, db_list_projects, db_toggle_project_favorite, db_update_project,
    db_update_project_state,
};
use db::{init_pool, DbState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let pool = tauri::async_runtime::block_on(init_pool(app.handle()))
        .expect("failed to initialize database pool");
      app.manage(DbState(pool));

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      db_initialize,
      db_list_projects,
      db_get_project_by_id,
      db_get_project_state,
      db_create_project,
      db_update_project,
      db_update_project_state,
      db_toggle_project_favorite,
      db_delete_project,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
