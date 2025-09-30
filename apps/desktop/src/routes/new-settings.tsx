import { Button } from "@cap/ui-solid";
import { A, type RouteSectionProps } from "@solidjs/router";
import { getVersion } from "@tauri-apps/api/app";
import "@total-typescript/ts-reset/filter-boolean";
import { createResource, For, Show, Suspense } from "solid-js";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import { ProgressiveBlur } from "~/components/ProgressiveMask";
import { SignInButton } from "~/components/SignInButton";

import { authStore } from "~/store";
import { trackEvent } from "~/utils/analytics";

export default function Settings(props: RouteSectionProps) {
	const auth = authStore.createQuery();
	const [version] = createResource(() => getVersion());

	const handleAuth = async () => {
		if (auth.data) {
			trackEvent("user_signed_out", { platform: "desktop" });
			authStore.set(undefined);
		}
	};

	return (
		<div
			class="flex-1 flex flex-row divide-x divide-gray-3 text-[0.875rem] leading-[1.25rem] h-full w-full border-2"
			data-tauri-drag-region
		>
			<div
				class="fixed w-[12rem] bottom-2 top-2 left-2 rounded-[1.1rem] z-50"
				data-tauri-drag-region
				style={{
					"-apple-visual-effect": "-apple-system-glass-material",
				}}
			>
				<div
					class="size-full flex flex-col h-full overflow-x-hidden overflow-y-scroll pt-10 scrollbar-none rounded-[1.1rem]"
					data-tauri-drag-region
				>
					<ProgressiveBlur
						class="rounded-t-[1.1rem] overflow-clip"
						position="top"
						height="16%"
					/>
					<div class="absolute w-full z-40">
						<div
							class="mx-2 my-0.5 p-2 px-2.5 rounded-full flex gap-2 items-center justify-start *:opacity-50 brightness-75"
							style={{
								"-apple-visual-effect": "-apple-system-glass-material",
							}}
						>
							<IconLucideSearch class="size-4" />
							<p class="text-xs">Search</p>
						</div>
					</div>
					<ul class="min-w-[10rem] p-[0.525rem] pb-28 pt-12 space-y-1 text-gray-12">
						<For
							each={[
								{
									href: "general",
									name: "General",
									icon: IconCapSettings,
								},
								{
									href: "general_",
									name: "Look & Feel",
									icon: IconLucidePalette,
								},
								{
									href: "supersettings",
									name: "Secret Settings",
									icon: IconLucideWand,
								},
								{
									href: "hotkeys",
									name: "Shortcuts",
									icon: IconCapHotkeys,
								},
								{
									href: "recordings",
									name: "Previous Recordings",
									icon: IconLucideSquarePlay,
								},
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
									icon: IconCapSettings,
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
										activeClass="bg-gray-5 pointer-events-none"
										class="rounded-lg h-[2rem] hover:bg-gray-3 text-[13px] px-2 flex flex-row items-center gap-[0.375rem] transition-colors"
									>
										<item.icon class="opacity-60 size-4" />
										<span>{item.name}</span>
									</A>
								</li>
							)}
						</For>
						<ProgressiveBlur
							class="rounded-t-[1.1rem] overflow-clip"
							position="bottom"
							height="24%"
						/>
					</ul>
					<div class="p-[0.625rem] text-left flex flex-col absolute bottom-0 w-full z-50">
						<Show when={version()}>
							{(v) => (
								<p class="mb-2 text-xs font-extralight text-gray-11 opacity-40">
									v{v()} (draft/solarium)
								</p>
							)}
						</Show>
						{auth.data ? (
							<Button
								onClick={handleAuth}
								variant={auth.data ? "gray" : "dark"}
								class="w-full"
							>
								Sign Out
							</Button>
						) : (
							<SignInButton>Sign In</SignInButton>
						)}
					</div>
				</div>
			</div>
			<div class="absolute flex animate-in h-full w-screen *:pl-[12.5rem]">
				<CapErrorBoundary>
					<Suspense>{props.children}</Suspense>
				</CapErrorBoundary>
			</div>
		</div>
	);
}
