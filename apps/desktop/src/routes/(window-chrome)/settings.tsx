import type { RouteSectionProps } from "@solidjs/router";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { RevealWindowWithSuspense } from "~/App";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { Sidebar, SidebarProvider, SidebarTrigger } from "~/components/Sidebar";
import { Toolbar, ToolbarContent, ToolbarSidebarSlot } from "~/components/Toolbar";

export default function Settings(props: RouteSectionProps) {
	document.documentElement.setAttribute("data-transparent-window", "true");
	document.body.style.background = "transparent";

	return (
		<SidebarProvider
			resizable
			collapsible
			side="left"
			maxWidth={600}
			storageKey="settings"
		>
			<Toolbar class="fixed top-0 z-50">
				<ToolbarSidebarSlot>
					<div class="size-full rounded-xs border border-green-500 text-sm flex items-center justify-center">
						<SidebarTrigger class="size-full border">Sidebar</SidebarTrigger>
					</div>
				</ToolbarSidebarSlot>

				<ToolbarContent>
					<div class="size-full rounded-xs border border-pink-500 text-sm flex items-center justify-center">Leading</div>
				</ToolbarContent>
			</Toolbar>

			<div class="flex h-screen w-screen">
				<Sidebar>
					<nav class="p-4 pt-14 flex flex-col gap-2 text-sm size-full">
						<span>Item 1</span>
						<span>Item 2</span>
						<span>Item 3</span>
					</nav>
				</Sidebar>

				<main class="size-full flex items-center justify-center overflow-y-scroll pt-(--window-titlebar-height) fade-mask fade-top-auto fade-intensity">
					<CapErrorBoundary>
						<RevealWindowWithSuspense>{props.children}</RevealWindowWithSuspense>
					</CapErrorBoundary>

				</main>
			</div>
		</SidebarProvider>

	);
}
