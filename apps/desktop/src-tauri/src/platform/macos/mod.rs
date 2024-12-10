use cocoa::{
    base::{id, nil},
    foundation::NSString,
};
use objc::{class, msg_send, sel, sel_impl};

pub mod delegates;

pub fn set_window_level(window: tauri::Window, level: objc2_app_kit::NSWindowLevel) {
    let c_window = window.clone();
    let _ = window.run_on_main_thread(move || unsafe {
        let ns_win = c_window
            .ns_window()
            .expect("Failed to get native window handle")
            as *const objc2_app_kit::NSWindow;
        (*ns_win).setLevel(level);
    });
}

/// Makes the background of the WKWebView layer transparent.
/// This differs from Tauri's implementation as it does not change the window background which causes performance performance issues and artifacts when shadows are enabled on the window.
/// Use Tauri's implementation to make the window itself transparent.
pub fn _make_webview_transparent(target: &tauri::WebviewWindow) -> tauri::Result<()> {
    target.with_webview(|webview| unsafe {
        let wkwebview = webview.inner() as id;
        let no: id = msg_send![class!(NSNumber), numberWithBool:0];
        // [https://developer.apple.com/documentation/webkit/webview/1408486-drawsbackground]
        let _: id = msg_send![wkwebview, setValue:no forKey: NSString::alloc(nil).init_str("drawsBackground")];
    })
}
