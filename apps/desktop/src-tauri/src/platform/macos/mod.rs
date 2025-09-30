use anyhow::anyhow;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSToolbar, NSWindowToolbarStyle};
use objc2_foundation::{NSOperatingSystemVersion, NSProcessInfo};

pub mod delegates;

pub fn add_toolbar_shell(window: &tauri::Window, compact: bool) -> tauri::Result<()> {
    let mtm = MainThreadMarker::new()
        .ok_or_else(|| tauri::Error::Anyhow(anyhow!("Failed to create MainThreadMarker")))?;

    let nswindow: *mut objc2_app_kit::NSWindow = window.ns_window()?.cast();
    unsafe {
        let toolbar = NSToolbar::new(mtm);
        toolbar.setAllowsUserCustomization(false);
        toolbar.setAutosavesConfiguration(false);
        toolbar.setDisplayMode(objc2_app_kit::NSToolbarDisplayMode::IconOnly);
        toolbar.setAllowsDisplayModeCustomization(false);
        (*nswindow).setToolbar(Some(&toolbar));
        (*nswindow).setToolbarStyle(if compact {
            NSWindowToolbarStyle::UnifiedCompact
        } else {
            NSWindowToolbarStyle::Unified
        });
    }
    Ok(())
}

pub fn set_window_level(window: tauri::Window, level: objc2_app_kit::NSWindowLevel) {
    let c_window = window.clone();
    _ = window.run_on_main_thread(move || unsafe {
        let ns_win = c_window
            .ns_window()
            .expect("Failed to get native window handle")
            as *const objc2_app_kit::NSWindow;
        (*ns_win).setLevel(level);
    });
}

#[inline]
pub fn is_macos_at_least(major: isize, minor: isize, patch: isize) -> bool {
    // Safety: calling into Objective-C runtime through the objc2_foundation bindings.
    // The objc method `-isOperatingSystemAtLeastVersion:` is documented and safe to call.
    unsafe {
        NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion {
            majorVersion: major,
            minorVersion: minor,
            patchVersion: patch,
        })
    }
}

#[macro_export]
macro_rules! available {
    (macOS $major:expr) => {
        $crate::platform::macos::is_macos_at_least($major as isize, 0isize, 0isize)
    };
    (macOS $major:expr, $minor:expr) => {
        $crate::platform::macos::is_macos_at_least($major as isize, $minor as isize, 0isize)
    };
    (macOS $major:expr, $minor:expr, $patch:expr) => {
        $crate::platform::macos::is_macos_at_least(
            $major as isize,
            $minor as isize,
            $patch as isize,
        )
    };
}
