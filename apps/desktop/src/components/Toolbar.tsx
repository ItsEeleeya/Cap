import { cx } from "cva";
import type { JSX, ParentProps } from "solid-js";

interface ToolbarProps extends ParentProps {
	class?: string;
	inset?: boolean;
	style?: JSX.CSSProperties;
}

export function Toolbar(props: ToolbarProps) {
	const style = () =>
		props.inset === false
			? props.style
			: {
					"padding-left":
						"calc(var(--window-caption-padding-left, 0px) + 0.75rem)",
					"padding-right":
						"calc(var(--window-caption-padding-right, 0px) + 0.75rem)",
					...(props.style ?? {}),
				};

	return (
		<div
			class={cx("flex min-h-[52px] items-center gap-2", props.class)}
			style={style()}
		>
			{props.children}
		</div>
	);
}

interface ToolbarGroupProps extends ParentProps {
	class?: string;
}

export function ToolbarGroup(props: ToolbarGroupProps) {
	return (
		<div class={cx("flex min-w-0 items-center gap-2", props.class)}>
			{props.children}
		</div>
	);
}

interface ToolbarSpacerProps {
	class?: string;
}

export function ToolbarSpacer(props: ToolbarSpacerProps) {
	return <div class={cx("min-w-0 flex-1", props.class)} />;
}

interface ToolbarItemGroupProps extends ParentProps {
	class?: string;
}

export function ToolbarItemGroup(props: ToolbarItemGroupProps) {
	return (
		<div
			class={cx(
				"flex min-w-0 max-w-full items-center gap-1 overflow-x-auto rounded-full border border-black/5 bg-white/60 p-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl transition-[width,background-color,box-shadow] duration-200 ease-out hide-scroll solarium:apple-glass solarium:border-white/10 solarium:bg-transparent solarium:shadow-none",
				props.class,
			)}
		>
			{props.children}
		</div>
	);
}
