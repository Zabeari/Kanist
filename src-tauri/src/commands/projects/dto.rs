use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "snake_case")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub favorite: i32,
    pub share_key: String,
    pub schema_version: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectParams {
    pub id: String,
    pub name: String,
    pub favorite: bool,
    pub share_key: String,
    pub schema_version: i32,
    pub created_at: i64,
    pub updated_at: i64,
    pub yjs_state: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProjectParams {
    pub id: String,
    pub name: String,
    pub favorite: bool,
    pub updated_at: i64,
    pub yjs_state: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleProjectFavoriteParams {
    pub id: String,
    pub favorite: bool,
    pub updated_at: i64,
    pub yjs_state: String,
}
