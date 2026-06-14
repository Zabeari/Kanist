use tauri::State;

use crate::db::{migrations, DbState};

#[tauri::command]
pub async fn db_initialize(state: State<'_, DbState>) -> Result<(), String> {
    migrations::run(&state.0).await
}
