import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { A, type RouteSectionProps, useLocation } from "@solidjs/router";
import { capitalize } from "effect/String";
import { createSignal, type ParentProps } from "solid-js";
import { Dynamic, For, Portal, Show } from "solid-js/web";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import GlassEffectContainer from "~/components/GlassEffectContainer";
import { Scroller } from "~/components/ScrollView";
import { Sidebar, SidebarProvider, SidebarTrigger } from "~/components/Sidebar";
import { FloatingPanel } from "~/components/solarium/FloatingPanel";
import {
	Toolbar,
	ToolbarContent,
	ToolbarSidebarSlot,
} from "~/components/Toolbar";
import { createLicenseQuery } from "~/utils/queries";
import { RevealWindowWithSuspense } from "~/utils/RevealWindow";
import {
	UserAccountContextProvider,
	useUserAccount,
} from "~/utils/UserAccountProvider";

const pages = [
	{
		href: "general",
		name: "General",
		color: "oklch(62% 0.16 275)", // violet
		icon: IconMynauiCogThree,
	},
	{
		href: "recordings",
		name: "Recordings",
		color: "oklch(62% 0.18 25)", // red
		icon: IconMynauiFilm,
	},
	{
		href: "screenshots",
		name: "Screenshots",
		color: "oklch(70% 0.16 85)", // amber
		icon: IconMynauiImageRectangle,
	},
	{
		href: "transcription",
		name: "Transcription",
		color: "oklch(68% 0.14 155)", // green
		icon: IconMynauiSignal,
	},
	{
		href: "appearance",
		name: "Appearance",
		color: "oklch(62% 0.14 320)", // pink/purple
		icon: IconMynauiPaint,
	},
	{
		href: "hotkeys",
		name: "Shortcuts",
		color: "oklch(60% 0.15 220)", // cyan-blue
		icon: IconMynauiKeyboard,
	},
	{
		href: "cli",
		name: "CLI",
		color: "oklch(60% 0.14 200)", // teal-blue
		icon: IconMynauiTerminal,
	},
	{
		href: "integrations",
		name: "Integrations",
		color: "oklch(58% 0.18 255)", // blue
		icon: IconMynauiApi,
	},
	{
		href: "license",
		name: "License",
		color: "oklch(68% 0.16 75)", // orange
		icon: IconMynauiKey,
	},
	{
		href: "experimental",
		name: "Experimental",
		color: "oklch(65% 0.17 295)", // purple
		icon: IconMynauiSparkles,
	},
	{
		href: "feedback",
		name: "Feedback",
		color: "oklch(65% 0.14 195)", // sky
		icon: IconMynauiHeart,
	},
	{
		href: "changelog",
		name: "Changelog",
		color: "oklch(55% 0.05 240)", // desaturated slate-blue
		icon: IconMynauiBox,
	},
];

export default function Settings(props: RouteSectionProps) {
	return (
		<UserAccountContextProvider>
			{/* <FloatingPanel /> */}
			<Inner>{props.children}</Inner>
		</UserAccountContextProvider>
	);
}

