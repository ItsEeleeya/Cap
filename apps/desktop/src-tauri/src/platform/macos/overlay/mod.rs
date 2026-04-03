mod ops;
mod registry;

pub use registry::OverlayRegistry;

use serde::Deserialize;
use tauri::{
    AppHandle, Manager, Runtime, Window,
    plugin::{Builder, TauriPlugin},
};

#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
pub struct JsRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
#[specta::specta]
pub fn create_overlay(
    app: AppHandle,
    window: Window,
    id: String,
    rect: JsRect,
    corner_radius: f64,
    variant: i32,
) -> Result<(), String> {
    ops::create_overlay(&app, &window, id, rect, corner_radius, variant)
}

#[tauri::command]
#[specta::specta]
pub fn update_overlay(
    app: AppHandle,
    window: Window,
    id: String,
    rect: JsRect,
) -> Result<(), String> {
    ops::update_overlay(&app, &window, &id, rect)
}

#[tauri::command]
#[specta::specta]
pub fn destroy_overlay(app: AppHandle, id: String) -> Result<(), String> {
    ops::destroy_overlay(&app, &id)
}

// ── Plugin Init ───────────────────────────────────────────────────────────────

// pub fn init<R: Runtime>() -> TauriPlugin<R> {
//     Builder::new("overlay")
//         .setup(|app, _| {
//             app.manage(OverlayRegistry::default());
//             Ok(())
//         })
//         .invoke_handler(tauri::generate_handler![
//             create_overlay,
//             update_overlay,
//             destroy_overlay,
//         ])
//         .build()
// }
