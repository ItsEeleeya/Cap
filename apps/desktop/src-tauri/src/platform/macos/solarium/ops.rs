use std::fs::OpenOptions;
use std::io::Write;
use std::ptr::NonNull;

use objc2::{
    ClassType, MainThreadOnly, define_class, msg_send, rc::Retained, runtime::AnyClass,
    runtime::AnyObject, runtime::Sel, sel,
};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSColor, NSGlassEffectView, NSGlassEffectViewStyle, NSView,
    NSViewLayerContentsRedrawPolicy, NSWindow,
};
use objc2_foundation::{
    MainThreadMarker, NSInteger, NSObjectNSScriptClassDescription, NSObjectProtocol, NSPoint,
    NSRect, NSSelectorFromString, NSSize, NSString,
};
#[cfg(debug_assertions)]
use objc2_quartz_core::CALayer;
use objc2_quartz_core::CATransaction;
use tauri::{AppHandle, Runtime};

use crate::platform::solarium::types::GlassEffectOptions;

use super::{
    registry::MainThreadPtr,
    types::{GlassEffectVariant, JsRect},
};

use std::ffi::CStr;

// ── Passthrough view ──────────────────────────────────────────────────────────

define_class!(
    #[unsafe(super(NSView))]
    pub struct SolariumPassthroughView;

    impl SolariumPassthroughView {
        #[unsafe(method(hitTest:))]
        fn hit_test(&self, _point: NSPoint) -> Option<&NSView> {
            None
        }
    }
);

// ── Coordinate helpers ────────────────────────────────────────────────────────

pub fn logical_content_height(ns_window: &NSWindow) -> Result<f64, String> {
    ns_window
        .contentView()
        .map(|cv| cv.frame().size.height)
        .ok_or_else(|| "NSWindow has no content view".into())
}

pub fn css_rect_to_ns(css: JsRect, window_content_height: f64) -> NSRect {
    NSRect {
        origin: NSPoint {
            x: css.x,
            y: window_content_height - css.y - css.height,
        },
        size: NSSize {
            width: css.width,
            height: css.height,
        },
    }
}

// ── Glass view factory ───────────────────────────────────────────────────────

fn build_glass_view(
    mtm: MainThreadMarker,
    frame: NSRect,
    opts: &GlassEffectOptions,
) -> Retained<NSView> {
    let view = NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), frame);

    view.setCornerRadius(opts.corner_radius);
    if let Some(c) = &opts.tint_color {
        view.setTintColor(Some(&NSColor::colorWithRed_green_blue_alpha(
            c.r, c.g, c.b, c.a,
        )));
    }

    macro_rules! set_i64_checked {
        ($sel:ident: $val:expr) => {
            if let Some(v) = $val {
                if view.respondsToSelector(sel!($sel:)) {
                    // println!("responded to sel!");
                    unsafe { let _: () = msg_send![&view, $sel: v as i64]; }
                }
            }
        };
    }

    if view.respondsToSelector(sel!(set_variant:)) {
        unsafe {
            let _: () = msg_send![&view, set_variant: opts.variant as NSInteger];
        }
    }

    set_i64_checked!(set_interactionState: opts.interaction_state);
    set_i64_checked!(set_subduedState: opts.subdued_state);
    set_i64_checked!(set_scrimState: opts.scrim_state);
    set_i64_checked!(set_adaptiveAppearanceopts: opts.adaptive_appearance);
    // set_i64_checked!(set_contentLensing:,     opts.content_lensing);

    if let Some(v) = opts.use_reduced_shadow_radius {
        if view.respondsToSelector(sel!(set_useReducedShadowRadius:)) {
            // println!("Responsed to set_useReducedShadowRadius:");
            unsafe {
                let _: () = msg_send![&view, set_useReducedShadowRadius: v];
            }
        }
    }

    if let Some(v) = opts.vibrant_blending_style {
        if view.respondsToSelector(sel!(_setVibrantBlendingStyleForSubtree:)) {
            // println!("Responsed to _setVibrantBlendingStyleForSubtree:");
            unsafe {
                let _: () = msg_send![&view, _setVibrantBlendingStyleForSubtree: v];
            }
        }
    }

    if let Some(ref s) = opts.group_identifier {
        if view.respondsToSelector(sel!(set_groupIdentifier:)) {
            // println!("Responsed to set_groupIdentifier:");
            let ns = NSString::from_str(s);
            unsafe {
                let _: () = msg_send![&view, set_groupIdentifier: &*ns];
            }
        }
    }

    if let Some(ref s) = opts.content_lensing {
        if view.respondsToSelector(sel!(set_contentLensing:)) {
            // println!("Responsed to set_contentLensing:");
            let ns = NSString::from_str(s.as_str());
            unsafe {
                let _: () = msg_send![&view, set_contentLensing: &*ns];
            }
        }
    }

    // _subvariant last — its didSet rebuilds the material context and reads
    // _variant, so variant must already be set at this point.
    if let Some(sv) = opts.subvariant {
        if view.respondsToSelector(sel!(set_subvariant:)) {
            // println!("Responsed to set_subvariant:");
            let ns = NSString::from_str(sv.as_str());
            unsafe {
                let _: () = msg_send![&view, set_subvariant: &*ns];
            }
        }
    }

    if let Err(err) = unsafe { add_backdrop_layer(&view) } {
        println!("Error adding backdrop layer: {err}");
    }

    unsafe { dump_glass_layer_tree(&view) };

    unsafe {
        // let _ = configure_cabackdrop_layer(&view);
        Retained::cast_unchecked(view)
    }
}

