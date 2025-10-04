use block2::ConcreteBlock;
use lazy_static::lazy_static;
use objc2::{MainThreadMarker, rc::Retained};
use objc2_app_kit::{
    NSToolbar, NSWindow, NSWindowButton, NSWindowToolbarStyle,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{
    NSNotificationCenter, NSOperatingSystemVersion, NSOperationQueue, NSProcessInfo,
};
use tauri::AppHandle;

use crate::general_settings::GeneralSettingsStore;

lazy_static! {
    pub static ref MACOS_26_AVAILABLE: bool = unsafe {
        NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
            majorVersion: 26,
            minorVersion: 0,
            patchVersion: 0,
        })
    };
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
    *MACOS_26_AVAILABLE
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

// #[inline]
// pub fn is_macos_at_least(major: isize, minor: isize, patch: isize) -> bool {
//     // Safety: calling into Objective-C runtime through the objc2_foundation bindings.
//     // The objc method `-isOperatingSystemAtLeastVersion:` is documented and safe to call.
//     unsafe {
//         NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
//             majorVersion: major,
//             minorVersion: minor,
//             patchVersion: patch,
//         })
//     }
// }

// #[macro_export]
// macro_rules! available {
//     (macOS $major:expr) => {
//         $crate::platform::macos::is_macos_at_least($major as isize, 0isize, 0isize)
//     };
//     (macOS $major:expr, $minor:expr) => {
//         $crate::platform::macos::is_macos_at_least($major as isize, $minor as isize, 0isize)
//     };
//     (macOS $major:expr, $minor:expr, $patch:expr) => {
//         $crate::platform::macos::is_macos_at_least(
//             $major as isize,
//             $minor as isize,
//             $patch as isize,
//         )
//     };
// }
