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
