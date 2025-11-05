use serde_json::json;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

mod v1_rename_projects;

pub type SchemaVersion = u32;

pub const SCHEMA_VERSION: SchemaVersion = 1;

const SCHEMA_VERSION_KEY: &str = "schemaVersion";
const STORE_NAME: &str = "store";

fn get_schema_version<R: Runtime>(app: &AppHandle<R>) -> Result<u32, String> {
    // Read number from the store; default to 0 if missing or malformed
    let value = match app.store(STORE_NAME) {
        Ok(store) => store.get(SCHEMA_VERSION_KEY),
        Err(_) => None,
    };

    Ok(value
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(0))
}

fn set_schema_version<R: Runtime>(app: &AppHandle<R>, version: u32) -> Result<(), String> {
    let Ok(store) = app.store(STORE_NAME) else {
        return Err("Store not found".to_string());
    };

    store.set(SCHEMA_VERSION_KEY, json!(version));
    store.save().map_err(|e| e.to_string())
}

pub fn run(from_schema: SchemaVersion) -> Result<usize, anyhow::Error> {
    // run all migrations
    Ok(0)
}

/// Run pending migrations until the on-disk schema reaches CURRENT_SCHEMA_VERSION.
pub async fn run_migrations(app: &AppHandle) -> Result<(), String> {
    let mut version = get_schema_version(app)?;

    if version >= SCHEMA_VERSION {
        return Ok(());
    }

    // 0 -> 1
    if version < 1 {
        v1_rename_projects::migrate(app).await?;
        set_schema_version(app, 1)?;
    }

    Ok(())
}
