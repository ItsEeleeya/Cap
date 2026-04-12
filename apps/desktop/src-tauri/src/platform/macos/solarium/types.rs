// Apple Private values extracted from DesignLibrary.framework and AppKit.framework on Apr 12, 2026 for macOS 26.3
use objc2_app_kit::NSColor;
use serde::Deserialize;

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, specta::Type)]
pub struct JsRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Default, Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[repr(i64)]
pub enum GlassEffectVariant {
    #[default]
    Regular = 0,
    Clear = 1,
    Dock = 2,
    AppIcons = 3,
    Widgets = 4,
    Text = 5,
    Avplayer = 6,
    Facetime = 7,
    ControlCenter = 8,
    NotificationCenter = 9,
    Monogram = 10,
    Bubbles = 11,
    Identity = 12,
    FocusBorder = 13,
    FocusPlatter = 14,
    Keyboard = 15,
    Sidebar = 16,
    AbuttedSidebar = 17,
    Inspector = 18,
    Control = 19,
    Loupe = 20,
    Slider = 21,
    Camera = 22,
    CartouchePopover = 23,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
pub struct TintColor {
    pub r: f64,
    pub g: f64,
    pub b: f64,
    pub a: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OverlayUpdatePayload {
    pub id: String,
    pub rect: JsRect,
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SolariumOverlay {
    pub rect: JsRect,
    pub glass_options: Option<GlassEffectOptions>,
}

#[derive(Debug, Clone, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GlassEffectOptions {
    pub corner_radius: f64,
    pub tint_color: Option<TintColor>,
    // Apple Private
    pub variant: GlassEffectVariant,
    pub subvariant: Option<GlassMaterialSubvariant>,
    pub interaction_state: Option<GlassInteractionState>,
    pub subdued_state: Option<GlassSubduedState>,
    pub scrim_state: Option<GlassScrimState>,
    pub content_lensing: Option<GlassContentLensing>,
    pub adaptive_appearance: Option<GlassAdaptiveAppearance>,
    pub use_reduced_shadow_radius: Option<bool>,
    pub group_identifier: Option<String>,
    pub vibrant_blending_style: Option<u64>,
}

#[derive(Debug, Clone, Copy, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum GlassMaterialSubvariant {
    Default,
    LockscreenControls,
    LockscreenNotifications,
    HomescreenClose,
    Camera,
    PosterSwitcher,
    HomescreenResizeHandle,
    CursorAccessory,
    HomescreenFolder,
    Tab,
    Track,
    FocusedButtonFill,
    EntryField,
    VolumeSlider,
    CustomizeSheet,
    WatchFacePhotos,
    WatchFacePhotosMini,
    WatchFaceFlowStencil,
    WatchFaceFlowSolid,
    IOSNotificationCenter,
    WatchPasscode,
    HomescreenAppLibraryPod,
    Menu,
    WatchSmartStack,
    WatchSmartStackAnimatedContent,
    SiriSnippet,
    AlarmSlider,
    MapsSign,
    Sheet,
    MessagesTapback,
}

impl GlassMaterialSubvariant {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::LockscreenControls => "lockscreenControls",
            Self::LockscreenNotifications => "lockscreenNotifications",
            Self::HomescreenClose => "homescreenClose",
            Self::Camera => "camera",
            Self::PosterSwitcher => "posterSwitcher",
            Self::HomescreenResizeHandle => "homescreenResizeHandle",
            Self::CursorAccessory => "cursorAccessory",
            Self::HomescreenFolder => "homescreenFolder",
            Self::Tab => "tab",
            Self::Track => "track",
            Self::FocusedButtonFill => "focusedButtonFill",
            Self::EntryField => "entryField",
            Self::VolumeSlider => "volumeSlider",
            Self::CustomizeSheet => "customizeSheet",
            Self::WatchFacePhotos => "watchFacePhotos",
            Self::WatchFacePhotosMini => "watchFacePhotosMini",
            Self::WatchFaceFlowStencil => "watchFaceFlowStencil",
            Self::WatchFaceFlowSolid => "watchFaceFlowSolid",
            Self::IOSNotificationCenter => "iOSNotificationCenter",
            Self::WatchPasscode => "watchPasscode",
            Self::HomescreenAppLibraryPod => "homescreenAppLibraryPod",
            Self::Menu => "menu",
            Self::WatchSmartStack => "watchSmartStack",
            Self::WatchSmartStackAnimatedContent => "watchSmartStackAnimatedContent",
            Self::SiriSnippet => "siriSnippet",
            Self::AlarmSlider => "alarmSlider",
            Self::MapsSign => "mapsSign",
            Self::Sheet => "sheet",
            Self::MessagesTapback => "messagesTapback",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[repr(i64)]
pub enum GlassInteractionState {
    #[default]
    Normal = 0,
    Hovered = 1,
    Pressed = 2,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[repr(i64)]
pub enum GlassSubduedState {
    #[default]
    Normal = 0,
    Subdued = 1,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[repr(i64)]
pub enum GlassScrimState {
    #[default]
    None = 0,
    Light = 1,
    Dark = 2,
}

/// GlassMaterialProvider.ContentEffect
#[derive(Debug, Clone, Copy, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum GlassContentLensing {
    #[default]
    Automatic,
    None,
    Clip,
    Lense,
}

impl GlassContentLensing {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Automatic => "automatic",
            Self::None => "none",
            Self::Clip => "clip",
            Self::Lense => "lense",
        }
    }
}

#[derive(Debug, Clone, Copy, Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
#[repr(i64)]
pub enum GlassAdaptiveAppearance {
    Light = 0,
    Dark = 1,
    #[default]
    Automatic = 2,
}
