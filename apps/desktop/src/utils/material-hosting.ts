export const APPLE_VISUAL_EFFECT_KEY = "-apple-visual-effect";

// macOS 26.0
export const APPLE_SUPPORTS_HOSTED_MATERIALS = CSS.supports(
	APPLE_VISUAL_EFFECT_KEY,
	"-apple-system-glass-material",
);

// macOS 26.2
export const APPLE_SUPPORTS_HOSTED_MATERIALS_EXTRA = CSS.supports(
	APPLE_VISUAL_EFFECT_KEY,
	"-apple-system-glass-material-clear",
);