pub unsafe fn configure_cabackdrop_layer(view: &NSGlassEffectView) -> Result<(), String> {
    macro_rules! set_bool_if_responds {
        ($obj:expr, $sel:ident, $value:expr) => {{
            let responds: bool = msg_send![$obj, respondsToSelector: sel!($sel:)];
            if responds {
                println!("found selector: {}", stringify!($sel));
                let _: () = msg_send![$obj, $sel: $value];
            }
        }};
    }

    macro_rules! set_f64_if_responds {
        ($obj:expr, $sel:ident, $value:expr) => {{
            let responds: bool = msg_send![$obj, respondsToSelector: sel!($sel:)];
            if responds {
                println!("found selector: {}", stringify!($sel));
                let _: () = msg_send![$obj, $sel: $value];
            }
        }};
    }

    macro_rules! set_rect_if_responds {
        ($obj:expr, $sel:ident, $value:expr) => {{
            let responds: bool = msg_send![$obj, respondsToSelector: sel!($sel:)];
            if responds {
                println!("found selector: {}", stringify!($sel));
                let _: () = msg_send![$obj, $sel: $value];
            }
        }};
    }

    if let Some(first_subview) = view.subviews().firstObject() {
        println!(
            "First subview name: {}",
            first_subview.className().to_string()
        );
    }

    let root: *mut AnyObject = msg_send![view, layer];
    if root.is_null() {
        return Err("NSGlassEffectView has no backing layer".into());
    }

    let mut stack = vec![root];

    while let Some(layer) = stack.pop() {
        let cls: *const AnyClass = msg_send![layer, class];
        if cls.is_null() {
            continue;
        }

        let name = unsafe { CStr::from_ptr(objc2::ffi::class_getName(cls)) }.to_string_lossy();
        if name == "CABackdropLayer" {
            println!("found layer class: CABackdropLayer");

            let bounds: NSRect = msg_send![view, bounds];

            let window: *mut AnyObject = msg_send![view, window];
            let scale: f64 = if window.is_null() {
                2.0
            } else {
                let s: f64 = msg_send![window, backingScaleFactor];
                if s > 0.0 { s } else { 2.0 }
            };

            set_bool_if_responds!(layer, setEnabled, true);
            set_bool_if_responds!(layer, setAllowsInPlaceFiltering, true);
            set_bool_if_responds!(layer, setCaptureOnly, false);
            set_bool_if_responds!(layer, setIgnoresOffscreenGroups, true);
            set_bool_if_responds!(layer, setWindowServerAware, true);
            set_bool_if_responds!(layer, setDisablesOccludedBackdropBlurs, false);
            set_bool_if_responds!(layer, setPreallocatesScreenArea, true);
            set_bool_if_responds!(layer, setIgnoresScreenClip, false);

            set_f64_if_responds!(layer, setScale, scale);
            set_f64_if_responds!(layer, setZoom, 0.5);
            set_f64_if_responds!(layer, setBleedAmount, 0.0);
            set_rect_if_responds!(layer, setBackdropRect, bounds);

            return Ok(());
        }

        let sublayers: *mut AnyObject = msg_send![layer, sublayers];
        if !sublayers.is_null() {
            let count: usize = msg_send![sublayers, count];
            for i in 0..count {
                let sub: *mut AnyObject = msg_send![sublayers, objectAtIndex: i];
                if !sub.is_null() {
                    stack.push(sub);
                }
            }
        }
    }

    Err("CABackdropLayer not found in NSGlassEffectView layer tree".into())
}

