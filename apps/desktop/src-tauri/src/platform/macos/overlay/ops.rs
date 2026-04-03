use cocoa::base::{YES, id, nil};
use cocoa::foundation::{NSPoint, NSRect, NSSize};
use dispatch2::Queue;
use objc::runtime::{BOOL, Class, Sel};
use objc::{class, msg_send, sel, sel_impl};

use tauri::{AppHandle, Manager, Runtime, Window};

use super::JsRect;
use super::registry::{OverlayRegistry, ViewHandle};

// ============================================================================
// Coordinate Conversion
// ============================================================================

/// CSS uses top-left origin; NSView uses bottom-left.
/// `window_height` is the logical (point) height of the contentView.
fn to_ns_rect(r: JsRect, window_height: f64) -> NSRect {
    NSRect {
        origin: NSPoint {
            x: r.x,
            y: window_height - r.y - r.height,
        },
        size: NSSize {
            width: r.width,
            height: r.height,
        },
    }
}

fn logical_content_height<R: Runtime>(window: &Window<R>) -> Result<f64, String> {
    let scale = window
        .scale_factor()
        .map_err(|_| "Failed to get scale factor".to_string())?;
    let size = window
        .inner_size()
        .map_err(|_| "Failed to get inner size".to_string())?;
    Ok(size.height as f64 / scale)
}

// ============================================================================
// Backend Selection
// ============================================================================

fn glass_class() -> Option<&'static Class> {
    Class::get("NSGlassEffectView")
}

fn ns_visual_effect_class() -> &'static Class {
    class!(NSVisualEffectView)
}

// ============================================================================
// Create
// ============================================================================

pub fn create_overlay<R: Runtime>(
    app: &AppHandle<R>,
    window: &Window<R>,
    id: String,
    rect: JsRect,
    corner_radius: f64,
    variant: i32,
) -> Result<(), String> {
    let registry = app.state::<OverlayRegistry>();
    let window_label = window.label().to_string();
    let height = logical_content_height(window)?;
    let ns_rect = to_ns_rect(rect, height);

    let ns_window = window.ns_window().unwrap();

    let ns_window_handle = ViewHandle::new(ns_window as id);

    let (tx, rx) = std::sync::mpsc::sync_channel::<Result<ViewHandle, String>>(1);

    run_on_main_sync(move || {
        let result = unsafe { build_and_attach(ns_window_handle, ns_rect, corner_radius, variant) };
        let _ = tx.send(result);
    });

    let view_handle = rx
        .recv()
        .map_err(|_| "Failed to create view".to_string())??;

    registry.insert(id, view_handle, window_label).unwrap();

    Ok(())
}

/// # Safety
/// Must be called on the main thread.
unsafe fn build_and_attach(
    ns_window_handle: ViewHandle,
    frame: NSRect,
    corner_radius: f64,
    variant: i32,
) -> Result<ViewHandle, String> {
    let ns_window = unsafe { ns_window_handle.as_id() };
    let content_view: id = msg_send![ns_window, contentView];
    if content_view == nil {
        return Err("Failed to create view, no content_view".to_string());
    }

    unsafe {
        let view = if let Some(glass_cls) = glass_class() {
            build_native_glass(glass_cls, frame, corner_radius, variant)
        } else {
            build_visual_effect_fallback(frame, corner_radius)
        }?;

        // Add on top of everything (default addSubview: places above all siblings)
        let _: () = msg_send![content_view, addSubview: view];

        Ok(ViewHandle::new(view))
    }
}

/// NSGlassEffectView (macOS 26+)
///
/// # Safety
/// Must be called on the main thread.
unsafe fn build_native_glass(
    cls: &Class,
    frame: NSRect,
    corner_radius: f64,
    variant: i32,
) -> Result<id, String> {
    let view: id = msg_send![cls, alloc];
    let view: id = msg_send![view, initWithFrame: frame];

    let _: () = msg_send![view, setWantsLayer: YES];
    unsafe {
        apply_corner_radius(view, corner_radius);
        set_variant(view, variant);
        autoresize(view);
    }
    Ok(view)
}

