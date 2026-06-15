use sqlx::SqlitePool;

use super::dto::{
    CreateProjectParams, ProjectRow, ToggleProjectFavoriteParams, UpdateProjectParams,
};

pub async fn list(pool: &SqlitePool) -> Result<Vec<ProjectRow>, String> {
    sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, favorite, share_key, schema_version, created_at, updated_at
         FROM projects
         ORDER BY created_at ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| error.to_string())
}

pub async fn get_by_id(pool: &SqlitePool, project_id: &str) -> Result<Option<ProjectRow>, String> {
    sqlx::query_as::<_, ProjectRow>(
        "SELECT id, name, favorite, share_key, schema_version, created_at, updated_at
         FROM projects
         WHERE id = $1",
    )
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| error.to_string())
}

pub async fn get_state(pool: &SqlitePool, project_id: &str) -> Result<Option<String>, String> {
    sqlx::query_scalar("SELECT yjs_state FROM project_state WHERE project_id = $1")
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| error.to_string())
}

pub async fn create(pool: &SqlitePool, params: CreateProjectParams) -> Result<(), String> {
    let project_id = params.id;
    let yjs_state = params.yjs_state;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;

    sqlx::query(
        "INSERT INTO projects (id, name, favorite, share_key, schema_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(&project_id)
    .bind(params.name)
    .bind(i32::from(params.favorite))
    .bind(params.share_key)
    .bind(params.schema_version)
    .bind(params.created_at)
    .bind(params.updated_at)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?;

    upsert_state(&mut tx, &project_id, &yjs_state).await?;
    tx.commit().await.map_err(|error| error.to_string())
}

pub async fn update(pool: &SqlitePool, params: UpdateProjectParams) -> Result<(), String> {
    let project_id = params.id;
    let yjs_state = params.yjs_state;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;

    sqlx::query(
        "UPDATE projects
         SET name = $1, favorite = $2, updated_at = $3
         WHERE id = $4",
    )
    .bind(params.name)
    .bind(i32::from(params.favorite))
    .bind(params.updated_at)
    .bind(&project_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| error.to_string())?;

    upsert_state(&mut tx, &project_id, &yjs_state).await?;
    tx.commit().await.map_err(|error| error.to_string())
}

pub async fn toggle_favorite(
    pool: &SqlitePool,
    params: ToggleProjectFavoriteParams,
) -> Result<(), String> {
    let project_id = params.id;
    let yjs_state = params.yjs_state;
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;

    sqlx::query("UPDATE projects SET favorite = $1, updated_at = $2 WHERE id = $3")
        .bind(i32::from(params.favorite))
        .bind(params.updated_at)
        .bind(&project_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| error.to_string())?;

    upsert_state(&mut tx, &project_id, &yjs_state).await?;
    tx.commit().await.map_err(|error| error.to_string())
}

pub async fn delete(pool: &SqlitePool, project_id: &str) -> Result<(), String> {
    sqlx::query("DELETE FROM projects WHERE id = $1")
        .bind(project_id)
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub async fn update_state(
    pool: &SqlitePool,
    project_id: &str,
    yjs_state: &str,
) -> Result<(), String> {
    let mut tx = pool.begin().await.map_err(|error| error.to_string())?;
    upsert_state(&mut tx, project_id, yjs_state).await?;
    tx.commit().await.map_err(|error| error.to_string())
}

async fn upsert_state(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    project_id: &str,
    yjs_state: &str,
) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO project_state (project_id, yjs_state)
         VALUES ($1, $2)
         ON CONFLICT(project_id) DO UPDATE SET yjs_state = excluded.yjs_state",
    )
    .bind(project_id)
    .bind(yjs_state)
    .execute(&mut **tx)
    .await
    .map(|_| ())
    .map_err(|error| error.to_string())
}