function Inner(props: ParentProps) {
	const location = useLocation();

	// const [headerHeight, setHeaderHeight] = createSignal(0);
	// let headerMountEl!: HTMLDivElement;

	// const { observe } = makeResizeObserver((entries) => {
	// 	const entry = entries[0];
	// 	if (entry) setHeaderHeight(entry.contentRect.height);
	// });

	// const topEdge = () => 60 + headerHeight();

	return (
		<SidebarProvider resizable>
			<Toolbar class="fixed top-0 z-50">
				<ToolbarSidebarSlot class="size-full rounded-xs text-sm flex items-center justify-center">
					<div class="flex size-full p-3 items-center justify-end gap-4">
						<SidebarTrigger>
							<IconMynauiSidebar />
						</SidebarTrigger>
					</div>
				</ToolbarSidebarSlot>

				<ToolbarContent class="px-4">
					<GlassEffectContainer class="inline-flex items-center justify-center gap-2 rounded-full h-9 w-9 px-2 mx-1 z-50">
						<button>
							<IconMynauiChevronLeft class="size-5.5 pr-0.5 apple-vibrancy-fill" />
						</button>
						{/* <button>
							<IconMynauiChevronRight class="size-5.5" />
						</button> */}
					</GlassEffectContainer>
				</ToolbarContent>
			</Toolbar>

			<div class="flex h-screen w-screen">
				<Sidebar class="relative">
					<div class="absolute inset-x-0 top-0 z-10 p-1.5 pt-15">
						<div class="flex flex-col gap-2">
							<div class="w-full px-2">
								<GlassEffectContainer class="w-full h-7.5 rounded-full inline-flex items-center gap-2 px-3 text-sm">
									<IconMynauiSearch class="relative bottom-[0.5px]" />
									<input
										class="outline-none w-full fade-mask fade-left-2"
										type="text"
										placeholder="Search…"
									/>
								</GlassEffectContainer>
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
									{(item) => {
										const active = () =>
											location.pathname.endsWith(`/${item.href}`);

										return (
											<li>
												<A
													href={item.href}
													activeClass="pointer-events-none font-bold text-gray-12 bg-gray-5 dark:bg-gray-1/50 text-blue-8"
													class="rounded-full h-9.5 hover:bg-gray-7/50 focus-visible:bg-gray-7/50 text-[13px] px-3 flex flex-row items-center gap-2.5 motion-safe:transition-colors duration-100 hover:duration-0 ease-out smoothed cursor-default"
												>
													<span
														class="inline-flex items-center justify-center size-6 rounded-full shrink-0 not-solarium:border not-solarium:border-gray-6 text-white"
														style={{
															color: active() ? "currentcolor" : item.color,
															// background: `color-mix(in srgb, ${item.color} 10%, var(--color-gray-1) 80%)`,
														}}
													>
														<Dynamic
															component={item.icon}
															class="size-full p-0.5"
														/>
													</span>
													<span class="truncate">{item.name}</span>
												</A>
											</li>
										);
									}}
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

				<main class="flex-1 flex justify-center">
					<CapErrorBoundary>
						<Scroller.Root class="w-full flex-1">
							<Scroller.Viewport
								class="w-full flex-1 /pt-(--window-titlebar-height)"
								overscroll="contain"
								fade
								edges={{ top: 60 }}
							>
								<div class="max-w-[750px] mx-auto px-6">
									<RevealWindowWithSuspense>
										{props.children}
									</RevealWindowWithSuspense>
								</div>
							</Scroller.Viewport>
							<Scroller.EdgeEffect to="top" size={55} blurIntensity={0.12} />
							<Scroller.Scrollbar edges={{ top: 50, bottom: 30 }} />
						</Scroller.Root>
					</CapErrorBoundary>
				</main>
			</div>
		</SidebarProvider>
	);
}

// export function SettingsHeaderPortal(props: ParentProps) {
// 	return <Portal mount={ }>
// 		{props.children}
// 	</Portal>;
// }

function ProfileButton() {
	const user = useUserAccount();
	const license = createLicenseQuery();

	return (
		<A
			href="account"
			type="button"
			activeClass="bg-gray-10/30 pointer-events-none font-bold text-gray-12"
			class="rounded-full hover:bg-gray-3/50 hover:duration-0 px-2 py-1.5 flex flex-row items-center gap-2.5 motion-safe:transition-colors duration-100 ease-out smoothed cursor-default"
			// onClick={handleProfileClick}
		>
			<Show
				when={user.signedIn() && user.profile()}
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
						<img
							draggable={false}
							class="size-8.5 rounded-full"
							src={user.avatarDataUrl() ?? ""}
						/>
						<span class="inline-flex flex-col text-sm font-semibold">
							{p().name}
							<small class="font-medium opacity-80">
								{capitalize(license.data?.type ?? "")}
							</small>
						</span>
					</div>
				)}
			</Show>
		</A>
	);
}
