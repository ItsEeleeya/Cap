use std::{
    collections::{HashMap, hash_map::Entry},
    ptr::NonNull,
    sync::Mutex,
};

use objc2::rc::Retained;
use objc2_app_kit::NSView;

use crate::platform::solarium::types::GlassEffectOptions;

use super::types::JsRect;

pub struct MainThreadPtr<T: objc2::Message>(NonNull<T>);

unsafe impl<T: objc2::Message> Send for MainThreadPtr<T> {}

unsafe impl<T: objc2::Message> Sync for MainThreadPtr<T> {}

impl<T: objc2::Message> Copy for MainThreadPtr<T> {}

impl<T: objc2::Message> Clone for MainThreadPtr<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: objc2::Message> MainThreadPtr<T> {
    pub fn new(retained: &Retained<T>) -> Self {
        Self(NonNull::new(Retained::as_ptr(retained) as *mut T).unwrap())
    }

    pub unsafe fn from_nonnull(ptr: NonNull<T>) -> Self {
        Self(ptr)
    }

    pub unsafe fn as_ref(&self) -> &T {
        unsafe {
            // SAFETY: Caller must ensure this runs on the main AppKit thread for `MainThreadOnly` types.
            self.0.as_ref()
        }
    }
}

pub struct OverlayEntry {
    pub outer_view: MainThreadPtr<NSView>,
    pub window_label: String,
    pub last_rect: Option<JsRect>,
    pub glass_options: Option<GlassEffectOptions>,
}

#[derive(Default)]
pub struct SolariumRegistry {
    entries: Mutex<HashMap<String, OverlayEntry>>,
}

impl SolariumRegistry {
    pub fn contains_key(&self, id: &str) -> Result<bool, String> {
        let map = self
            .entries
            .lock()
            .map_err(|_| "overlay registry lock poisoned".to_string())?;
        Ok(map.contains_key(id))
    }

    pub fn insert_entry(
        &self,
        id: String,
        entry: OverlayEntry,
    ) -> Result<(), (String, OverlayEntry)> {
        let mut map = match self.entries.lock() {
            Ok(m) => m,
            Err(_) => {
                return Err(("overlay registry lock poisoned".into(), entry));
            }
        };
        match map.entry(id) {
            Entry::Occupied(_) => Err(("duplicate overlay id".into(), entry)),
            Entry::Vacant(v) => {
                v.insert(entry);
                Ok(())
            }
        }
    }

    pub fn remove_entry(&self, id: &str) -> Result<Option<OverlayEntry>, String> {
        let mut map = self
            .entries
            .lock()
            .map_err(|_| "overlay registry lock poisoned".to_string())?;
        Ok(map.remove(id))
    }

    pub fn prepare_update(
        &self,
        id: &str,
        rect: JsRect,
    ) -> Result<Option<(MainThreadPtr<NSView>, String, JsRect)>, String> {
        let mut map = self
            .entries
            .lock()
            .map_err(|_| "overlay registry lock poisoned".to_string())?;
        let Some(entry) = map.get_mut(id) else {
            return Ok(None);
        };
        if entry.last_rect == Some(rect) {
            return Ok(None);
        }
        entry.last_rect = Some(rect);
        Ok(Some((entry.outer_view, entry.window_label.clone(), rect)))
    }
}