// ── Create ────────────────────────────────────────────────────────────────────

pub fn create_overlay_on_main(
    mtm: MainThreadMarker,
    ns_window: &NSWindow,
    css_rect: JsRect,
    options: GlassEffectOptions,
) -> Result<MainThreadPtr<NSView>, String> {
    let content_view = ns_window
        .contentView()
        .ok_or("NSWindow has no content view")?;

    let h = logical_content_height(ns_window)?;
    let ns_rect = css_rect_to_ns(css_rect, h);

    // Outer passthrough shell — owns the frame, intercepts nothing
    let outer = unsafe {
        // SAFETY: alloc + initWithFrame on our own defined class.
        let ptr: *mut SolariumPassthroughView = msg_send![SolariumPassthroughView::class(), alloc];
        let ptr: *mut SolariumPassthroughView = msg_send![ptr, initWithFrame: ns_rect];

        Retained::from_raw(ptr).ok_or("SolariumPassthroughView initWithFrame returned null")?
    };

    outer.setWantsLayer(true);
    outer.setAutoresizingMask(NSAutoresizingMaskOptions(0));
    outer.setLayerContentsRedrawPolicy(NSViewLayerContentsRedrawPolicy::Never);

    // Inner glass view — fills the outer shell, autoresizes with it
    let inner = build_glass_view(mtm, outer.bounds(), &options);
    inner.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );

    outer.addSubview(&inner);
    content_view.addSubview(&*outer);

    let ptr =
        NonNull::new(Retained::as_ptr(&outer) as *mut NSView).ok_or("null outer view pointer")?;

    // SAFETY: `outer` is retained by `content_view` (via addSubview) and will
    // only be dereferenced on the main thread through MainThreadPtr.
    Ok(unsafe { MainThreadPtr::from_nonnull(ptr) })
}

pub fn run_create_overlay<R: Runtime>(
    app: &AppHandle<R>,
    window: &tauri::Window<R>,
    rect: JsRect,
    glass_options: GlassEffectOptions,
) -> Result<MainThreadPtr<NSView>, String> {
    let raw_win = window
        .ns_window()
        .map_err(|_| "failed to resolve NSWindow".to_string())? as usize;

    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let app = app.clone();

    app.run_on_main_thread(move || {
        let mtm = match MainThreadMarker::new() {
            Some(m) => m,
            None => {
                let _ = tx.send(Err("run_on_main_thread callback not on main thread".into()));
                return;
            }
        };

        // SAFETY: `raw_win` came from `ns_window()` which returns a valid NSWindow
        // pointer. We only access it here, on the main thread.
        let ns_window = unsafe { &*(raw_win as *const NSWindow) };

        let _ = tx.send(create_overlay_on_main(mtm, ns_window, rect, glass_options));
    })
    .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "create overlay channel disconnected".to_string())?
}

// ── Destroy ───────────────────────────────────────────────────────────────────

