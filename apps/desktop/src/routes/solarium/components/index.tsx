import { cx } from "cva";
import { children, ParentProps } from "solid-js";
import { createWindowFocus } from "~/routes/debug-library";

export function SolariumToolbarButtonContainer(
	props: ParentProps<{ class?: string }>,
) {
	const resolved = children(() => props.children);
	const focused = createWindowFocus();
	return (
		<div
			data-tauri-drag-region
			class={cx(
				"flex gap-2 rounded-full px-1 py-0.5",
				props.class,
				focused() ? "apple-glass-adaptive" : "apple-glass-subdued",
			)}
		>
			{resolved()}
		</div>
	);
}
