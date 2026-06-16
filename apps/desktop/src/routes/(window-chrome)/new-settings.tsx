import { A, type RouteSectionProps } from "@solidjs/router";
import type { ParentProps } from "solid-js";
import { Dynamic, For } from "solid-js/web";
import { RevealWindowWithSuspense } from "~/App";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { Scroller } from "~/components/ScrollView";
import { Sidebar, SidebarProvider, SidebarTrigger } from "~/components/Sidebar";
import {
	Toolbar,
	ToolbarContent,
	ToolbarSidebarSlot,
} from "~/components/Toolbar";
import { UserProfile, useUserProfile } from "~/components/UserProfileButton";
import { commands } from "~/utils/tauri";

const pages = [
	{
		href: "general",
		name: "General",
		color: "#8143FF",
		icon: IconMynauiCogThree,
	},
	{
		href: "recordings",
		name: "Recordings",
		color: "#EF4444",
		icon: IconMynauiFilm,
	},
	{
		href: "screenshots",
		name: "Screenshots",
		color: "#F7A400",
		icon: IconMynauiImageRectangle,
	},
	{
		href: "transcription",
		name: "Transcription",
		color: "#10B981",
		icon: IconMynauiSignal,
	},
	{
		href: "appearance",
		name: "Appearance",
		color: "#BF3FAD",
		icon: IconMynauiPaint,
	},
	{
		href: "hotkeys",
		name: "Shortcuts",
		color: "#0891B2",
		icon: IconMynauiKeyboard,
	},
	{ href: "cli", name: "CLI", color: "#0EA5A4", icon: IconMynauiTerminal },
	{
		href: "integrations",
		name: "Integrations",
		color: "#2563EB",
		icon: IconMynauiApi,
	},
	{ href: "license", name: "License", color: "#F97316", icon: IconMynauiKey },
	{
		href: "experimental",
		name: "Experimental",
		color: "#8B5CF6",
		icon: IconMynauiSparkles,
	},
	{
		href: "feedback",
		name: "Feedback",
		color: "#06B6D4",
		icon: IconMynauiHeart,
	},
	{
		href: "changelog",
		name: "Changelog",
		color: "#64748B",
		icon: IconMynauiBox,
	},
];

export default function Settings(props: RouteSectionProps) {
	return <UserProfile.Provider>
		<Inner>{props.children}</Inner>
	</UserProfile.Provider>;

	// return <Inner>{props.children}</Inner>;
}

function Inner(props: ParentProps) {
	return (
		<SidebarProvider collapsible>
			<Toolbar class="fixed top-0 z-50">
				<ToolbarSidebarSlot>
					<div class="size-full rounded-xs border-green-500 text-sm flex items-center justify-center">
						<div class="flex size-full p-4 items-center justify-end gap-4">
							<SidebarTrigger class="inline-flex h-full">
								<IconMynauiSidebar />
							</SidebarTrigger>

							<div class="inline-flex items-center justify-center gap-3">
								<button>
									<IconMynauiChevronLeft class="size-5" />
								</button>
								<button>
									<IconMynauiChevronRight class="size-5" />
								</button>
							</div>
						</div>
					</div>
				</ToolbarSidebarSlot>

				<ToolbarContent>
					<div class="size-full rounded-xs border-pink-500 text-sm flex items-center justify-center">
						{/* Toolbar */}
					</div>
				</ToolbarContent>
			</Toolbar>

			<div class="flex h-screen w-screen">
				<Sidebar class="relative">
					<div class="absolute inset-x-0 top-0 z-10 p-1.5 pt-14">
						<div class="flex flex-col gap-2">
							<div class="w-full px-2">
								<div class="w-full h-7.5 apple-glass-adaptive-focused rounded-full inline-flex items-center gap-2 px-3 text-sm">
									<IconMynauiSearch class="relative bottom-[0.5px]" />
									Search…
								</div>
							</div>
						</div>
					</div>

					<Scroller.Root class="h-full">
						<Scroller.Viewport
							edges={{ top: 100, bottom: 2 }}
							aria-label="Setting Pages"
							overscroll="contain"
							fade
						>
							<ul class="flex-1 px-3 pb-2 space-y-0.5 text-gray-12">
								<For each={pages}>
									{(item) => (
										<li>
											<A
												href={item.href}
												activeClass="bg-gray-10/30 pointer-events-none font-bold text-accent-foreground"
												class="rounded-full h-9.5 hover:bg-gray-3/50 duration-50 hover:duration-0 text-[13px] px-3 flex flex-row items-center gap-2.5 transition-colors ease-out smoothed cursor-default"
											>
												<span
													class="inline-flex items-center justify-center size-5.5 rounded-md smoothed shrink-0 borde border-gray-6 bg-gray-2 apple-glass text-white"
													style={{
														"color": item.color,
													}}
												>
													<div class="size-full" style={{ background: `color-mix(in srgb, ${item.color} 10%, transparent)` }}>
														<Dynamic
															component={item.icon}
															class="size-full p-0.5"
														/>
													</div>
												</span>
												<span class="truncate">{item.name}</span>
											</A>
										</li>
									)}
								</For>
							</ul>
						</Scroller.Viewport>
						<Scroller.Scrollbar edges={{ top: 100, bottom: 20 }} />
						<Scroller.EdgeEffect class="rounded-t-[calc(var(--sidebar-radius)+10px)]" to="top" size={75} blurIntensity={0.4} />
					</Scroller.Root>
				</Sidebar>

				<main class="flex-1 flex items-start justify-center">
					<CapErrorBoundary>
						<Scroller.Root class="w-full flex-1">
							<Scroller.Viewport class="w-full mx-auto flex-1 pt-(--window-titlebar-height) px-6 max-w-[750px]">
								<RevealWindowWithSuspense>
									{props.children}
								</RevealWindowWithSuspense>
							</Scroller.Viewport>
							<Scroller.Scrollbar edges={{ top: 30, bottom: 30 }} />
						</Scroller.Root>
					</CapErrorBoundary>
				</main>
			</div>
		</SidebarProvider>
	);
}

function ProfileButton() {
	const { handleProfileClick } = useUserProfile();

	return (
		<button
			type="button"
			class="cap-settings-profile flex h-11 gap-2 items-center mx-2 mt-2 mb-3 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-gray-3"
			data-tauri-drag-region="false"
			onClick={handleProfileClick}
		>
			{/* <UserProfile.Picture class="size-8 shrink-0" /> */}
			<div class="cap-settings-profile-copy flex h-8 flex-col flex-1 justify-center gap-0.5 min-w-0">
				<UserProfile.Email class="h-[15px] truncate text-[13px] leading-[15px] text-gray-12" />
				<span class="h-[13px] truncate text-[11px] leading-[13px] text-gray-10">
					Account
				</span>
			</div>
		</button>
	);
}