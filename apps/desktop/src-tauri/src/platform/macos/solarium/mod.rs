mod ops;
mod registry;
mod types;

pub use types::{GlassEffectVariant, JsRect};

use objc2::{
    MainThreadMarker, msg_send,
    runtime::{AnyClass, AnyObject},
};
use objc2_app_kit::{NSColor, NSGlassEffectView, NSWindow};
use registry::{MainThreadPtr, OverlayEntry, SolariumRegistry};
use std::ptr::NonNull;
use tauri::{
    AppHandle, Listener, Manager, Runtime, State,
    plugin::{Builder, TauriPlugin},
};
use types::{OverlayUpdatePayload, SolariumOverlay, TintColor};

fn dump_class(name: &std::ffi::CStr) {
    let rname = name.to_string_lossy();
    let Some(cls) = AnyClass::get(name) else {
        println!("{rname} not found");
        return;
    };

    let mut count: u32 = 0;
    let methods = unsafe { objc2::ffi::class_copyMethodList(cls as *const AnyClass, &mut count) };

    println!("=== {rname} ({count} methods) ===");
    for i in 0..count as usize {
        let method = unsafe { *methods.add(i) };
        let sel = unsafe { objc2::ffi::method_getName(method) }.unwrap();
        let sel_name = unsafe { std::ffi::CStr::from_ptr(objc2::ffi::sel_getName(sel)) };

        // Type encoding: return type + arg types
        let enc = unsafe {
            let raw = objc2::ffi::method_getTypeEncoding(method);
            if raw.is_null() {
                "<no encoding>".into()
            } else {
                std::ffi::CStr::from_ptr(raw).to_string_lossy().into_owned()
            }
        };

        println!("  -{} :: {}", sel_name.to_string_lossy(), enc);
    }

    unsafe { objc2::ffi::free(methods as *mut _) };
}

fn dump_ivars(name: &std::ffi::CStr) {
    let Some(cls) = AnyClass::get(name) else {
        return;
    };

    let mut count: u32 = 0;
    let ivars = unsafe { objc2::ffi::class_copyIvarList(cls as *const AnyClass, &mut count) };

    println!("=== ivars: {} ===", name.to_string_lossy());
    for i in 0..count as usize {
        let ivar = unsafe { *ivars.add(i) };

        let ivar_name = unsafe {
            let p = objc2::ffi::ivar_getName(ivar);
            if p.is_null() {
                "<unnamed>".into()
            } else {
                std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned()
            }
        };

        let type_enc = unsafe {
            let p = objc2::ffi::ivar_getTypeEncoding(ivar);
            if p.is_null() {
                "<none>".into()
            } else {
                std::ffi::CStr::from_ptr(p).to_string_lossy().into_owned()
            }
        };

        println!("  {} :: {}", ivar_name, type_enc);
    }

    unsafe { objc2::ffi::free(ivars as *mut _) };
}

