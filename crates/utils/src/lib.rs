use std::{future::Future, path::PathBuf};

use tracing::Instrument;

/// Wrapper around tokio::spawn that inherits the current tracing subscriber and span.
pub fn spawn_actor<F>(future: F) -> tokio::task::JoinHandle<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    use tracing::instrument::WithSubscriber;
    tokio::spawn(future.with_current_subscriber().in_current_span())
}

pub fn ensure_dir(path: &PathBuf) -> Result<PathBuf, std::io::Error> {
    std::fs::create_dir_all(path)?;
    Ok(path.clone())
}

/// Generates a unique filename by appending incremental numbers if conflicts exist.
///
/// This function takes a base filename and ensures it's unique by appending `(1)`, `(2)`, etc.
/// if a file with the same name already exists. It works with any file extension.
///
/// # Arguments
///
/// * `base_filename` - The desired filename (with extension)
/// * `parent_dir` - The directory where the file should be created
///
/// # Returns
///
/// Returns the unique filename that doesn't conflict with existing files.
///
/// # Example
///
/// ```rust
/// let unique_name = ensure_unique_filename("My Recording.cap", &recordings_dir);
/// // If "My Recording.cap" exists, returns "My Recording (1).cap"
/// // If that exists too, returns "My Recording (2).cap", etc.
///
/// let unique_name = ensure_unique_filename("document.pdf", &documents_dir);
/// // If "document.pdf" exists, returns "document (1).pdf"
/// ```
pub fn ensure_unique_filename(
    base_filename: &str,
    parent_dir: &std::path::Path,
) -> Result<String, String> {
    let initial_path = parent_dir.join(base_filename);

    if !initial_path.exists() {
        println!("Ensure unique filename: is free!");
        return Ok(base_filename.to_string());
    }

    let path = std::path::Path::new(base_filename);
    let (name_without_ext, extension) = if let Some(ext) = path.extension() {
        let name_without_ext = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(base_filename);
        let extension = format!(".{}", ext.to_string_lossy());
        (name_without_ext, extension)
    } else {
        (base_filename, String::new())
    };

    let mut counter = 1;

    loop {
        let numbered_filename = if extension.is_empty() {
            format!("{} ({})", name_without_ext, counter)
        } else {
            format!("{} ({}){}", name_without_ext, counter, &extension)
        };

        let test_path = parent_dir.join(&numbered_filename);

        println!("Ensure unique filename: test path count \"{counter}\"");

        if !test_path.exists() {
            println!(
                "Ensure unique filename: Found free! \"{}\"",
                &test_path.display()
            );
            return Ok(numbered_filename);
        }

        counter += 1;

        // prevent infinite loop
        if counter > 1000 {
            return Err(
                "Too many filename conflicts, unable to create unique filename".to_string(),
            );
        }
    }
}
