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
    NSToolbar, NSUserInterfaceLayoutDirection, NSWindow, NSWindowDidExitFullScreenNotification,
    NSWindowWillEnterFullScreenNotification,
};
use objc2_foundation::{
    NSNotificationCenter, NSNumber, NSObjectProtocol, NSOperationQueue, ns_string,
};
use objc2_web_kit::{WKProcessPool, WKWebViewConfiguration};
use tauri::{WebviewWindow, WindowEvent};

use crate::platform::macos::UnsafeMainThreadBound;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebviewProcessPoolPolicy {
    Shared,
    Own,
}

pub fn create_wk_configuration(
    mtm: MainThreadMarker,
    policy: WebviewProcessPoolPolicy,
) -> Retained<WKWebViewConfiguration> {
    use objc2_foundation::{NSObjectNSKeyValueCoding, ns_string};
    use objc2_web_kit::{WKPreferences, WKWebViewConfiguration};

    let config = unsafe { WKWebViewConfiguration::new(mtm) };
    if policy == WebviewProcessPoolPolicy::Shared {
        static SHARED_WKPROCESS_POOL: OnceLock<UnsafeMainThreadBound<Retained<WKProcessPool>>> =
            OnceLock::new();

        let pool = SHARED_WKPROCESS_POOL
            .get_or_init(|| UnsafeMainThreadBound(create_shared_wk_pool(mtm)))
            .0
            .retain();

        unsafe { config.setProcessPool(&pool) };
    }

    let preferences = unsafe { WKPreferences::new(mtm) };
    let yes = NSNumber::numberWithBool(true);

    unsafe {
        // Enable Material Hosting on macOS 26+
        if objc2::available!(macos = 26.0) {
            if preferences.respondsToSelector(sel!(_useSystemAppearance)) {
                preferences.setValue_forKey(Some(&yes), ns_string!("useSystemAppearance"));
            } else {
                tracing::error!("[WKWebviewConfiguration _useSystemAppearance] not available");
            }
        }

        config.setPreferences(&preferences);
        tracing::debug!("Preferences configured on WKWebViewConfiguration");
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
                    "[[WKProcessPool _configuration] class] -> {}",
                    cfg_class.name().to_string_lossy()
                );

                if cfg_obj.class().responds_to(sel!(usesSingleWebProcess)) {
                    let uses_single: bool = msg_send![cfg_obj, usesSingleWebProcess];
                    tracing::debug!(
                        "[_WKProcessPoolConfiguration usesSingleWebProcess] = {}",
                        uses_single
                    );
                    if !uses_single {
                        tracing::error!(
                            "_WKProcessPoolConfiguration usesSingleWebProces was NOT enabled"
                        );
                    }
                } else {
                    tracing::error!(
                        "[WKProcessPool _configuration] does not respond to usesSingleWebProcess"
                    );
                }
            }
        } else {
            tracing::error!("WKProcessPool does NOT have _configuration getter");
        }

        pool
    }
}
