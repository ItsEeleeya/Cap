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

fn constrain_frame_to_visible_area(
    frame: objc2_foundation::NSRect,
    screen_frame: objc2_foundation::NSRect,
    visible_frame: objc2_foundation::NSRect,
    safe_area_top_inset: f64,
) -> Option<objc2_foundation::NSRect> {
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    let minimum_x = visible_frame.origin.x;
    let minimum_y = visible_frame.origin.y;
    let maximum_x = minimum_x + visible_frame.size.width;
    let maximum_y = (minimum_y + visible_frame.size.height)
        .min(screen_frame.origin.y + screen_frame.size.height - safe_area_top_inset.max(0.0));
    if ![
        frame.origin.x,
        frame.origin.y,
        frame.size.width,
        frame.size.height,
        minimum_x,
        minimum_y,
        maximum_x,
        maximum_y,
    ]
    .into_iter()
    .all(f64::is_finite)
        || frame.size.width <= 0.0
        || frame.size.height <= 0.0
        || maximum_x <= minimum_x
        || maximum_y <= minimum_y
    {
        return None;
    }

    let width = frame.size.width.min(maximum_x - minimum_x);
    let height = frame.size.height.min(maximum_y - minimum_y);
    let constrained = NSRect::new(
        NSPoint::new(
            frame.origin.x.clamp(minimum_x, maximum_x - width),
            frame.origin.y.clamp(minimum_y, maximum_y - height),
        ),
        NSSize::new(width, height),
    );
    (constrained != frame).then_some(constrained)
}

pub fn constrain_main_window_to_visible_frame(window: &tauri::Window) -> Result<(), String> {
    use objc2::{MainThreadMarker, runtime::NSObjectProtocol, sel};
    use objc2_app_kit::{NSScreen, NSWindow};

    let main_thread =
        MainThreadMarker::new().ok_or("Main window bounds must be checked on the main thread")?;
    let ns_window = window.ns_window().map_err(|error| error.to_string())? as *const NSWindow;
    let ns_window = unsafe { ns_window.as_ref() }.ok_or("Main window is unavailable")?;
    let screen = ns_window
        .screen()
        .or_else(|| NSScreen::mainScreen(main_thread))
        .ok_or("Main window screen is unavailable")?;
    let safe_area_top_inset = if screen.respondsToSelector(sel!(safeAreaInsets)) {
        unsafe { screen.safeAreaInsets().top }
    } else {
        0.0
    };
    if let Some(frame) = constrain_frame_to_visible_area(
        ns_window.frame(),
        screen.frame(),
        screen.visibleFrame(),
        safe_area_top_inset,
    ) {
        ns_window.setFrame_display(frame, true);
    }
    Ok(())
}

pub fn set_window_level(window: tauri::Window, level: objc2_app_kit::NSWindowLevel) {
    let c_window = window.clone();
    _ = window.run_on_main_thread(move || unsafe {
        let Ok(ns_win) = c_window.ns_window() else {
            return;
        };
        let ns_win = ns_win as *const objc2_app_kit::NSWindow;
        (*ns_win).setLevel(level);
    });
}

pub fn set_window_opacity(window: tauri::Window, opacity: f64) {
    let opacity = opacity.clamp(0.45, 1.0);
    let c_window = window.clone();
    _ = window.run_on_main_thread(move || unsafe {
        use cocoa::base::id;
        use objc::{msg_send, sel, sel_impl};

        let Ok(ns_win) = c_window.ns_window() else {
            return;
        };
        let ns_win = ns_win as id;
        let _: () = msg_send![ns_win, setAlphaValue: opacity];
    });
}

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
                    return tracing::warn!(label = %webview.label(), "NSWindow not ready");
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
    use super::{constrain_frame_to_visible_area, constrain_position_to_visible_top};
    use objc2_foundation::{NSPoint, NSRect, NSSize};
    use tauri::PhysicalPosition;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
    }

    #[test]
    fn fits_the_actual_resized_frame_inside_the_work_area() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        let visible = rect(0.0, 24.0, 1440.0, 851.0);
        let constrained = constrain_frame_to_visible_area(
            rect(1300.0, 800.0, 330.0, 395.0),
            screen,
            visible,
            0.0,
        )
        .unwrap();

        assert_eq!(constrained, rect(1110.0, 480.0, 330.0, 395.0));
        assert_eq!(
            constrain_frame_to_visible_area(constrained, screen, visible, 0.0),
            None
        );
    }

    #[test]
    fn fits_expanded_frames_below_a_notch_with_a_hidden_menu_bar() {
        let screen = rect(0.0, 0.0, 1440.0, 900.0);
        assert_eq!(
            constrain_frame_to_visible_area(rect(100.0, 650.0, 480.0, 700.0), screen, screen, 37.0,),
            Some(rect(100.0, 163.0, 480.0, 700.0))
        );
    }

    #[test]
    fn keeps_native_coordinates_on_a_display_above_and_left_of_primary() {
        assert_eq!(
            constrain_frame_to_visible_area(
                rect(-2000.0, 1800.0, 480.0, 700.0),
                rect(-1920.0, 900.0, 1920.0, 1080.0),
                rect(-1880.0, 900.0, 1880.0, 1050.0),
                37.0,
            ),
            Some(rect(-1880.0, 1243.0, 480.0, 700.0))
        );
    }

    #[test]
    fn fits_an_oversized_restored_frame_without_negative_clamp_ranges() {
        let visible = rect(40.0, 24.0, 1400.0, 851.0);
        assert_eq!(
            constrain_frame_to_visible_area(
                rect(-100.0, -100.0, 2000.0, 1200.0),
                rect(0.0, 0.0, 1440.0, 900.0),
                visible,
                0.0,
            ),
            Some(visible)
        );
    }

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
