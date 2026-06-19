import { A, type RouteSectionProps } from "@solidjs/router";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Effect } from "@tauri-apps/api/window";
import { capitalize } from "effect/String";
import { createEffect, createMemo, type ParentProps } from "solid-js";
import { Dynamic, For, Show } from "solid-js/web";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { Scroller } from "~/components/ScrollView";
import { Sidebar, SidebarProvider, SidebarTrigger } from "~/components/Sidebar";
import {
	Toolbar,
	ToolbarContent,
	ToolbarSidebarSlot,
} from "~/components/Toolbar";
import { createLicenseQuery } from "~/utils/queries";
import { RevealWindowWithSuspense } from "~/utils/RevealWindow";
import { commands } from "~/utils/tauri";
import {
	UserAccountContextProvider,
	useUserAccount,
} from "~/utils/UserAccountProvider";

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
	return (
		<UserAccountContextProvider>
			<Inner>{props.children}</Inner>
		</UserAccountContextProvider>
	);
}

function Inner(props: ParentProps) {
	return (
		<SidebarProvider collapsible>
			<Toolbar class="fixed top-0 z-50">
				<ToolbarSidebarSlot>
					<div class="size-full rounded-xs border-green-500 text-sm flex items-center justify-center">
						<div class="flex size-full p-3 items-center justify-end gap-4">
							<SidebarTrigger class="inline-flex h-full">
								<IconMynauiSidebar />
							</SidebarTrigger>

							<div class="inline-flex items-center justify-center gap-2 apple-glass rounded-full h-9 px-2">
								<button>
									<IconMynauiChevronLeft class="size-5.5" />
								</button>
								<button>
									<IconMynauiChevronRight class="size-5.5" />
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
					<div class="absolute inset-x-0 top-0 z-10 p-1.5 pt-15">
						<div class="flex flex-col gap-2">
							<div class="w-full px-2">
								<div class="w-full h-7.5 apple-glass rounded-full inline-flex items-center gap-2 px-3 text-sm">
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
								<li class="w-full pb-2 px-0.5">
									<ProfileButton />
								</li>
								<For each={pages}>
									{(item) => (
										<li>
											<A
												href={item.href}
												activeClass="bg-gray-10/30 pointer-events-none font-bold text-gray-12"
												class="rounded-full h-9.5 hover:bg-gray-3/50 duration-50 hover:duration-0 text-[13px] px-3 flex flex-row items-center gap-2.5 transition-colors ease-out smoothed cursor-default"
											>
												<span
													class="inline-flex items-center justify-center size-5.5 rounded-md smoothed shrink-0 borde border-gray-6 bg-gray-1/80 apple-glass text-white"
													style={{
														color: item.color,
													}}
												>
													<div
														class="size-full"
														style={{
															background: `color-mix(in srgb, ${item.color} 10%, transparent)`,
														}}
													>
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
						<Scroller.EdgeEffect
							class="rounded-t-[calc(var(--sidebar-radius)+10px)]"
							to="top"
							size={75}
							blurIntensity={0.4}
						/>
					</Scroller.Root>
				</Sidebar>

				<main class="flex-1 flex items-start justify-center">
					<CapErrorBoundary>
						<Scroller.Root class="w-full flex-1">
							<Scroller.Viewport class="w-full mx-auto flex-1 pt-(--window-titlebar-height) px-6 max-w-[750px]" overscroll="contain">
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
	const user = useUserAccount();
	const license = createLicenseQuery();

	return (
		<A
			href="account"
			type="button"
			activeClass="bg-gray-10/30 pointer-events-none font-bold text-gray-12"
			class="rounded-full hover:bg-gray-3/50 duration-50 hover:duration-0 px-2 py-1.5 flex flex-row items-center gap-2.5 transition-colors ease-out smoothed cursor-default"
		// onClick={handleProfileClick}
		>
			<Show when={user.signedIn() && user.profile()}
				fallback={
					<div class="flex gap-2.5 items-center">
						<IconLucideUserRound class="size-9 rounded-full apple-glass-subdued not-solarium:border p-2 opacity-80" />
						<span class="inline-flex flex-col text-sm font-semibold">
							Account
						</span>
					</div>
				}
			>
				{(p) => (
					<div class="flex gap-2.5 items-center">
						<img draggable={false} class="size-9 rounded-full apple-glass not-solarium:border p-0.5" src={user.avatarDataUrl() ?? ""} />
						<span class="inline-flex flex-col text-sm font-semibold">
							{p().name}
							<small class="font-medium opacity-80">{capitalize(license.data?.type ?? "")}</small>
						</span>
					</div>
				)}
			</Show>
		</A>
	);
}