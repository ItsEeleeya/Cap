use std::path::{Path, PathBuf};

use cap_project::RecordingMeta;
use futures::StreamExt;
use tauri::{AppHandle, Manager};

crate::migration!(to_schema: 1, name: "Migrate project names from UUIDs", migrate_test);

pub async fn migrate_test(app: &AppHandle) -> Result<(), String> {
    tracing::info!("Running schema: 1 migration");
    Ok(())
}

crate::migration!(to_schema: 2, name: "Schema 2", migrate_test2);

pub async fn migrate_test2(app: &AppHandle) -> Result<(), String> {
    tracing::info!("Running schema: 2 migration");
    Ok(())
}

/// Performs a one-time migration of all UUID-named projects to pretty name-based naming.
/// This function uses parallel processing with controlled concurrency for improved performance.
///
/// # Returns
///
/// Returns Ok with the number of successfully migrated projects, or an error if the
/// recordings directory cannot be accessed.
pub async fn migrate(app: &AppHandle) -> Result<(), String> {
    let recordings_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Couldn't get Cap's data directory: {e}"))?
        .join("recordings");

    std::fs::create_dir_all(&recordings_dir).unwrap_or_default();

    // Check if recordings directory exists
    if !tokio::fs::try_exists(&recordings_dir)
        .await
        .map_err(|e| format!("Failed to check recordings directory: {}", e))?
    {
        return Ok(());
    }

    // Collect all UUID-named project paths
    let mut uuid_projects = Vec::new();
    let mut entries = tokio::fs::read_dir(&recordings_dir)
        .await
        .map_err(|e| format!("Failed to read recordings directory: {}", e))?;

    loop {
        match entries.next_entry().await {
            Ok(Some(entry)) => {
                let path = entry.path();

                if path.is_dir() && path.extension().and_then(|s| s.to_str()) == Some("cap") {
                    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("");

                    if is_project_filename_uuid(filename) {
                        uuid_projects.push(path);
                    }
                }
            }
            Ok(None) => break,
            Err(e) => return Err(format!("Failed to read directory entry: {}", e)),
        }
    }

    if uuid_projects.is_empty() {
        return Ok(());
    }

    println!(
        "Found {} UUID-named projects to migrate",
        uuid_projects.len()
    );

    // Determine concurrency limit
    let concurrency_limit = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4)
        .min(32)
        .min(uuid_projects.len());

    // Process projects with controlled concurrency
    let migration_results = futures::stream::iter(uuid_projects)
        .map(|path| async move {
            let filename = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown");

            // Convert error to String immediately to make the future Send
            let meta = match RecordingMeta::load_for_project(&path) {
                Ok(meta) => meta,
                Err(e) => {
                    let error_msg = format!("Failed to load metadata for {}: {}", filename, e);
                    eprintln!("{}", error_msg);
                    return Err(error_msg);
                }
            };

            match migrate_project_filename_if_needed_async(&path, &meta).await {
                Ok(new_path) => {
                    if new_path != path {
                        let new_name = new_path.file_name().unwrap().to_string_lossy();
                        println!("Migrated: {} -> {}", filename, new_name);
                        Ok(1)
                    } else {
                        Ok(0)
                    }
                }
                Err(e) => {
                    let error_msg = format!("Failed to migrate {}: {}", filename, e);
                    eprintln!("{}", error_msg);
                    Err(error_msg)
                }
            }
        })
        .buffer_unordered(concurrency_limit)
        .collect::<Vec<_>>()
        .await;

    // Collect results
    let mut total_migrated = 0;
    let mut errors = Vec::new();

    for result in migration_results {
        match result {
            Ok(count) => total_migrated += count,
            Err(error) => errors.push(error),
        }
    }

    // Report results
    if total_migrated > 0 {
        println!(
            "Successfully migrated {} UUID-named projects to pretty names",
            total_migrated
        );
    }

    if !errors.is_empty() {
        eprintln!("Migration completed with {} errors:", errors.len());
        for error in errors {
            eprintln!("  {}", error);
        }
    }

    Ok(())
}

