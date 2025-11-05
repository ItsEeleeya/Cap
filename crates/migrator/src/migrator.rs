// crates/migrator/src/migrator.rs
use std::{future::Future, pin::Pin};
use tauri::AppHandle;

pub mod migrations;
pub mod store_migration;

type SchemaVersion = u32;

/// Migration function signature.
type MigrationActionFn = fn(&AppHandle) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>>;

pub struct Migration {
    pub name: &'static str,
    pub version: SchemaVersion,
    pub run: MigrationActionFn,
}

inventory::collect!(Migration);

/// Runs all registered migrations with version > from_schema in ascending order.
/// Returns the number of migrations executed.
pub async fn run(app: &AppHandle, from_schema: SchemaVersion) -> Result<usize, String> {
    let mut migs: Vec<&'static Migration> = inventory::iter::<Migration>.into_iter().collect();
    migs.sort_by_key(|m| m.version);
    let mut applied = 0;
    for m in migs.into_iter().filter(|m| m.version > from_schema) {
        tracing::info!("Running for schema \"{}\": {}", m.version, m.name);
        (m.run)(app).await?;
        applied += 1;
    }
    Ok(applied)
}

/// Register a migration function.
///
/// Usage:
/// ```rust
/// use cap_migrator::migration;
///
/// // a normal async migration function
/// pub async fn migrate(app: &tauri::AppHandle) -> Result<(), String> {
///     // migration logic
///     Ok(())
/// }
///
/// // Register it — name must be a &'static str (string literal recommended).
/// migration!(to_schema: 1, name: "migrate", migrate);
/// ```
///
/// The `name` is now provided explicitly by the caller (use a string literal).
#[macro_export]
macro_rules! migration {
    (to_schema: $version:expr, name: $name:expr, $migrate:path) => {
        inventory::submit! {
            $crate::Migration {
                version: $version,
                name: $name,
                run: {
                    // nested function returning the expected function pointer type
                    fn __run_boxed(
                        app: &tauri::AppHandle,
                    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> {
                        let app = app.clone();
                        Box::pin(async move { $migrate(&app).await })
                    }
                    __run_boxed
                }
            }
        }
    };
}

/// Register a data migration that edits a store value.
///
/// Usage:
/// ```rust
/// use serde_json::Value;
/// use cap_migrator::data_migration;
///
/// // Define a simple migration function
/// fn rename_and_lowercase_color(_app: &tauri::AppHandle, mut value: Value) -> Result<Value, String> {
///     let obj = value.as_object_mut()
///         .ok_or("Expected object")?;
///     
///     // Take the old key's value, lowercase it, and insert under new key
///     if let Some(color) = obj.remove("preffered_color") {
///         let lowercase_color = color
///             .as_str()
///             .map(|s| serde_json::json!(s.to_lowercase()))
///             .unwrap_or(color);
///         obj.insert("default_color".into(), lowercase_color);
///     }
///     
///     Ok(value)
/// }
///
/// // Register it
/// data_migration!(
///     to_schema: 2,
///     name: "rename_preferred_color_to_default",
///     store: GeneralSettings,
///     rename_and_lowercase_color
/// );
/// ```
#[macro_export]
macro_rules! data_migration {
    (to_schema: $version:expr, name: $name:expr, store: $store:ident, $migrate_fn:path) => {
        async fn __data_migration_wrapper(app: &tauri::AppHandle) -> Result<(), String> {
            use $crate::store_migration::{Store, edit_store};

            edit_store(app, Store::$store, |app, value| {
                $migrate_fn(app, value)
            }).await
        }

        inventory::submit! {
            $crate::Migration {
                version: $version,
                name: $name,
                run: {
                    fn __run_boxed(
                        app: &tauri::AppHandle,
                    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> {
                        let app = app.clone();
                        Box::pin(async move { __data_migration_wrapper(&app).await })
                    }
                    __run_boxed
                }
            }
        }
    };
}
