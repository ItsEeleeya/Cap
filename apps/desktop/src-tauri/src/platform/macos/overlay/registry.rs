use std::collections::HashMap;
use std::sync::Mutex;

use cocoa::base::id;

/// Thread-safe handle to an NSView (raw pointer as usize).
/// All actual view operations must happen on the main thread.
#[derive(Clone, Copy, Debug)]
pub struct ViewHandle(usize);

impl ViewHandle {
    pub fn new(view: id) -> Self {
        Self(view as usize)
    }

    /// # Safety
    /// Must be called on the main thread. The underlying view must be valid.
    pub unsafe fn as_id(self) -> id {
        self.0 as id
    }
}

pub struct OverlayEntry {
    pub view: ViewHandle,
    /// We store this so update/destroy can look up the window without
    /// requiring the caller to pass it every time.
    pub window_label: String,
}

// SAFETY: ViewHandle is usize; all mutations happen on main thread via run_on_main_sync.
unsafe impl Send for OverlayEntry {}
unsafe impl Sync for OverlayEntry {}

#[derive(Default)]
pub struct OverlayRegistry {
    entries: Mutex<HashMap<String, OverlayEntry>>,
}

impl OverlayRegistry {
    pub fn insert(&self, id: String, view: ViewHandle, window_label: String) -> Result<(), String> {
        self.entries
            .lock()
            .map(|mut m| {
                m.insert(id, OverlayEntry { view, window_label });
            })
            .map_err(|_| "Lock failed".to_string())
    }

    pub fn get(&self, id: &str) -> Result<Option<(ViewHandle, String)>, String> {
        self.entries
            .lock()
            .map(|m| m.get(id).map(|e| (e.view, e.window_label.clone())))
            .map_err(|_| "Lock failed".to_string())
    }

    pub fn remove(&self, id: &str) -> Result<Option<(ViewHandle, String)>, String> {
        self.entries
            .lock()
            .map(|mut m| m.remove(id).map(|e| (e.view, e.window_label)))
            .map_err(|_| "Lock failed".to_string())
    }
}
