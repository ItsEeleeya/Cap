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
			<div class="flex overflow-hidden flex-col w-screen h-screen max-h-screen">
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
			<div class="relative flex overflow-hidden flex-col w-screen h-screen max-h-screen">
				<Suspense>
					<header
						data-tauri-drag-region="deep"
						class="h-titlebar fixed inset-x-0 top-0 flex items-center min-w-0 w-full shrink-0 border border-red-200 z-9999 win:flex-row macos:flex-row-reverse"
					>
						{type() === "windows" && (
							<CaptionControlsWindows11 class="ml-auto! absolute top-0" />
						)}
						{type() === "macos" && (
							<div
								class="h-full shrink-0"
								style={{ width: "var(--window-caption-width)" }}
							/>
						)}
					</header>

					<div class="flex overflow-y-hidden flex-col flex-1 animate-in fade-in">
						{props.children}
					</div>
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
		<div
			class="cap-window-shell flex overflow-hidden flex-col w-screen h-screen max-h-screen divide-y divide-gray-5 bg-gray-1"
		>
			<Suspense fallback={<AbsoluteInsetLoader />}>
				<header
					data-tauri-drag-region="deep"
					class="cap-window-header flex items-center min-w-0 w-full h-9 select-none shrink-0 bg-gray-2 win:flex-row macos:flex-row-reverse"
				>
					{ctx.state()?.items?.()}
					{type() === "windows" && (
						<CaptionControlsWindows11 class="ml-auto!" />
					)}
					{type() === "macos" && <div class="h-full w-[68px]" />}
				</header>

				<div class="cap-window-body flex overflow-y-hidden flex-col flex-1 animate-in fade-in">
					{props.children}
				</div>
			</Suspense>
		</div>
	);
}
