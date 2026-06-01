/**
 * Toolbar.tsx
 *
 * Three user-visible segments (Leading, Center, Trailing) plus a special
 * SidebarSlot that aligns with the sidebar below the titlebar.
 *
 * Usage:
 *   <Toolbar>
 *     <ToolbarSidebarSlot>
 *       {/* content here aligns with the sidebar below * /}
 *       <ProjectSwitcher />
 *     </ToolbarSidebarSlot>
 *
 *     <ToolbarLeading>
 *       <Breadcrumb />
 *     </ToolbarLeading>
 *
 *     <ToolbarCenter>
 *       <SearchBar />
 *     </ToolbarCenter>
 *
 *     <ToolbarTrailing>
 *       <ShareButton />
 *     </ToolbarTrailing>
 *   </Toolbar>
 *
 * Sizing and safe areas are handled entirely in chrome.css via CSS custom
 * properties — this component has no size-related JS logic.
 *
 * To open/close the sidebar:
 *   document.documentElement.style.setProperty("--sidebar-w", "220px"); // open
 *   document.documentElement.style.setProperty("--sidebar-w", "0px");   // close
 *
 * To animate the transition, add to :root in your CSS (or chrome.css):
 *   transition: --sidebar-w 220ms var(--ease-out);
 */

import { type JSX, mergeProps, splitProps } from "solid-js";

interface SlotProps {
	class?: string;
	style?: JSX.CSSProperties;
	children?: JSX.Element;
}

/**
 * Toolbar root. Renders the 4-column grid and sits below the fixed titlebar.
 * Place directly inside .cap-window-body.
 */
export function Toolbar(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}

/**
 * The special sidebar-integrated slot.
 *
 * Width tracks --sidebar-w, expanding to fill the sidebar column.
 * Content is padded by --titlebar-leading-safe (captions width on macOS/LTR)
 * so it never renders under the traffic lights or Windows caption buttons.
 *
 * When the sidebar is collapsed (--sidebar-w: 0px), this slot shrinks to
 * just --titlebar-leading-safe wide (68px on macOS) and clips its content.
 *
 * You can place a project/space switcher here — it'll visually integrate
 * into the sidebar header area when the sidebar is expanded.
 */
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

/**
 * Leading toolbar segment.
 * Sits immediately after the sidebar slot.
 * Typically holds breadcrumbs, back/forward navigation, or document title.
 */
export function ToolbarLeading(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-leading", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}

/**
 * Center toolbar segment. Takes all remaining space (1fr).
 * Content is centered. Typically holds a search bar or page title.
 */
export function ToolbarCenter(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-center", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}

/**
 * Trailing toolbar segment.
 * Width is --toolbar-trailing-w (= --titlebar-trailing-safe), which reserves
 * space for Windows caption buttons. On macOS it's 0 — items sit flush right.
 * Typically holds action buttons, user avatar, settings icon.
 */
export function ToolbarTrailing(props: SlotProps) {
	const [local, rest] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={["cap-toolbar-trailing", local.class].filter(Boolean).join(" ")}
			{...rest}
		>
			{local.children}
		</div>
	);
}