/// NSVisualEffectView fallback — uses .popover material as closest approximation.
///
/// # Safety
/// Must be called on the main thread.
unsafe fn build_visual_effect_fallback(frame: NSRect, corner_radius: f64) -> Result<id, String> {
    // NSVisualEffectBlendingMode::WithinWindow = 1
    // NSVisualEffectMaterial::Popover          = 6
    // NSVisualEffectState::Active              = 1
    let view: id = msg_send![ns_visual_effect_class(), alloc];
    let view: id = msg_send![view, initWithFrame: frame];

    let _: () = msg_send![view, setBlendingMode: 1i64];
    let _: () = msg_send![view, setMaterial: 6i64];
    let _: () = msg_send![view, setState: 1i64];
    let _: () = msg_send![view, setWantsLayer: YES];
    unsafe {
        apply_corner_radius(view, corner_radius);
        autoresize(view);
    }
    Ok(view)
}

// ============================================================================
// Update
// ============================================================================

pub fn update_overlay<R: Runtime>(
    app: &AppHandle<R>,
    window: &Window<R>,
    id: &str,
    rect: JsRect,
) -> Result<(), String> {
    let registry = app.state::<OverlayRegistry>();
    let (view_handle, _) = registry
        .get(id)?
        .ok_or_else(|| "View not found inside registry".to_string())?;

    let height = logical_content_height(window)?;
    let ns_rect = to_ns_rect(rect, height);

    run_on_main_sync(move || unsafe {
        let _: () = msg_send![view_handle.as_id(), setFrame: ns_rect];
    });

    Ok(())
}

// ============================================================================
// Destroy
// ============================================================================

pub fn destroy_overlay<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<(), String> {
    let registry = app.state::<OverlayRegistry>();
    let Some((view_handle, _)) = registry.remove(id)? else {
        return Ok(()); // already gone — idempotent
    };

    run_on_main_sync(move || unsafe {
        let _: () = msg_send![view_handle.as_id(), removeFromSuperview];
        // ARC handles dealloc once the superview ref is dropped
    });

    Ok(())
}

// ============================================================================
// Helpers
// ============================================================================

/// # Safety: main thread, valid view with a layer.
unsafe fn apply_corner_radius(view: id, radius: f64) {
    let layer: id = msg_send![view, layer];
    if layer != nil {
        let _: () = msg_send![layer, setCornerRadius: radius];
        let _: () = msg_send![layer, setMasksToBounds: YES];
    }
}

/// NSAutoresizingMask: widthSizable | heightSizable = 0x12
unsafe fn autoresize(view: id) {
    let _: () = msg_send![view, setAutoresizingMask: 0x12u64];
}

/// Try private `set_variant:` then public `setVariant:`.
/// The 22 non-public variants are accessible this way at runtime —
/// same technique used in the backend you referenced.
///
/// # Safety: main thread.
unsafe fn set_variant(view: id, variant: i32) {
    let private = Sel::register("set_variant:");
    let public = Sel::register("setVariant:");

    for sel in [private, public] {
        let responds: BOOL = msg_send![view, respondsToSelector: sel];
        if responds {
            let _: () = unsafe {
                objc::__send_message(&*(view as *mut objc::runtime::Object), sel, (variant,))
                    .unwrap_or(())
            };
            return;
        }
    }
}

/// Execute a closure on the main thread synchronously.
///
/// This is necessary because all NSView operations must be performed on the main thread.
/// If already on the main thread, the closure is executed directly.
pub fn run_on_main_sync<F, R>(f: F) -> R
where
    F: FnOnce() -> R + Send + 'static,
    R: Send + 'static,
{
    if is_main_thread() {
        f()
    } else {
        use std::sync::mpsc;
        let (tx, rx) = mpsc::channel();

        Queue::main().exec_async(move || {
            let result = f();
            let _ = tx.send(result);
        });

        rx.recv()
            .expect("Failed to receive result from main thread")
    }
}

/// Check if the current thread is the main thread
fn is_main_thread() -> bool {
    unsafe {
        let is_main: BOOL = msg_send![class!(NSThread), isMainThread];
        is_main != cocoa::base::NO
    }
}