pub fn run_destroy_overlay<R: Runtime>(
    app: &AppHandle<R>,
    outer: MainThreadPtr<NSView>,
) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);

    app.run_on_main_thread(move || {
        // SAFETY: Only dereferenced here, on the main thread.
        unsafe { outer.as_ref() }.removeFromSuperview();
        let _ = tx.send(());
    })
    .map_err(|e| e.to_string())?;

    rx.recv()
        .map_err(|_| "destroy overlay channel disconnected".to_string())
}

// ── Update ────────────────────────────────────────────────────────────────────

/// Called directly on the main thread from the event listener — no channel needed.
pub fn apply_overlay_frame(
    outer: MainThreadPtr<NSView>,
    ns_window: MainThreadPtr<NSWindow>,
    css_rect: JsRect,
) -> Result<(), String> {
    // SAFETY: Both pointers are only dereferenced here, on the main thread,
    // after being validated during create_overlay_on_main.
    let win = unsafe { ns_window.as_ref() };
    let view = unsafe { outer.as_ref() };

    let frame = css_rect_to_ns(css_rect, logical_content_height(win)?);

    CATransaction::begin();
    CATransaction::setDisableActions(true);
    view.setFrame(frame);
    CATransaction::commit();

    Ok(())
}

pub unsafe fn get_content_holder_view(view: &NSGlassEffectView) -> Option<*mut AnyObject> {
    let cls = AnyClass::get(c"NSGlassEffectView")?;
    let ivar_name = c"_contentHolderView";

    // Walk the ivar list to find the offset
    let mut count: u32 = 0;
    let ivars = objc2::ffi::class_copyIvarList(cls as *const AnyClass, &mut count);
    let mut offset: Option<isize> = None;

    for i in 0..count as usize {
        let ivar = *ivars.add(i);
        let name_ptr = objc2::ffi::ivar_getName(ivar);
        if name_ptr.is_null() {
            continue;
        }
        if CStr::from_ptr(name_ptr) == ivar_name {
            offset = Some(objc2::ffi::ivar_getOffset(ivar));
            break;
        }
    }
    objc2::ffi::free(ivars as *mut _);

    let offset = offset?;
    let self_ptr = view as *const NSGlassEffectView as *const u8;
    let holder_ptr = self_ptr.offset(offset) as *const *mut AnyObject;
    let holder = *holder_ptr;

    if holder.is_null() { None } else { Some(holder) }
}

