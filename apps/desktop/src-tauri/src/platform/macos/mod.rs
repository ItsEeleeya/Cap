pub mod menu;
mod sc_shareable_content;

use std::sync::OnceLock;

use block2::RcBlock;
use objc2::Message;
use objc2::runtime::AnyObject;
use objc2::{
    ClassType, MainThreadMarker, MainThreadOnly, msg_send,
    rc::{Allocated, Retained},
    runtime::AnyClass,
    sel,
};
use objc2_app_kit::{
    NSToolbar, NSWindow, NSWindowDidExitFullScreenNotification,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{
    NSNotificationCenter, NSNumber, NSObjectProtocol, NSOperationQueue, ns_string,
};
use objc2_web_kit::{WKProcessPool, WKWebViewConfiguration};
pub use sc_shareable_content::*;
use tauri::{WebviewWindow, WindowEvent};

use crate::now_millis;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewProcessPoolPolicy {
    Shared,
    Own,
}

#[derive(Clone, Copy)]
struct MainThreadBound<T>(T);

// SAFETY: access is gated behind MainThreadMarker
unsafe impl<T> Sync for MainThreadBound<T> {}
unsafe impl<T> Send for MainThreadBound<T> {}

pub fn create_wk_configuration(
    mtm: MainThreadMarker,
    policy: WebviewProcessPoolPolicy,
    disable_throttling: bool,
) -> Retained<WKWebViewConfiguration> {
    use objc2_foundation::{NSObjectNSKeyValueCoding, ns_string};
    use objc2_web_kit::{WKPreferences, WKWebViewConfiguration};

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    if policy == WebviewProcessPoolPolicy::Shared {
        static SHARED_WKPROCESS_POOL: OnceLock<MainThreadBound<Retained<WKProcessPool>>> =
            OnceLock::new();

        let pool = SHARED_WKPROCESS_POOL
            .get_or_init(|| MainThreadBound(create_shared_wk_pool(mtm)))
            .0
            .retain();

        unsafe { config.setProcessPool(&pool) };
    }

    let preferences = unsafe { WKPreferences::new(mtm) };
    let yes = NSNumber::numberWithBool(true);
    let no = NSNumber::numberWithBool(false);

    unsafe {
        // Enable Material Hosting on macOS 26+
        if objc2::available!(macos = 26.0) {
            if preferences.respondsToSelector(sel!(_useSystemAppearance)) {
                preferences.setValue_forKey(Some(&yes), ns_string!("useSystemAppearance"));
            } else {
                tracing::error!("useSystemAppearance not available on WKWebviewConfiguration");
            }
        }

        if disable_throttling {
            if preferences.respondsToSelector(sel!(pageVisibilityBasedProcessSuppressionEnabled)) {
                preferences.setValue_forKey(
                    Some(&no),
                    ns_string!("pageVisibilityBasedProcessSuppressionEnabled"),
                );
            } else {
                tracing::error!(
                    "pageVisibilityBasedProcessSuppressionEnabled not available on WKPreferences"
                );
            }
        }

        config.setPreferences(&preferences);
        tracing::debug!("Preferences configured on WKWebViewConfiguration");
    }

    // Disable delayed web process launch
    if config.respondsToSelector(sel!(setDelaysWebProcessLaunchUntilFirstLoad:)) {
        unsafe {
            let _: () = msg_send![&*config, setDelaysWebProcessLaunchUntilFirstLoad: false];
        }
    } else {
        tracing::error!(
            "setDelaysWebProcessLaunchUntilFirstLoad not available on WKWebViewConfiguration"
        );
    }

    config
}

fn create_shared_wk_pool(mtm: MainThreadMarker) -> Retained<WKProcessPool> {
    let pool_class = WKProcessPool::class();

    let Some(config_class) = AnyClass::get(c"_WKProcessPoolConfiguration") else {
        tracing::error!("_WKProcessPoolConfiguration unavailable; Using default");
        let default_pool = unsafe { WKProcessPool::new(mtm) };
        tracing::error!(
            "Created default WKProcessPool (not single-process): {:p}",
            &*default_pool as *const _
        );
        return default_pool;
    };

    if !pool_class.responds_to(sel!(_initWithConfiguration:)) {
        tracing::error!("WKProcessPool does NOT respond to _initWithConfiguration:; Using default");
        let default_pool = unsafe { WKProcessPool::new(mtm) };
        tracing::error!(
            "Created default WKProcessPool (not single-process): {:p}",
            &*default_pool as *const _
        );
        return default_pool;
    }

    let pool_config: Retained<AnyObject> = unsafe {
        let allocated: Allocated<AnyObject> = msg_send![config_class, alloc];
        let config: Retained<AnyObject> = msg_send![allocated, init];

        let uses_single_responds = config.class().responds_to(sel!(setUsesSingleWebProcess:));
        if uses_single_responds {
            let _: () = msg_send![&*config, setUsesSingleWebProcess: true];
            let uses_single_value: bool = msg_send![&*config, usesSingleWebProcess];
            tracing::debug!(
                "_WKProcessPoolConfiguration usesSingleWebProcess after set: {}",
                uses_single_value
            );
        } else {
            tracing::error!(
                "setUsesSingleWebProcess: NOT available on _WKProcessPoolConfiguration"
            );
        }

        config
    };

    unsafe {
        let allocated = WKProcessPool::alloc(mtm);
        let pool: Retained<WKProcessPool> =
            msg_send![allocated, _initWithConfiguration: &*pool_config];

        tracing::debug!(
            "WKProcessPool initialized via _initWithConfiguration: {:p}",
            &*pool as *const _
        );

        if pool.respondsToSelector(sel!(_configuration)) {
            let cfg: *const AnyObject = msg_send![&*pool, _configuration];
            tracing::debug!("Pool has _configuration getter, returns: {:p}", cfg);
            if !cfg.is_null() {
                let cfg_obj: &AnyObject = &*cfg;
                let cfg_class = cfg_obj.class();
                tracing::debug!(
                    "_configuration class: {}",
                    cfg_class.name().to_string_lossy()
                );
                if cfg_obj.class().responds_to(sel!(usesSingleWebProcess)) {
                    let uses_single: bool = msg_send![cfg_obj, usesSingleWebProcess];
                    tracing::debug!("_configuration.usesSingleWebProcess = {}", uses_single);
                    if !uses_single {
                        tracing::error!(
                            "_WKProcessPoolConfiguration usesSingleWebProces was NOT enabled"
                        );
                    }
                } else {
                    tracing::error!("_configuration does not respond to usesSingleWebProcess");
                }
            }
        } else {
            tracing::error!("Pool does NOT have _configuration getter");
        }

        pool
    }
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

            let observers = MainThreadBound((enter, exit));

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
                let nswindow = unsafe { &*webview.ns_window().expect("NSWindow not ready").cast() };
                let mtm = MainThreadMarker::new().expect("Running on main");
                f(mtm, nswindow);
            }
        })
    }
}