/// Migrates a project directory from UUID-based naming to pretty name-based naming if needed.
///
/// This function checks if the project directory uses UUID naming (e.g., "a1b2c3d4-e5f6-7890-abcd-ef1234567890.cap")
/// and renames it to use the sanitized pretty name from the project metadata.
///
/// # Arguments
///
/// * `project_path` - The current path to the project directory
/// * `meta` - The project metadata containing the pretty name
///
/// # Returns
///
/// Returns the new path if migration occurred, or the original path if no migration was needed.
/// The function handles filename conflicts by appending a timestamp.
pub fn migrate_project_filename_if_needed(
    project_path: &Path,
    meta: &RecordingMeta,
) -> Result<PathBuf, String> {
    let Some(file_name) = project_path.file_name().and_then(|p| p.to_str()) else {
        return Ok(project_path.to_path_buf());
    };

    println!(
        "File name migration: Checking \"{}\"",
        project_path.display()
    );

    if !is_project_filename_uuid(file_name) {
        println!("File name migration: Not uuid!");
        return Ok(project_path.to_path_buf());
    }

    // Sanitize the pretty name for use as a filename
    let sanitized = sanitize_filename::sanitize_with_options(
        &meta.pretty_name,
        sanitize_filename::Options {
            windows: cfg!(windows),
            truncate: true,
            replacement: "-",
        },
    );

    if sanitized.trim().is_empty() || sanitized == "-" {
        return Err(format!("Sanitized filename is invalid: '{}'", sanitized));
    }

    println!(
        "File name migration: New name sanitized: \"{}\"",
        &sanitized
    );

    let new_filename = if sanitized.ends_with(".cap") {
        sanitized
    } else {
        format!("{}.cap", sanitized)
    };

    let parent_dir = project_path
        .parent()
        .ok_or("Project path has no parent directory")?;

    println!(
        "File name migration: Parent dir: \"{}\"",
        &parent_dir.display()
    );

    let new_path = parent_dir.join(&cap_utils::ensure_unique_filename(
        &new_filename,
        parent_dir,
    )?);

    println!("File name migration: New path \"{}\"", &new_path.display());

    std::fs::rename(project_path, &new_path)
        .map_err(|e| format!("Failed to rename project directory: {}", e))?;

    Ok(new_path)
}

pub fn is_project_filename_uuid(filename: &str) -> bool {
    if filename.len() != 40 || !filename.ends_with(".cap") {
        return false;
    }

    let uuid_part = &filename[..36];
    let segments: Vec<&str> = uuid_part.split('-').collect();

    // UUID has 5 segments: 8-4-4-4-12
    if segments.len() != 5 {
        return false;
    }

    segments[0].len() == 8
        && segments[1].len() == 4
        && segments[2].len() == 4
        && segments[3].len() == 4
        && segments[4].len() == 12
        && uuid_part.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

/// Migrates a project filename if needed, using atomic operations.
async fn migrate_project_filename_if_needed_async(
    project_path: &std::path::Path,
    meta: &RecordingMeta,
) -> Result<std::path::PathBuf, String> {
    let filename = project_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or("Invalid project path")?;

    if !is_project_filename_uuid(filename) {
        return Ok(project_path.to_path_buf());
    }

    // Create sanitized filename from pretty name
    let sanitized = sanitize_filename::sanitize_with_options(
        &meta.pretty_name,
        sanitize_filename::Options {
            windows: cfg!(windows),
            truncate: true,
            replacement: "-",
        },
    );

    if sanitized.trim().is_empty() || sanitized == "-" {
        return Err(format!("Sanitized filename is invalid: '{}'", sanitized));
    }

    let new_filename = format!("{}.cap", sanitized);
    let parent_dir = project_path.parent().ok_or("Invalid project path")?;

    // Ensure unique filename
    let unique_filename = cap_utils::ensure_unique_filename(&new_filename, parent_dir)
        .map_err(|e| format!("Failed to ensure unique filename: {}", e))?;

    let final_path = parent_dir.join(&unique_filename);

    // Atomic rename operation
    tokio::fs::rename(project_path, &final_path)
        .await
        .map_err(|e| format!("Failed to rename project directory: {}", e))?;

    Ok(final_path)
}
