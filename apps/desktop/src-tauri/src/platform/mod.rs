use serde::{Deserialize, Serialize};
use specta::Type;
#[cfg(target_os = "windows")]
pub mod win;

#[cfg(target_os = "windows")]
pub use win::*;

#[cfg(target_os = "macos")]
pub mod macos;

#[cfg(target_os = "macos")]
pub use macos::*;

#[derive(Debug, Serialize, Deserialize, Type, Default)]
#[repr(isize)]
pub enum HapticPattern {
    Alignment = 0,
    LevelChange = 1,
    #[default]
    Generic = 2,
}

#[derive(Debug, Serialize, Deserialize, Type, Default)]
#[repr(usize)]
pub enum HapticPerformanceTime {
    Default = 0,
    #[default]
    Now = 1,
    DrawCompleted = 2,
}

#[tauri::command]
#[specta::specta]
pub fn perform_haptic_feedback(
    pattern: HapticPattern,
    time: HapticPerformanceTime,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    unsafe {
        use objc2_app_kit::{
            NSHapticFeedbackManager, NSHapticFeedbackPattern, NSHapticFeedbackPerformanceTime,
            NSHapticFeedbackPerformer,
        };

        NSHapticFeedbackManager::defaultPerformer().performFeedbackPattern_performanceTime(
            NSHapticFeedbackPattern(pattern as isize),
            NSHapticFeedbackPerformanceTime(time as usize),
        );
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Err("Haptics are only supported on macOS.".into())
}
