import { Button } from "@cap/ui-solid";
import { A, type RouteSectionProps } from "@solidjs/router";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import * as shell from "@tauri-apps/plugin-shell";
import "@total-typescript/ts-reset/filter-boolean";
import {
	createResource,
	createSignal,
	For,
	onMount,
	Show,
	Suspense,
} from "solid-js";
import DemoAvatar from "~/assets/avatar.jpeg";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { ProgressiveBlur } from "~/components/ProgressiveMask";
import { SignInButton } from "~/components/SignInButton";
import { authStore } from "~/store";
import { trackEvent } from "~/utils/analytics";
import { commands } from "~/utils/tauri";
import { createWindowFocus } from "../debug-library";
import { TextInput } from "../editor/TextInput";
import { IconLucideFlaskConical } from "./icons";

const WINDOW_SIZE = { width: 700, height: 540 } as const;

export default function Settings(props: RouteSectionProps) {
	const auth = authStore.createQuery();
	const [version] = createResource(() => getVersion());

	const handleAuth = async () => {
		if (auth.data) {
			trackEvent("user_signed_out", { platform: "desktop" });
			authStore.set(undefined);
		}
	};

	onMount(() => {
		const currentWindow = getCurrentWindow();
		commands.addToolbarShell();

		// currentWindow.setSize(
		// 	new LogicalSize(WINDOW_SIZE.width, WINDOW_SIZE.height),
		// );
	});

	const focused = createWindowFocus();

	type SidebarMode = "flat" | "overlay";
	const [sidebarStyle, setSidebarStyle] = createSignal(
		(localStorage.getItem("sidebarStyle") ?? "overlay") as SidebarMode,
	);

	return (
		<div
			data-tauri-drag-region
			class="size-full flex-1 flex flex-row divide-gray-3 text-[0.875rem] leading-5"
		>
			<div
				data-tauri-drag-region
				class="fixed top-0 bottom-0 left-0 w-48 flex items-center justify-center overscroll-none"
				classList={{
					"p-[7px]": sidebarStyle() === "overlay",
					"apple-glass": focused() && sidebarStyle() === "flat",
					"apple-glass-subdued": !focused() && sidebarStyle() === "flat",
				}}
			>
				<div
					class="size-full relative overflow-hidden"
					classList={{
						"rounded-[19px] apple-glass":
							focused() && sidebarStyle() === "overlay",
						"rounded-[19px] apple-glass-subdued":
							!focused() && sidebarStyle() === "overlay",
					}}
				>
					<ProgressiveBlur position="top" blur="lg" height="90px" />

					<div
						data-tauri-drag-region
						class="absolute top-0 left-0 right-0 z-10 flex items-center justify-center pt-10 px-2"
					>
						<div
							data-tauri-drag-region
							class="w-full apple-glass rounded-full text-sm flex items-center h-9 gap-2 px-2"
							classList={{
								"mt-1": sidebarStyle() === "flat",
							}}
						>
							<IconLucideSearch class="size-4 shrink-0 text-gray-11" />
							<TextInput
								class="flex-1 min-w-0 h-full outline-none placeholder-shown:text-gray-11"
								placeholder="Search"
							/>
						</div>
					</div>

					<div class="absolute inset-0 pt-20 scrollbar-none overflow-y-auto overscroll-y-contain fade-mask fade-top-28 fade-bottom-28 fade-intensity-100">
						<div class="mx-2 my-1 p-2 flex gap-2 items-center rounded-xl hover:bg-gray-5/50">
							<img class="size-8 rounded-full" src={DemoAvatar} />
							<div class="flex flex-col">
								<p class="font-medium">Richie</p>
								<p class="text-xs text-gray-11 font">Cap Account</p>
							</div>
						</div>
						<ul
							data-tauri-drag-region
							class="h-full p-2 space-y-1 text-gray-12 mb-10"
						>
							<For
								each={[
									{
										href: "general",
										name: "General",
										icon: IconCapSettings,
									},
									{
										href: "appearance",
										name: "Appearance",
										icon: IconLucidePalette,
									},
									{
										href: "hotkeys",
										name: "Shortcuts",
										icon: IconCapHotkeys,
									},
									// {
									// 	href: "recordings",
									// 	name: "Recordings",
									// 	icon: IconLucideSquarePlay,
									// },
									// {
									// 	href: "screenshots",
									// 	name: "Screenshots",
									// 	icon: IconLucideImage,
									// },
									{
										href: "integrations",
										name: "Integrations",
										icon: IconLucideUnplug,
									},
									{
										href: "license",
										name: "License",
										icon: IconLucideGift,
									},
									{
										href: "experimental",
										name: "Experimental",
										icon: IconLucideFlaskRound,
									},
									{
										href: "feedback",
										name: "Feedback",
										icon: IconLucideMessageSquarePlus,
									},
									{
										href: "changelog",
										name: "Changelog",
										icon: IconLucideBell,
									},
								].filter(Boolean)}
							>
								{(item) => (
									<li>
										<A
											href={item.href}
											activeClass="apple-glass bg-blue-9/60 pointer-events-none"
											class="rounded-full h-9 hover:bg-white/10 text-[13px] px-3 flex flex-row items-center gap-1.5 transition-colors cursor-default outline-none focus-visible:bg-gray-10/40"
										>
											<item.icon class="opacity-80 size-4" />
											<span>{item.name}</span>
										</A>
									</li>
								)}
							</For>
						</ul>
					</div>

					<div
						data-tauri-drag-region
						class="absolute bottom-0 z-20 p-2.5 text-left flex flex-col"
					>
						<Show when={version()}>
							{(v) => (
								<div
									data-tauri-drag-region
									class="text-xs text-gray-11 flex items-start gap-2 apple-vibrancy-fill"
								>
									<span>v{v()}</span>
									{/* <button
					type="button"
					class="text-gray-11 hover:text-gray-12 underline transition-colors"
					onClick={() => shell.open("https://cap.so/download/versions")}
				>
					View previous versions
				</button> */}
									<button
										type="button"
										class="text-gray-11 hover:text-gray-12 underline transition-colors"
										onClick={() =>
											localStorage.setItem(
												"sidebarStyle",
												setSidebarStyle((v) =>
													v === "overlay" ? "flat" : "overlay",
												),
											)
										}
									>
										Sidebar {sidebarStyle()}
									</button>
								</div>
							)}
						</Show>
						{/* {auth.data ? (
		<Button
			onClick={handleAuth}
			variant={auth.data ? "gray" : "dark"}
			class="w-full"
		>
			Sign Out
		</Button>
	) : (
		<SignInButton>Sign In</SignInButton>
	)} */}
					</div>
					<ProgressiveBlur position="bottom" blur="sm" height="50px" />
				</div>
			</div>
			<div
				class="apple-glass left-48 bg-gray-2/40 absolute h-9 w-fit mt-2 rounded-full flex items-center justify-between z-50"
				classList={{
					"ml-2": sidebarStyle() === "flat",
				}}
			>
				<button type="button" class="m-2.5">
					<IconLucideChevronLeft class="size-5" />
				</button>
				<div class="w-0 h-1/2 border-l apple-vibrancy-tertiary-fill" />
				<button type="button" class="m-2.5">
					<IconLucideChevronRight class="size-5 opacity-50" />
				</button>
			</div>

			<div class="overflow-y-hidden flex-1 animate-in pl-48 fade-mask fade-top-20 fade-intensity-100">
				<ProgressiveBlur
					position="top"
					height="50px"
					blur="md"
					class="-top-3 absolute"
				/>
				<CapErrorBoundary>
					<Suspense>{props.children}</Suspense>
				</CapErrorBoundary>
			</div>
		</div>
	);
}
