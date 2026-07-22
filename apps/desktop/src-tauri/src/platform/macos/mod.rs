pub mod menu;
mod sc_shareable_content;
mod wkwv_utils;

pub use wkwv_utils::{WebviewProcessPoolPolicy, create_wk_configuration};

use std::sync::OnceLock;

use block2::RcBlock;
use objc2::runtime::AnyObject;
use objc2::{
    ClassType, MainThreadMarker, MainThreadOnly, msg_send,
    rc::{Allocated, Retained},
    runtime::AnyClass,
    sel,
};
use objc2::{Message, available};
use objc2_app_kit::{
    NSToolbar, NSUserInterfaceLayoutDirection, NSWindow, NSWindowDidExitFullScreenNotification,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{
    NSNotificationCenter, NSNumber, NSObjectProtocol, NSOperationQueue, ns_string,
};
use objc2_web_kit::{WKProcessPool, WKWebViewConfiguration};
pub use sc_shareable_content::*;
use tauri::{WebviewWindow, WindowEvent};

#[derive(Clone, Copy)]
pub(in crate::platform::macos) struct UnsafeMainThreadBound<T>(T);

fn constrain_position_to_visible_top(
    position: tauri::PhysicalPosition<i32>,
    monitor_top: i32,
    scale_factor: f64,
    visible_frame_top_inset: f64,
    safe_area_top_inset: f64,
) -> Option<tauri::PhysicalPosition<i32>> {
    let top_inset = visible_frame_top_inset.max(safe_area_top_inset).max(0.0);
    let minimum_y = monitor_top.saturating_add((top_inset * scale_factor).round() as i32);

    (position.y < minimum_y).then(|| tauri::PhysicalPosition::new(position.x, minimum_y))
}

pub fn constrain_main_window_to_visible_top(
    window: &tauri::Window,
    position: tauri::PhysicalPosition<i32>,
) -> Option<tauri::PhysicalPosition<i32>> {
    use objc2::{runtime::NSObjectProtocol, sel};
    use objc2_app_kit::NSWindow;

    let monitor = window.current_monitor().ok().flatten()?;
    let ns_window = window.ns_window().ok()? as *const NSWindow;
    let screen = unsafe { (*ns_window).screen() }?;
    let frame = screen.frame();
    let visible_frame = screen.visibleFrame();
    let safe_area_top_inset = if screen.respondsToSelector(sel!(safeAreaInsets)) {
        unsafe { screen.safeAreaInsets().top }
    } else {
        0.0
    };
    // Tauri runtime 2.8 omits this macOS top offset from Monitor::work_area().position.
    let visible_frame_top_inset =
        frame.origin.y + frame.size.height - visible_frame.origin.y - visible_frame.size.height;

    constrain_position_to_visible_top(
        position,
        monitor.position().y,
        monitor.scale_factor(),
        visible_frame_top_inset,
        safe_area_top_inset,
    )
}

// SAFETY: access is gated behind MainThreadMarker
unsafe impl<T> Sync for UnsafeMainThreadBound<T> {}
unsafe impl<T> Send for UnsafeMainThreadBound<T> {}

pub fn add_toolbar_shell(webview: &WebviewWindow) -> tauri::Result<()> {
    webview.run_on_main_thread({
        let window = webview.as_ref().window();
        move || {
            let nswindow = unsafe { &*window.ns_window().unwrap().cast::<NSWindow>() };
            let mtm = MainThreadMarker::new().expect("Run on main");

            let toolbar = NSToolbar::initWithIdentifier(
                NSToolbar::alloc(mtm),
                ns_string!("cap-toolbar-shell"),
            );
            toolbar.setAutosavesConfiguration(false);
            toolbar.setAllowsUserCustomization(false);
            toolbar.setDisplayMode(objc2_app_kit::NSToolbarDisplayMode::IconOnly);
            nswindow.setToolbar(Some(&toolbar));

            let nc = NSNotificationCenter::defaultCenter();

            let enter_block = RcBlock::new({
                let window = window.clone();
                move |_| {
                    if let Ok(win) = window.ns_window() {
                        let nswindow = unsafe { &*win.cast::<NSWindow>() };
                        if let Some(tb) = nswindow.toolbar() {
                            tb.setVisible(false);
                        }
                    }
                }
            });

            let exit_block = RcBlock::new({
                let window = window.clone();
                move |_| {
                    if let Ok(win) = window.ns_window() {
                        let nswindow = unsafe { &*win.cast::<NSWindow>() };
                        if let Some(tb) = nswindow.toolbar() {
                            tb.setVisible(true);
                        }
                    }
                }
            });

            let enter = unsafe {
                nc.addObserverForName_object_queue_usingBlock(
                    Some(NSWindowWillEnterFullScreenNotification),
                    Some(nswindow),
                    Some(&*NSOperationQueue::mainQueue()),
                    &enter_block,
                )
            };

            let exit = unsafe {
                nc.addObserverForName_object_queue_usingBlock(
                    Some(NSWindowDidExitFullScreenNotification),
                    Some(nswindow),
                    Some(&*NSOperationQueue::mainQueue()),
                    &exit_block,
                )
            };

            let observers = UnsafeMainThreadBound((enter, exit));

            window.on_window_event(move |event| match event {
                WindowEvent::Destroyed => {
                    let observers = observers.clone();
                    dispatch2::run_on_main(move |_| unsafe {
                        let observers = observers;
                        let nc = NSNotificationCenter::defaultCenter();
                        nc.removeObserver(observers.0.0.as_ref());
                        nc.removeObserver(observers.0.1.as_ref());
                    });
                }
                _ => {}
            });
        }
    })
}

pub fn remove_toolbar_shell(webview: &WebviewWindow) -> tauri::Result<()> {
    webview.run_on_main_thread({
        let window = webview.as_ref().window();
        move || {
            let nswindow = unsafe { &*window.ns_window().unwrap().cast::<NSWindow>() };
            // Only remove ours
            if let Some(toolbar) = nswindow.toolbar() {
                if toolbar
                    .identifier()
                    .isEqualToString(ns_string!("cap-toolbar-shell"))
                {
                    nswindow.setToolbar(None);
                }
            }
        }
    })
}

// This properly sets the corner radius on the window,
// AppKit communicates with SkyLight to set it on the server side
// which results in having the correct overlay in mission control etc.
pub fn set_nswindow_radius(_mtm: MainThreadMarker, nswindow: &NSWindow, radius: f64) {
    if nswindow.respondsToSelector(sel!(_setCornerRadius:)) {
        // NSWindow - (void)_setCornerRadius:(double)radius;
        // SAFETY: We ensure the selector exists.
        let _: () = unsafe { msg_send![&*nswindow, _setCornerRadius: radius] };
    }
}

pub fn setup_frame_autosave(_mtm: MainThreadMarker, nswindow: &NSWindow, autosave_name: &str) {
    let autosave_name = objc2_foundation::NSString::from_str(&autosave_name);
    nswindow.setFrameAutosaveName(&autosave_name);
    nswindow.setFrameUsingName_force(&autosave_name, true);
}

pub fn set_traffic_lights_hidden(_mtm: MainThreadMarker, nswindow: &NSWindow, hidden: bool) {
    use objc2_app_kit::NSWindowButton;
    for btn in [
        NSWindowButton::CloseButton,
        NSWindowButton::ZoomButton,
        NSWindowButton::MiniaturizeButton,
    ] {
        if let Some(nsbtn) = nswindow.standardWindowButton(btn) {
            nsbtn.setHidden(hidden);
        }
    }
}

pub trait WebviewWindowExt {
    fn with_nswindow_on_main<F: FnOnce(MainThreadMarker, &NSWindow) + Send + 'static>(
        &self,
        f: F,
    ) -> tauri::Result<()>;
}

