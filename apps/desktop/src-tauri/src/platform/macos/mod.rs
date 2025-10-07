use block2::StackBlock;

use dispatch2::run_on_main;
use objc2::{MainThreadMarker, Message, rc::Retained};
use objc2_app_kit::{
    NSToolbar, NSWindowButton, NSWindowDidExitFullScreenNotification, NSWindowLevel,
    NSWindowToolbarStyle, NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::NSNotificationCenter;
use tauri::{AppHandle, WebviewWindow};

use crate::general_settings::GeneralSettingsStore;

mod sc_shareable_content;

pub use sc_shareable_content::*;

pub fn solarium_enabled(app_handle: &AppHandle) -> bool {
    objc2::available!(macos = 26.0)
        && GeneralSettingsStore::get(app_handle)
            .ok()
            .flatten()
            .unwrap_or_default()
            .solarium_enabled
}

pub trait WebviewWindowExt {
    fn objc2_nswindow(&self) -> &objc2_app_kit::NSWindow;

    fn set_window_buttons_visible(&self, visible: bool);

    fn set_level(&self, level: NSWindowLevel);

    fn add_toolbar_shell(&self);
}

impl WebviewWindowExt for WebviewWindow {
    #[inline]
    fn objc2_nswindow(&self) -> &objc2_app_kit::NSWindow {
        // SAFETY: This cast is safe as the existence of the WebviewWindow means it's attached to an NSWindow
        unsafe { &*self.ns_window().expect("Failed to get NSWindow").cast() }
    }

    fn set_window_buttons_visible(&self, visible: bool) {
        let nswindow = self.objc2_nswindow();
        for btn in [
            NSWindowButton::CloseButton,
            NSWindowButton::MiniaturizeButton,
            NSWindowButton::ZoomButton,
        ] {
            if let Some(btn) = nswindow.standardWindowButton(btn) {
                btn.setHidden(!visible);
            }
        }
    }

    fn set_level(&self, level: NSWindowLevel) {
        run_on_main(move |_| self.objc2_nswindow().setLevel(level));
    }

    fn add_toolbar_shell(&self) {
        run_on_main(move |mtm| unsafe {
            let window = self.objc2_nswindow().retain();

            let toolbar = NSToolbar::new(mtm);
            toolbar.setAllowsUserCustomization(false);
            toolbar.setAutosavesConfiguration(false);
            toolbar.setDisplayMode(objc2_app_kit::NSToolbarDisplayMode::IconOnly);
            toolbar.setAllowsDisplayModeCustomization(false);

            window.setToolbar(Some(&toolbar));
            window.setToolbarStyle(NSWindowToolbarStyle::Unified);

            let nc = NSNotificationCenter::defaultCenter();

            let win = window.retain();
            let toggle = StackBlock::new(move |_| win.toggleToolbarShown(None));

            nc.addObserverForName_object_queue_usingBlock(
                Some(NSWindowWillEnterFullScreenNotification),
                Some(&*window),
                None,
                &toggle,
            );

            nc.addObserverForName_object_queue_usingBlock(
                Some(NSWindowDidExitFullScreenNotification),
                Some(&*window),
                None,
                &toggle,
            );
        });
    }
}
