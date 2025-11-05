use std::path::{Path, PathBuf};

use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

/// Store types that can be migrated in the Tauri store.
#[derive(Debug, Clone, Copy)]
pub enum Store {
    GeneralSettings,
    Auth,
    Presets,
    RecordingSettings,
    Hotkeys,
}

impl Store {
    pub fn key(&self) -> &'static str {
        match self {
            Store::GeneralSettings => "general_settings",
            Store::Auth => "auth",
            Store::Presets => "presets",
            Store::RecordingSettings => "recording_settings",
            Store::Hotkeys => "hotkeys",
        }
    }
}

/// Edit a JSON file at the given absolute `path` by applying `transform` to its parsed Value.
/// If the file does not exist, it's created with `{}` as the initial content.
pub async fn json_edit_at(
    path: &Path,
    transform: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<(), String> {
    // Read
    let original = match tokio::fs::read_to_string(path).await {
        Ok(s) => s,
        Err(_) => "{}".to_string(),
    };

    let parsed: Value = serde_json::from_str(&original).map_err(|e| e.to_string())?;
    let updated = transform(parsed)?;

    // Pretty-print to keep files readable
    let serialized = serde_json::to_string_pretty(&updated).map_err(|e| e.to_string())?;

    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create parent dir: {e}"))?;
    }

    tokio::fs::write(path, serialized)
        .await
        .map_err(|e| format!("Failed to write JSON file: {e}"))
}

/// Convenience: edit a JSON file located under the app's data directory.
/// `relative` is the path relative to `app_data_dir()`.
pub async fn json_edit_in_app_data(
    app: &AppHandle,
    relative: impl AsRef<Path>,
    transform: impl FnOnce(Value) -> Result<Value, String>,
) -> Result<(), String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Couldn't get app data dir: {e}"))?;
    let path: PathBuf = base.join(relative.as_ref());
    json_edit_at(&path, transform).await
}

/// Edit a store value in the Tauri store plugin.
/// The store is read, transformed, and saved back.
pub async fn edit_store(
    app: &AppHandle,
    store: Store,
    transform: impl FnOnce(&AppHandle, Value) -> Result<Value, String>,
) -> Result<(), String> {
    let store_plugin = app
        .store("store")
        .map_err(|e| format!("Store not found: {e}"))?;

    // Get current value (default to null if not present)
    let current = store_plugin.get(store.key()).unwrap_or(Value::Null);

    // Transform
    let updated = transform(app, current)?;

    // Save back
    store_plugin.set(store.key(), updated);
    store_plugin
        .save()
        .map_err(|e| format!("Failed to save store: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[tokio::test]
    async fn json_edit_at_creates_and_transforms() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("file.json");

        json_edit_at(&path, |v| {
            let mut obj = v.as_object().cloned().unwrap_or_default();
            obj.insert("x".into(), json!(1));
            Ok(Value::Object(obj))
        })
        .await
        .unwrap();

        let content = tokio::fs::read_to_string(&path).await.unwrap();
        let v: Value = serde_json::from_str(&content).unwrap();
        assert_eq!(v["x"], json!(1));
    }
}
