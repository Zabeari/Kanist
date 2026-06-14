pub const MIGRATIONS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS projects (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        favorite        INTEGER NOT NULL DEFAULT 0,
        share_key       TEXT NOT NULL,
        schema_version  INTEGER NOT NULL DEFAULT 1,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL
    )",
    "CREATE TABLE IF NOT EXISTS project_state (
        project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        yjs_state   TEXT NOT NULL
    )",
];

pub async fn run(pool: &sqlx::SqlitePool) -> Result<(), String> {
    for migration in MIGRATIONS {
        sqlx::query(migration)
            .execute(pool)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}
