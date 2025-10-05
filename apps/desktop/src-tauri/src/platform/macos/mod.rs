use block2::ConcreteBlock;
use lazy_static::lazy_static;
use objc2::{MainThreadMarker, rc::Retained};
use objc2_app_kit::{
    NSToolbar, NSWindow, NSWindowButton, NSWindowToolbarStyle,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{NSNotificationCenter, NSObjectProtocol, NSOperationQueue};
use tauri::{AppHandle, WebviewWindowBuilder};

use crate::general_settings::GeneralSettingsStore;

mod sc_shareable_content;

pub use sc_shareable_content::*;

// Tries enabling support for native macOS materials within the WKWebView
// by setting the value inside the WKWebView's configuration.
// This is achieved by setting a private, undocumented preference on the webview's configuration.
//
// "When a "hosted material" is used, a structural layer is created to encapsulate
// the content layer. In the UI process, the structural layer is realized using
// SwiftUI. On iOS, a `_UIHostingView` is created, and on macOS a `_CALayerView`
// is created. A `materialEffect` is then applied to their respective root views.
// WebKit's own layers are parented underneath the SwiftUI-created views/layers."
//
// For more context, see the original WebKit commit that introduced this feature:
// https://github.com/WebKit/WebKit/commit/99b9a154a6f7e44e8a17c81b12919b8bf76fa6ce
pub fn try_enable_use_system_appearance_for_webview_builder<T>(
    builder: &mut &WebviewWindowBuilder<'_, T, AppHandle>,
    app_handle: &AppHandle,
) -> (WebviewWindowBuilder<'_, T, AppHandle>, anyhow::Result<()>) {
    if (!solarium_enabled(app_handle)) {
        return (builder, Ok(()));
    }

    builder = dispatch2::run_on_main(move |mtm| unsafe {
        // SAFETY: This block is safe for several reasons:
        // 1.  **Main Thread Execution:** All operations on AppKit and WebKit UI components
        //     are dispatched to the main thread, which is a requirement for their APIs.
        // 2.  **FFI Correctness:** We are making FFI calls to Objective-C. The selectors
        //     (`new`, `setValue:forKey:`, `setPreferences:`) and class names are known to
        //     be valid for the target macOS version. We assume the underlying Apple
        //     frameworks are stable.
        // 3.  **Use of Private API:** The key `"useSystemAppearance"` is a private,
        //     non-public API. While this carries the risk of breaking in future macOS
        //     or WebKit updates, its usage is gated by the `solarium_enabled` check,
        //     which can be updated if the underlying API changes or is removed.
        use objc2_foundation::{NSObjectNSKeyValueCoding, ns_string};
        let preferences = objc2_web_kit::WKPreferences::new(mtm);

        let key = ns_string!("useSystemAppearance");

        // Ensure the key exists before setting. Otherwise this can panic.
        if preferences.valueForKey(key).is_some() {
            let yes = objc2_foundation::NSNumber::new_bool(true);
            preferences.setValue_forKey(Some(&yes), key);
            let target_configuration = objc2_web_kit::WKWebViewConfiguration::new(mtm);
            target_configuration.setPreferences(&preferences);
            builder = builder.with_webview_configuration(target_configuration);
        } else {
            return (
                builder,
                Err(anyhow::anyhow!(
                    "Tried setting \"seSystemAppearance\" but it does not exist!"
                )),
            );
        }

        (builder, Ok(()))
    })
}

pub fn set_window_buttons_visibility(window: &tauri::Window, visible: bool) -> tauri::Result<()> {
    unsafe {
        for btn in [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ] {
            if let Some(btn) = (*(window.ns_window()? as *mut NSWindow)).standardWindowButton(btn) {
                btn.setHidden(!visible);
            }
        }
    }
    Ok(())
}

pub fn solarium_enabled(app_handle: &AppHandle) -> bool {
    objc2::available!(macos = 26.0)
        && GeneralSettingsStore::get(app_handle)
            .ok()
            .flatten()
            .unwrap_or_default()
            .solarium_enabled
}

pub fn add_toolbar_shell(window: &tauri::Window, mtm: MainThreadMarker) -> tauri::Result<()> {
    let nswindow: *mut NSWindow = window.ns_window()?.cast();
    unsafe {
        let window = Retained::from_raw(nswindow).unwrap();

        let toolbar = NSToolbar::new(mtm);
        toolbar.setAllowsUserCustomization(false);
        toolbar.setAutosavesConfiguration(false);
        toolbar.setDisplayMode(objc2_app_kit::NSToolbarDisplayMode::IconOnly);
        toolbar.setAllowsDisplayModeCustomization(false);

        window.setToolbar(Some(&toolbar));
        window.setToolbarStyle(NSWindowToolbarStyle::Unified);

        let queue = NSOperationQueue::mainQueue();
        let mut nc = NSNotificationCenter::defaultCenter();

        nc.addObserverForName_object_queue_usingBlock(
            Some(NSWindowWillEnterFullScreenNotification),
            Some(&window),
            Some(&queue),
            &ConcreteBlock::new(move |notification| {
                println!("Hi lol");
            }),
        );
    }

    Ok(())
}

pub fn set_window_level(
    window: tauri::Window,
    level: objc2_app_kit::NSWindowLevel,
) -> tauri::Result<()> {
    let c_window = window.clone();
    window.run_on_main_thread(move || unsafe {
        let ns_win = c_window
            .ns_window()
            .expect("Failed to get native window handle")
            as *const objc2_app_kit::NSWindow;
        (*ns_win).setLevel(level);
    })
}