#[cfg(debug_assertions)]
pub unsafe fn dump_material_context(view: &NSGlassEffectView) {
    let Some(holder) = get_content_holder_view(view) else {
        println!("DUMP CONTEXT -- no _contentHolderView");
        return;
    };

    let holder_cls: *const AnyClass = msg_send![holder, class];
    let holder_cls_name = CStr::from_ptr(objc2::ffi::class_getName(holder_cls));
    println!(
        "_contentHolderView class: {}",
        holder_cls_name.to_string_lossy()
    );

    // Now try glassMaterialContext on the holder
    for sel_name in [c"_glassMaterialContext", c"glassMaterialContext"] {
        let sel = Sel::register(sel_name);
        let responds: bool = msg_send![holder, respondsToSelector: sel];
        if !responds {
            continue;
        }

        let ctx: *mut AnyObject = msg_send![holder, performSelector: sel];
        if ctx.is_null() {
            println!("{}: returned nil", sel_name.to_string_lossy());
            continue;
        }

        let ctx_cls: *const AnyClass = msg_send![ctx, class];
        let ctx_cls_name = CStr::from_ptr(objc2::ffi::class_getName(ctx_cls));
        let desc: *const i8 = msg_send![ctx, description];
        let desc_str = CStr::from_ptr(desc);
        println!(
            "{}: class={} description={}",
            sel_name.to_string_lossy(),
            ctx_cls_name.to_string_lossy(),
            desc_str.to_string_lossy()
        );

        // Dump the context's own ivars
        let ctx_cls_real: *const AnyClass = msg_send![ctx, class];
        let mut ivar_count: u32 = 0;
        let ctx_ivars = objc2::ffi::class_copyIvarList(ctx_cls_real, &mut ivar_count);
        for j in 0..ivar_count as usize {
            let ivar = *ctx_ivars.add(j);
            let iname = objc2::ffi::ivar_getName(ivar);
            if iname.is_null() {
                continue;
            }
            let iname_str = CStr::from_ptr(iname).to_string_lossy();
            let ioffset = objc2::ffi::ivar_getOffset(ivar);
            let ienc = objc2::ffi::ivar_getTypeEncoding(ivar);
            let ienc_str = if ienc.is_null() {
                "<none>".into()
            } else {
                CStr::from_ptr(ienc).to_string_lossy().into_owned()
            };
            println!("  ivar {iname_str} @ offset {ioffset} :: {ienc_str}");
        }
        objc2::ffi::free(ctx_ivars as *mut _);
        break;
    }
}
#[cfg(debug_assertions)]
pub unsafe fn dump_content_holder_view(view: &NSGlassEffectView) {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open("dump_results.mm")
        .expect("Failed to open dump_results.mm");

    let Some(holder) = get_content_holder_view(view) else {
        return;
    };

    let cls: *const AnyClass = msg_send![holder, class];
    dump_class_ptr_to_file(cls, &mut file);

    // Also walk superclasses
    let mut sup: *const AnyClass = msg_send![cls, superclass];
    while !sup.is_null() {
        let sup_name = CStr::from_ptr(objc2::ffi::class_getName(sup));
        writeln!(file, "  superclass: {}", sup_name.to_string_lossy()).unwrap();
        if sup_name.to_string_lossy() == "NSObject" {
            break;
        }
        dump_class_ptr_to_file(sup, &mut file);
        sup = msg_send![sup, superclass];
    }
}

unsafe fn dump_class_ptr_to_file(cls: *const AnyClass, file: &mut std::fs::File) {
    let mut count: u32 = 0;
    let methods = objc2::ffi::class_copyMethodList(cls, &mut count);
    let name = CStr::from_ptr(objc2::ffi::class_getName(cls));
    writeln!(
        file,
        "=== {} ({} methods) ===",
        name.to_string_lossy(),
        count
    )
    .unwrap();
    for i in 0..count as usize {
        let method = *methods.add(i);
        let sel = objc2::ffi::method_getName(method).unwrap();
        let sel_name = CStr::from_ptr(objc2::ffi::sel_getName(sel));
        let enc_ptr = objc2::ffi::method_getTypeEncoding(method);
        let enc = if enc_ptr.is_null() {
            "<none>".into()
        } else {
            CStr::from_ptr(enc_ptr).to_string_lossy().into_owned()
        };
        writeln!(file, "  -{} :: {}", sel_name.to_string_lossy(), enc).unwrap();
    }
    objc2::ffi::free(methods as *mut _);
}

#[cfg(debug_assertions)]
pub unsafe fn dump_context_raw_bytes(view: &NSGlassEffectView) {
    let Some(holder) = get_content_holder_view(view) else {
        return;
    };

    let sel = Sel::register(c"_glassMaterialContext");
    let ctx: *mut AnyObject = msg_send![holder, performSelector: sel];
    if ctx.is_null() {
        println!("ctx nil");
        return;
    }

    // _style @ offset 8, 32 bytes
    let ctx_bytes = ctx as *const u8;
    print!("_style  (offset  8, 32 bytes): ");
    for i in 8..40usize {
        print!("{:02x} ", *ctx_bytes.add(i));
    }
    println!();

    // _material @ offset 40, 32 bytes
    print!("_material (offset 40, 32 bytes): ");
    for i in 40..72usize {
        print!("{:02x} ", *ctx_bytes.add(i));
    }
    println!();
}