impl WebviewWindowExt for WebviewWindow {
    fn with_nswindow_on_main<F: FnOnce(MainThreadMarker, &NSWindow) + Send + 'static>(
        &self,
        f: F,
    ) -> tauri::Result<()> {
        self.run_on_main_thread({
            let webview = self.clone();
            move || {
                let Ok(ns_window) = webview.ns_window() else {
                    tracing::error!("NSWindow not ready");
                    return;
                };
                // SAFETY: Tauri runs this on the main thread
                let mtm = unsafe { MainThreadMarker::new_unchecked() };
                let nswindow = unsafe { &*ns_window.cast::<NSWindow>() };
                f(mtm, nswindow);
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::constrain_position_to_visible_top;
    use tauri::PhysicalPosition;

    #[test]
    fn moves_a_window_below_a_notched_visible_frame() {
        let position = PhysicalPosition::new(640, 0);

        assert_eq!(
            constrain_position_to_visible_top(position, 0, 2.0, 19.0, 18.0),
            Some(PhysicalPosition::new(640, 38))
        );
    }

    #[test]
    fn uses_the_safe_area_when_the_menu_bar_is_hidden() {
        let position = PhysicalPosition::new(200, 0);

        assert_eq!(
            constrain_position_to_visible_top(position, 0, 2.0, 0.0, 37.0),
            Some(PhysicalPosition::new(200, 74))
        );
    }

    #[test]
    fn preserves_negative_coordinates_on_a_monitor_above_the_primary() {
        let position = PhysicalPosition::new(-600, -1800);

        assert_eq!(
            constrain_position_to_visible_top(position, -1800, 1.5, 25.0, 0.0),
            Some(PhysicalPosition::new(-600, -1762))
        );
    }

    #[test]
    fn leaves_an_accessible_position_unchanged() {
        let position = PhysicalPosition::new(300, 100);

        assert_eq!(
            constrain_position_to_visible_top(position, 0, 2.0, 19.0, 18.0),
            None
        );
    }
}
