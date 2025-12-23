import { children, type JSX, type ParentProps } from "solid-js";
import { Dynamic } from "solid-js/web";

// -apple-system-blur-material-ultra-thin enable-if=HAVE_CORE_MATERIAL
// -apple-system-blur-material-thin enable-if=HAVE_CORE_MATERIAL
// -apple-system-blur-material enable-if=HAVE_CORE_MATERIAL
// -apple-system-blur-material-thick enable-if=HAVE_CORE_MATERIAL
// -apple-system-blur-material-chrome enable-if=HAVE_CORE_MATERIAL
// -apple-system-glass-material enable-if=HAVE_MATERIAL_HOSTING
// -apple-system-glass-material-clear enable-if=HAVE_MATERIAL_HOSTING
// -apple-system-glass-material-subdued enable-if=HAVE_MATERIAL_HOSTING
// -apple-system-glass-material-media-controls enable-if=HAVE_MATERIAL_HOSTING
// -apple-system-glass-material-media-controls-subdued enable-if=HAVE_MATERIAL_HOSTING
// -apple-system-vibrancy-label enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-secondary-label enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-tertiary-label enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-quaternary-label enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-fill enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-secondary-fill enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-tertiary-fill enable-if=HAVE_CORE_MATERIAL
// -apple-system-vibrancy-separator enable-if=HAVE_CORE_MATERIAL
//
const KEY_VISUAL_EFFECT = "-apple-visual-effect";

// macOS 26.0
export const APPLE_SUPPORTS_HOSTED_MATERIALS = CSS.supports(
	"-apple-visual-effect",
	"-apple-system-glass-material",
);

// macOS 26.2
export const APPLE_SUPPORTS_HOSTED_MATERIALS_EXTRA = CSS.supports(
	"-apple-visual-effect",
	"-apple-system-glass-material-clear",
);

type MaterialKind = "glass" | "blur";

export default function Material(
	props: ParentProps<{
		kind: MaterialKind;
		as?: keyof JSX.HTMLElementTags;
		class?: string;
	}>,
) {
	const Tag = () => props.as ?? "div";
	const resolved = children(() => props.children);

	return (
		<Dynamic component={Tag} class={props.class}>
			{resolved()}
		</Dynamic>
	);
}