pub unsafe fn try_set_material_context_style(
    view: &NSGlassEffectView,
    style_byte_offset: usize, // determined from step 2
    new_value: i64,
) {
    let Some(holder) = get_content_holder_view(view) else {
        return;
    };

    // Check if setter exists first
    let set_sel = Sel::register(c"set_glassMaterialContext:");
    let responds: bool = msg_send![holder, respondsToSelector: set_sel];
    if !responds {
        println!("no set_glassMaterialContext: on ContentHolderView");
        return;
    }

    // Get current context
    let get_sel = Sel::register(c"_glassMaterialContext");
    let ctx: *mut AnyObject = msg_send![holder, performSelector: get_sel];
    if ctx.is_null() {
        return;
    }

    // Copy it (NSCopying)
    let copy: *mut AnyObject = msg_send![ctx, copy];
    if copy.is_null() {
        return;
    }

    // Poke the byte we want to change
    let copy_bytes = copy as *mut u8;
    // Write as little-endian i64 at the given offset
    let value_bytes = new_value.to_le_bytes();
    for (i, b) in value_bytes.iter().enumerate() {
        *copy_bytes.add(style_byte_offset + i) = *b;
    }

    // Set it back
    let _: () = msg_send![holder, set_glassMaterialContext: copy];

    // Release the copy
    let _: () = msg_send![copy, release];
}

#[cfg(debug_assertions)]
pub unsafe fn dump_layer_tree(layer: Retained<CALayer>) {
    let mut depth = 0;
    let indent = "  ".repeat(depth);
    let cls = layer.class();
    let cls_name = cls.name();

    let layer_name = match layer.name() {
        Some(name) => name.to_string(),
        None => "<unnamed>".to_string(),
    };

    // For CABackdropLayer, print key properties
    let extra = if cls_name.to_string_lossy().contains("Backdrop") {
        let zoom: f64 = msg_send![&*layer, zoom];
        let scale: f64 = msg_send![&*layer, scale];
        let bleed: f64 = msg_send![&*layer, bleedAmount];
        format!(" zoom={zoom:.2} scale={scale:.2} bleed={bleed:.2}")
    } else {
        String::new()
    };

    println!(
        "{indent}[{}] \"{}\"{}",
        cls_name.to_string_lossy(),
        layer_name,
        extra
    );

    let Some(sublayers) = (unsafe { layer.sublayers() }) else {
        println!("sublayers end");
        return;
    };
    for sublayer in sublayers {
        unsafe { dump_layer_tree(sublayer) };
        depth += 1;
    }
}

// Call it on the glass view's layer
pub unsafe fn dump_glass_layer_tree(view: &NSGlassEffectView) {
    if let Some(layer) = view.layer() {
        println!("=== Layer tree ===");
        unsafe { dump_layer_tree(layer) };
    }
}

pub unsafe fn add_backdrop_layer(view: &NSView) -> Result<(), String> {
    view.setWantsLayer(true);
    let Some(root_layer) = view.layer() else {
        return Err("Missing CALayer".to_string());
    };

    let cls = AnyClass::get(c"CABackdropLayer").ok_or("missing CABackdropLayer".to_string())?;
    let layer: *mut CALayer = msg_send![cls, layer];
    if layer.is_null() {
        return Err("CABackdropLayer class exists but layer creation returned null".into());
    }

    let bounds = view.bounds();

    let _: () = msg_send![layer, setEnabled: true];
    let _: () = msg_send![layer, setScale: 0.5];
    let _: () = msg_send![layer, setZoom: 2];
    let _: () = msg_send![layer, setBackdropRect: bounds];
    let _: () = msg_send![layer, setAllowsInPlaceFiltering: true];
    let _: () = msg_send![layer, setIgnoresOffscreenGroups: true];
    let _: () = msg_send![layer, setWindowServerAware: true];
    let _: () = msg_send![layer, setDisablesOccludedBackdropBlurs: false];
    let _: () = msg_send![layer, setCaptureOnly: false];
    let _: () = msg_send![layer, setBleedAmount: 2.0];

    root_layer.insertSublayer_below(unsafe { &*layer }, None);
    Ok(())
}