pub fn init<R: Runtime>() -> TauriPlugin<R, ()> {
    Builder::<R, ()>::new("solarium")
        // Command registration is handled through Specta and the app invoke handler.
        // .invoke_handler(tauri::generate_handler![
        //     create_solarium_overlay,
        //     destroy_solarium_overlay
        // ])
        .setup(|app, _| {
            // TEST

            println!("DUMP START");
            dump_class(c"NSGlassEffectView");
            println!("DUMP END");

            dump_ivars(c"NSGlassEffectView");
            dump_ivars(c"_Material");
            dump_ivars(c"_GlassRecipe"); // probable name — try it
            dump_ivars(c"_ContentLensing"); // if it's a struct class

            if !app.manage(SolariumRegistry::default()) {
                return Err("solarium registry already installed".into());
            }
            let app_handle = app.clone();
            app.listen("overlay://update", move |event| {
                let Ok(payload) = serde_json::from_str::<OverlayUpdatePayload>(event.payload())
                else {
                    return;
                };
                let prep = match app_handle
                    .state::<SolariumRegistry>()
                    .prepare_update(&payload.id, payload.rect)
                {
                    Ok(p) => p,
                    Err(_) => return,
                };
                let Some((view, window_label, rect)) = prep else {
                    return;
                };
                let Some(window) = app_handle.get_webview_window(&window_label) else {
                    return;
                };
                let raw_win = match window.ns_window() {
                    Ok(w) => w,
                    Err(_) => return,
                };
                let raw_win = raw_win as usize;
                let app2 = app_handle.clone();
                if app2
                    .run_on_main_thread(move || {
                        let raw_win = raw_win as *mut NSWindow;
                        let mtm = match MainThreadMarker::new() {
                            Some(m) => m,
                            None => {
                                return;
                            }
                        };

                        // test
                        {
                            let view = NSGlassEffectView::new(mtm);
                            let subvariant: *mut AnyObject =
                                unsafe { msg_send![&*view, _subvariant] };
                            if !subvariant.is_null() {
                                let cls: *const AnyClass = unsafe { msg_send![subvariant, class] };
                                let name = unsafe {
                                    std::ffi::CStr::from_ptr(objc2::ffi::class_getName(cls))
                                };
                                println!("subvariant class: {}", name.to_string_lossy());
                            }
                        }

                        let ns_window: &NSWindow = unsafe { &*raw_win };
                        if let Some(win_nn) =
                            NonNull::new(ns_window as *const NSWindow as *mut NSWindow)
                        {
                            let win_ptr = unsafe {
                                // SAFETY: `ns_window` is the live window from Tauri for the duration of the overlay entry.
                                crate::platform::solarium::registry::MainThreadPtr::from_nonnull(
                                    win_nn,
                                )
                            };
                            let _ = ops::apply_overlay_frame(view, win_ptr, rect);
                        }
                    })
                    .is_err()
                {
                    return;
                }
            });
            println!("Solarium overlay registered!");
            Ok(())
        })
        .build()
}

#[tauri::command]
#[specta::specta]
pub fn create_solarium_overlay(
    app: AppHandle,
    registry: State<'_, SolariumRegistry>,
    window: tauri::Window,
    id: String,
    overlay: SolariumOverlay,
) -> Result<(), String> {
    if let Some(entry) = registry.remove_entry(&id)? {
        let _ = ops::run_destroy_overlay(&app, entry.outer_view);
    }

    let opts = overlay.glass_options.clone();
    let opts_clone = opts.clone();
    let view = ops::run_create_overlay(&app, &window, overlay.rect, opts.unwrap_or_default())?;

    let entry = OverlayEntry {
        outer_view: view,
        window_label: window.label().to_string(),
        last_rect: Some(overlay.rect),
        glass_options: opts_clone,
    };

    match registry.insert_entry(id, entry) {
        Ok(()) => Ok(()),
        Err((e, ent)) => {
            let _ = ops::run_destroy_overlay(&app, ent.outer_view);
            Err(e)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn update_solarium_overlay(
    app: AppHandle,
    registry: State<'_, SolariumRegistry>,
    window: tauri::Window,
    id: String,
    overlay: SolariumOverlay,
) -> Result<(), String> {
    if let Some(entry) = registry.remove_entry(&id)? {
        let _ = ops::run_destroy_overlay(&app, entry.outer_view);
    }

    let opts = overlay.glass_options.clone();
    let opts_clone = opts.clone();
    let view = ops::run_create_overlay(&app, &window, overlay.rect, opts.unwrap_or_default())?;

    let entry = OverlayEntry {
        outer_view: view,
        window_label: window.label().to_string(),
        last_rect: Some(overlay.rect),
        glass_options: opts_clone,
    };

    match registry.insert_entry(id, entry) {
        Ok(()) => Ok(()),
        Err((e, ent)) => {
            let _ = ops::run_destroy_overlay(&app, ent.outer_view);
            Err(e)
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn destroy_solarium_overlay(
    app: AppHandle,
    registry: State<'_, SolariumRegistry>,
    id: String,
) -> Result<(), String> {
    let Some(entry) = registry.remove_entry(&id)? else {
        return Ok(());
    };
    ops::run_destroy_overlay(&app, entry.outer_view)
}
