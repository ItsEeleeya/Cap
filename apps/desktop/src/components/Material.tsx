import { children, JSX, type ParentProps } from "solid-js";
import { Dynamic } from "solid-js/web";

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

    return <Dynamic component={Tag} class={props.class}>
	    {resolved()}
    </Dynamic>
}
