use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use tauri::{AppHandle, Manager};

use super::migrations;

pub async fn init(app: &AppHandle) -> Result<SqlitePool, String> {
    let app_path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_path).map_err(|error| error.to_string())?;

    let db_path = app_path.join("kanist.db");
    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .min_connections(1)
        .after_connect(|connection, _| {
            Box::pin(async move {
                sqlx::query("PRAGMA foreign_keys = ON")
                    .execute(connection)
                    .await?;
                Ok(())
            })
        })
        .connect_with(connect_options)
        .await
        .map_err(|error| error.to_string())?;

    migrations::run(&pool).await?;
    Ok(pool)
}
