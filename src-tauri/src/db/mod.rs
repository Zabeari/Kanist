pub mod migrations;
mod pool;

use sqlx::SqlitePool;

pub use pool::init as init_pool;

pub struct DbState(pub SqlitePool);
