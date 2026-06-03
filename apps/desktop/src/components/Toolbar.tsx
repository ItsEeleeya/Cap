import { type JSX, splitProps } from "solid-js";

interface SlotProps {
	class?: string;
	children?: JSX.Element;
}

export function Toolbar(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div class={["cap-toolbar", local.class].filter(Boolean).join(" ")} {...rest}>
			{local.children}
		</div>
	);
}

export function ToolbarSidebarSlot(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-sidebar-slot", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export function ToolbarContent(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-content", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}

interface ToolbarItemGroupProps extends SlotProps {
	gap?: number;
}

export function ToolbarItemGroup(props: ToolbarItemGroupProps) {
	const [local, rest] = splitProps(props, ["class", "gap", "children"]);
	return (
		<div
			class={["cap-toolbar-item-group", local.class].filter(Boolean).join(" ")}
			style={{ "--toolbar-group-gap": `${local.gap ?? 2}px` }}
			{...rest}
		>
			{local.children}
		</div>
	);
}

export function ToolbarItem(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-item", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}