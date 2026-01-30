use objc2::{MainThreadMarker, Message, available, rc::Retained};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSColor, NSGlassEffectView, NSGlassEffectViewStyle, NSWindow,
    NSWindowButton, NSWindowOrderingMode,
};
use objc2_core_foundation::CGFloat;
use objc2_foundation::ns_string;
use tauri::WebviewWindow;

mod sc_shareable_content;

pub use sc_shareable_content::*;

pub trait WebviewWindowExt {
    fn objc2_nswindow(&self) -> Retained<NSWindow>;

    fn set_traffic_lights_visible(&self, visible: bool);
}

impl WebviewWindowExt for WebviewWindow {
    #[inline]
    fn objc2_nswindow(&self) -> Retained<NSWindow> {
        // SAFETY: This cast is safe as the existence of the WebviewWindow means it's attached to an NSWindow
        unsafe {
            (&*self
                .ns_window()
                .expect("WebviewWindow is always backed by NSWindow")
                .cast::<NSWindow>())
                .retain()
        }
    }

    fn set_traffic_lights_visible(&self, visible: bool) {
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
}

// TODO(Ilya) This needs to be implemented in SwiftUI
// create a NSViewRepresentable that hosts the GlassEffectView
// then attach it behind the window's content view using NSHostingView
// Currently, the glass effect stops rendering when the window is not in focus
// the other alternative is to render glass effects from WebKit using hosted materials.
pub fn add_glass_effect_backdrop_to_nswindow(
    mtm: MainThreadMarker,
    window: &NSWindow,
    style: NSGlassEffectViewStyle,
    tint: Option<&NSColor>,
    radius: Option<CGFloat>,
) {
    if !available!(macos = 26.0) {
        return;
    }

    let Some(content_view) = window.contentView() else {
        return;
    };
    let Some(window_view) = (unsafe { content_view.superview() }) else {
        return;
    };

    window.setBackingType(objc2_app_kit::NSBackingStoreType::Buffered);

    let glass_effect = NSGlassEffectView::new(mtm);
    glass_effect.setFrame(window_view.bounds());
    glass_effect.setStyle(style);
    glass_effect.setTintColor(tint);
    glass_effect.setWantsLayer(true);

    if let Some(radius) = radius {
        glass_effect.setCornerRadius(radius);
    }

    glass_effect.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    window_view.addSubview_positioned_relativeTo(
        &glass_effect,
        NSWindowOrderingMode::Below,
        Some(&content_view),
    );
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

pub fn apply_squircle_corners(window: &tauri::WebviewWindow, radius: f64) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{msg_send, sel, sel_impl};

    let Ok(ns_win) = window.ns_window() else {
        return;
    };

    unsafe {
        let ns_win = ns_win as id;
        let content_view: id = msg_send![ns_win, contentView];

        if content_view != nil {
            let _: () = msg_send![content_view, setWantsLayer: true];

            let layer: id = msg_send![content_view, layer];
            if layer != nil {
                let _: () = msg_send![layer, setCornerRadius: radius];
                let _: () = msg_send![layer, setMasksToBounds: true];

                let continuous = NSString::alloc(nil).init_str("continuous");
                let _: () = msg_send![layer, setCornerCurve: continuous];
            }
        }
    }
}

// pub fn get_ns_window_number(ns_window: *mut c_void) -> isize {
//     let ns_window = ns_window as *const objc2_app_kit::NSWindow;

//     unsafe { (*ns_window).windowNumber() }
// }

// #[link(name = "CoreGraphics", kind = "framework")]
// unsafe extern "C" {
//     pub fn CGRectMakeWithDictionaryRepresentation(
//         dict: CFDictionaryRef,
//         rect: *mut CGRect,
//     ) -> boolean_t;
// }

// /// Makes the background of the WKWebView layer transparent.
// /// This differs from Tauri's implementation as it does not change the window background which causes performance performance issues and artifacts when shadows are enabled on the window.
// /// Use Tauri's implementation to make the window itself transparent.
// pub fn make_webview_transparent(target: &tauri::WebviewWindow) -> tauri::Result<()> {
//     target.with_webview(|webview| unsafe {
//         let wkwebview = webview.inner() as id;
//         let no: id = msg_send![class!(NSNumber), numberWithBool:0];
//         // [https://developer.apple.com/documentation/webkit/webview/1408486-drawsbackground]
//         let _: id = msg_send![wkwebview, setValue:no forKey: NSString::alloc(nil).init_str("drawsBackground")];
//     })
// }
