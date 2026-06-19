import type { JSX } from "solid-js";
import { SidebarProvider } from "~/components/Sidebar";
import {
	Toolbar,
	ToolbarContent,
	ToolbarSidebarSlot,
} from "~/components/Toolbar";

interface WindowShellProps {
	toolbarSidebarSlot?: JSX.Element;
	toolbarContent?: JSX.Element;
	children?: JSX.Element;
	sidebar?: JSX.Element;
	// Provider options forwarded to SidebarProvider (resizable/collapsible/etc.)
	providerProps?: Record<string, any>;
	toolbarClass?: string;
}

export function WindowShell(props: WindowShellProps) {
	const hasSlot = !!props.toolbarSidebarSlot;

	return (
		<SidebarProvider {...(props.providerProps ?? {})}>
			<Toolbar
				class={[props.toolbarClass, hasSlot ? "has-sidebar-slot" : ""]
					.filter(Boolean)
					.join(" ")}
			>
				{hasSlot && (
					<ToolbarSidebarSlot>{props.toolbarSidebarSlot}</ToolbarSidebarSlot>
				)}
				<ToolbarContent>{props.toolbarContent}</ToolbarContent>
			</Toolbar>

			<div class="flex h-screen w-screen">
				{/* Sidebar is rendered by consumer via props.sidebar */}
				{props.sidebar}

				<main class="size-full flex items-center justify-center overflow-y-scroll pt-(--window-titlebar-height) fade-mask fade-top-auto fade-intensity">
					{props.children}
				</main>
			</div>
		</SidebarProvider>
	);
}

export default WindowShell;
