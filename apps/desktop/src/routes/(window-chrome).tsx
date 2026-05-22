import { type RouteSectionProps, useCurrentMatches } from "@solidjs/router";
import { type } from "@tauri-apps/plugin-os";
import { createMemo, type ParentProps, Show, Suspense } from "solid-js";
import { AbsoluteInsetLoader } from "~/components/Loader";
import CaptionControlsWindows11 from "~/components/titlebar/controls/CaptionControlsWindows11";
import {
	useWindowChromeContext,
	WindowChromeContext,
} from "./(window-chrome)/Context";

export default function (props: RouteSectionProps) {
	return (
		<WindowChromeContext>
			<div class="flex overflow-hidden flex-col w-screen h-screen max-h-screen bg-gray-1">
				<div class="flex overflow-y-hidden flex-1 animate-in fade-in">
					<Inner>{props.children}</Inner>
				</div>
			</div>
		</WindowChromeContext>
	);
}

function Inner(props: ParentProps) {
	const ctx = useWindowChromeContext();
	if (!ctx)
		throw new Error(
			"useWindowChrome must be used within a WindowChromeContext",
		);

	const matches = useCurrentMatches();
	const newChrome = createMemo(() =>
		matches().some((match) => match.route.info?.useNewChrome === true),
	);

	return (
		<Show
			when={newChrome()}
			fallback={<LegacyChrome>{props.children}</LegacyChrome>}
		>
			<div class="relative flex overflow-hidden flex-col w-screen h-screen max-h-screen bg-gray-1">
				<Suspense>
					<header
						data-tauri-drag-region="deep"
						class="fixed flex items-center min-w-0 w-full h-9 select-none shrink-0 windows:flex-row macos:flex-row-reverse"
					>
						{type() === "windows" && <CaptionControlsWindows11 class="ml-auto!" />}
						{type() === "macos" && <div class="h-full w-[68px]" />}
					</header>

					<div class="flex overflow-y-hidden flex-col flex-1 animate-in fade-in">
						{props.children}
					</div>
					{/* 
					<div
						class={
							fullSizeContentView()
								? "relative flex-1 overflow-hidden"
								: "flex overflow-hidden flex-1"
						}
					>
						<Show when={ctx.state()?.sidebar} fallback={mainContent()}>
							<Show
								when={!fullSizeContentView()}
								fallback={
									<div class="relative flex-1 overflow-hidden">
										<div class="absolute inset-0">{props.children}</div>
										<div class="relative z-10 flex h-full overflow-hidden bg-gray-2 shadow-xl">
											<div class="flex h-full min-w-[280px] overflow-hidden border-r border-gray-4">
												{ctx.state()?.sidebar?.()}
											</div>
										</div>
									</div>
								}
							>
								<SplitView
									name="window-chrome-sidebar"
									class="flex-1 overflow-hidden"
								>
									<SplitViewPanel
										initialSize={0.28}
										minSize={0.18}
										collapsible={ctx.state()?.sidebarCollapsible}
										class="flex flex-col overflow-hidden bg-gray-2"
									>
										{ctx.state()?.sidebar?.()}
									</SplitViewPanel>
									<SplitViewHandle withHandle />
									<SplitViewPanel class="flex flex-col overflow-hidden">
										{mainContent()}
									</SplitViewPanel>
								</SplitView>
							</Show>
						</Show>
					</div> */}
				</Suspense>
			</div>
		</Show>
	);
}

function LegacyChrome(props: ParentProps) {
	const ctx = useWindowChromeContext();
	if (!ctx)
		throw new Error(
			"useWindowChrome must be used within a WindowChromeContext",
		);

	return (
		<div class="flex overflow-hidden flex-col w-screen h-screen max-h-screen divide-y divide-gray-5 bg-gray-1">
			<Suspense fallback={<AbsoluteInsetLoader />}>
				<header
					data-tauri-drag-region="deep"
					class="flex items-center min-w-0 w-full h-9 select-none shrink-0 bg-gray-2 windows:flex-row macos:flex-row-reverse"
				>
					{ctx.state()?.items?.()}
					{type() === "windows" && (
						<CaptionControlsWindows11 class="ml-auto!" />
					)}
					{type() === "macos" && <div class="h-full w-[68px]" />}
				</header>

				<div class="flex overflow-y-hidden flex-col flex-1 animate-in fade-in">
					{props.children}
				</div>
			</Suspense>
		</div>
	);
}
