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
use objc2_foundation::{NSNumber, NSObjectProtocol};
use objc2_web_kit::{WKProcessPool, WKWebView, WKWebViewConfiguration};
pub use sc_shareable_content::*;
use tauri::WebviewWindow;

struct MainThreadBound<T>(T);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewProcessPoolPolicy {
    Shared,
    Own,
}

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
        if objc2::available!(macos = 26.0)
            && preferences.respondsToSelector(objc2::sel!(_useSystemAppearance))
        {
            preferences.setValue_forKey(Some(&yes), ns_string!("useSystemAppearance"));
        } else {
            tracing::error!("useSystemAppearance not available on WKWebviewConfiguration");
        }

        if disable_throttling {
            if preferences
                .respondsToSelector(objc2::sel!(pageVisibilityBasedProcessSuppressionEnabled))
            {
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
        tracing::trace!("Preferences configured on WKWebViewConfiguration");
    }

    // Disable delayed web process launch
    if config.respondsToSelector(objc2::sel!(setDelaysWebProcessLaunchUntilFirstLoad:)) {
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
    use objc2_web_kit::WKProcessPool;

    let init_with_config = sel!(_initWithConfiguration:);
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

    if !pool_class.responds_to(init_with_config) {
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
            tracing::info!(
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
                    tracing::info!("_configuration.usesSingleWebProcess = {}", uses_single);
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

// pub trait WebviewWindowExt {
//     fn objc2_nswindow(&self) -> &NSWindow;
// }

// impl WebviewWindowExt for WebviewWindow {
//     #[inline]
//     fn objc2_nswindow(&self) -> &NSWindow {
//         // SAFETY: This cast is safe as long as we get a NSWindow from Tauri.
//         unsafe { &*self.ns_window().expect("NSWindow not ready").cast() }
//     }
// }

// Using `with_webview`` seems to cause Tauri to not be able to close the webview process when the window is closed.
// pub fn show_after_next_presentation_update(webview: &WebviewWindow) -> Result<(), tauri::Error> {
//     webview.with_webview({
//         let webview = webview.clone();
//         move |wrywv| {
//             let wv: &WKWebView = unsafe { &*wrywv.inner().cast() };
//             let sel = sel!(_doAfterNextPresentationUpdate:);
//             if wv.respondsToSelector(sel) {
//                 let block = RcBlock::new({
//                     let webview = webview.clone();
//                     move || {
//                         _ = webview.show();
//                     }
//                 });
//                 unsafe { msg_send![wv, _doAfterNextPresentationUpdate: &*block] }
//             } else {
//                 _ = webview.show();
//             }
//         }
//     })
// }
