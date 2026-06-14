use tauri::State;

use crate::db::DbState;

use super::dto::{CreateProjectParams, ToggleProjectFavoriteParams, UpdateProjectParams};
use super::repository;

#[tauri::command]
pub async fn db_list_projects(state: State<'_, DbState>) -> Result<Vec<super::dto::ProjectRow>, String> {
    repository::list(&state.0).await
}

#[tauri::command]
pub async fn db_get_project_by_id(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Option<super::dto::ProjectRow>, String> {
    repository::get_by_id(&state.0, &project_id).await
}

#[tauri::command]
pub async fn db_get_project_state(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<Option<String>, String> {
    repository::get_state(&state.0, &project_id).await
}

#[tauri::command]
pub async fn db_create_project(
    state: State<'_, DbState>,
    params: CreateProjectParams,
) -> Result<(), String> {
    repository::create(&state.0, params).await
}

#[tauri::command]
pub async fn db_update_project(
    state: State<'_, DbState>,
    params: UpdateProjectParams,
) -> Result<(), String> {
    repository::update(&state.0, params).await
}

#[tauri::command]
pub async fn db_toggle_project_favorite(
    state: State<'_, DbState>,
    params: ToggleProjectFavoriteParams,
) -> Result<(), String> {
    repository::toggle_favorite(&state.0, params).await
}

#[tauri::command]
pub async fn db_delete_project(
    state: State<'_, DbState>,
    project_id: String,
) -> Result<(), String> {
    repository::delete(&state.0, &project_id).await
}
