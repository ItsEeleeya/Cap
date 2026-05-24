import { Button } from "@cap/ui-solid";
import {
	A,
	type RouteSectionProps,
	useLocation,
	useNavigate,
} from "@solidjs/router";
import { createQuery } from "@tanstack/solid-query";
import { getVersion } from "@tauri-apps/api/app";
import * as dialog from "@tauri-apps/plugin-dialog";
import * as shell from "@tauri-apps/plugin-shell";
import { check } from "@tauri-apps/plugin-updater";
import {
	createEffect,
	createMemo,
	createResource,
	createSignal,
	For,
	type JSX,
	Show,
} from "solid-js";
import { RevealWindowWithSuspense } from "~/App";
import { CapErrorBoundary } from "~/components/CapErrorBoundary";
import SidebarToggleIcon from "~/components/SidebarToggleIcon";
import { SignInButton } from "~/components/SignInButton";
import {
	Toolbar,
	ToolbarGroup,
	ToolbarItemGroup,
	ToolbarSpacer,
} from "~/components/Toolbar";
import { authStore } from "~/store";
import { trackEvent } from "~/utils/analytics";
import { clientEnv } from "~/utils/env";
import { apiClient, protectedHeaders } from "~/utils/web-api";
import { useWindowChromeMetrics } from "~/utils/window-chrome";
import IconLucideUserRound from "~icons/lucide/user-round";

const SETTINGS_SIDEBAR_STORAGE_KEY = "cap.settings.sidebarCollapsed";

const SETTINGS_ITEMS = [
	{
		href: "general",
		name: "General",
		icon: IconCapSettings,
		showInToolbar: true,
	},
	{
		href: "hotkeys",
		name: "Shortcuts",
		icon: IconCapHotkeys,
		showInToolbar: true,
	},
	{
		href: "recordings",
		name: "Recordings",
		icon: IconLucideSquarePlay,
		showInToolbar: true,
	},
	{
		href: "screenshots",
		name: "Screenshots",
		icon: IconLucideImage,
		showInToolbar: true,
	},
	{
		href: "transcription",
		name: "Transcription",
		icon: IconCapCaptions,
		showInToolbar: true,
	},
	{
		href: "integrations",
		name: "Integrations",
		icon: IconLucideUnplug,
		showInToolbar: true,
	},
	{
		href: "license",
		name: "License",
		icon: IconLucideGift,
		showInToolbar: false,
	},
	{
		href: "experimental",
		name: "Experimental",
		icon: IconCapSettings,
		showInToolbar: false,
	},
	{
		href: "feedback",
		name: "Feedback",
		icon: IconLucideMessageSquarePlus,
		showInToolbar: false,
	},
	{
		href: "changelog",
		name: "Changelog",
		icon: IconLucideBell,
		showInToolbar: false,
	},
] as const;

function readStoredSidebarCollapsed() {
	try {
		return localStorage.getItem(SETTINGS_SIDEBAR_STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

function isSettingsItemActive(pathname: string, href: string) {
	const normalizedPath =
		pathname === "/settings" ? "/settings/general" : pathname;
	return normalizedPath === `/settings/${href}`;
}

export default function Settings(props: RouteSectionProps) {
	const navigate = useNavigate();
	const location = useLocation();
	const chromeMetrics = useWindowChromeMetrics();
	const auth = authStore.createQuery();
	const [version] = createResource(() => getVersion());
	const [isCheckingForUpdates, setIsCheckingForUpdates] = createSignal(false);
	const [sidebarCollapsed, setSidebarCollapsed] = createSignal(
		readStoredSidebarCollapsed(),
	);
	const userProfile = createQuery(() => ({
		queryKey: ["settings-user-profile", auth.data?.user_id],
		enabled: !!auth.data,
		staleTime: 30 * 60 * 1000,
		gcTime: 2 * 60 * 60 * 1000,
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		queryFn: async () => {
			const response = await apiClient.desktop.getUserProfile({
				headers: await protectedHeaders(),
			});

			if (response.status !== 200)
				throw new Error("Failed to load account profile");

			return response.body;
		},
	}));
	const activeSettingsItem = createMemo(
		() =>
			SETTINGS_ITEMS.find((item) =>
				isSettingsItemActive(location.pathname, item.href),
			) ?? SETTINGS_ITEMS[0],
	);
	const toolbarItems = createMemo(() => {
		const primaryItems = SETTINGS_ITEMS.filter((item) => item.showInToolbar);
		const activeItem = activeSettingsItem();
		return primaryItems.some((item) => item.href === activeItem.href)
			? primaryItems
			: [...primaryItems, activeItem];
	});
	const accountName = createMemo(() => {
		if (!auth.data) return "Signed Out";

		const name = userProfile.data?.name?.trim();
		if (name) return name;

		const email = userProfile.data?.email?.trim();
		if (email) return email;

		return "Signed In";
	});
	const accountImageUrl = createMemo(() => {
		const imageUrl = userProfile.data?.imageUrl?.trim();
		return imageUrl || null;
	});
	const accountLoading = createMemo(
		() =>
			auth.isLoading ||
			(!!auth.data && userProfile.isLoading && !userProfile.data),
	);
	const openDashboard = () => {
		void shell.open(
			new URL("/dashboard", clientEnv.VITE_SERVER_URL).toString(),
		);
	};
	const toggleSidebar = () => setSidebarCollapsed((value) => !value);
	const sidebarStyle = createMemo<JSX.CSSProperties>(() => ({
		width: sidebarCollapsed() ? "0px" : "var(--macos-settings-sidebar-width)",
		"min-width": sidebarCollapsed()
			? "0px"
			: "var(--macos-settings-sidebar-width)",
		"max-width": sidebarCollapsed()
			? "0px"
			: "var(--macos-settings-sidebar-width)",
		opacity: sidebarCollapsed() ? "0" : "1",
		"pointer-events": sidebarCollapsed() ? "none" : "auto",
	}));

	createEffect(() => {
		try {
			localStorage.setItem(
				SETTINGS_SIDEBAR_STORAGE_KEY,
				String(sidebarCollapsed()),
			);
		} catch {}
	});

	const handleAuth = async () => {
		if (auth.data) {
			trackEvent("user_signed_out", { platform: "desktop" });
			authStore.set(undefined);
		}
	};

	const checkForUpdates = async () => {
		setIsCheckingForUpdates(true);

		try {
			const update = await check();

			if (!update) {
				await dialog.message(
					"You're already using the latest version of Cap.",
					{
						title: "No Update Available",
						kind: "info",
					},
				);
				return;
			}

			const shouldUpdate = await dialog.confirm(
				`Version ${update.version} of Cap is available, would you like to install it?`,
				{ title: "Update Cap", okLabel: "Update", cancelLabel: "Ignore" },
			);

			if (shouldUpdate) navigate("/update");
		} catch (e) {
			console.error("Failed to check for updates:", e);
			await dialog.message(
				"Unable to check for updates. Please download the latest version manually from cap.so/download. Your data will not be lost.\n\nIf this issue persists, please contact support.",
				{ title: "Update Error", kind: "error" },
			);
		} finally {
			setIsCheckingForUpdates(false);
		}
	};

	return (
		<div class="cap-settings-shell flex flex-1 flex-row divide-x divide-gray-3 overflow-hidden text-[0.875rem] leading-5">
			<div
				class="cap-settings-sidebar flex h-full flex-col overflow-hidden bg-gray-2 transition-[width,min-width,max-width,opacity] duration-200 ease-out"
				style={sidebarStyle()}
			>
				<Toolbar class="cap-settings-sidebar-toolbar shrink-0">
					<ToolbarGroup>
						<SidebarToggleButton
							collapsed={sidebarCollapsed()}
							side={chromeMetrics().captionSide}
							onClick={toggleSidebar}
						/>
					</ToolbarGroup>
					<ToolbarSpacer />
				</Toolbar>

				<button
					type="button"
					class="cap-settings-profile flex gap-2 items-center mx-2 mt-2 mb-3 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-gray-3"
					data-tauri-drag-region="false"
					onClick={openDashboard}
				>
					<Show
						when={!accountLoading()}
						fallback={
							<>
								<div class="cap-settings-profile-icon cap-settings-profile-skeleton cap-settings-profile-skeleton-avatar size-8 shrink-0 rounded-full bg-gray-4 animate-pulse" />
								<div class="cap-settings-profile-copy flex flex-col flex-1 gap-1.5 min-w-0">
									<span class="cap-settings-profile-skeleton cap-settings-profile-skeleton-title block h-3 w-24 rounded-full bg-gray-4 animate-pulse" />
									<span class="cap-settings-profile-skeleton cap-settings-profile-skeleton-subtitle block h-2.5 w-12 rounded-full bg-gray-4 animate-pulse" />
								</div>
							</>
						}
					>
						<Show
							when={accountImageUrl()}
							fallback={
								<div class="cap-settings-profile-icon flex justify-center items-center size-8 shrink-0 rounded-full bg-gray-3 text-gray-11">
									<IconLucideUserRound class="size-4" aria-hidden="true" />
								</div>
							}
						>
							{(imageUrl) => (
								<img
									class="cap-settings-profile-image size-8 shrink-0 rounded-full object-cover bg-gray-3"
									src={imageUrl()}
									alt=""
									draggable={false}
								/>
							)}
						</Show>
						<div class="cap-settings-profile-copy flex flex-col flex-1 gap-0.5 min-w-0">
							<p class="truncate text-[13px] text-gray-12">{accountName()}</p>
							<p class="truncate text-[11px] text-gray-10">Account</p>
						</div>
					</Show>
				</button>

				<ul class="cap-settings-nav min-w-48 h-full p-2.5 space-y-1 text-gray-12">
					<For each={SETTINGS_ITEMS}>
						{(item) => (
							<li>
								<A
									href={item.href}
									activeClass="bg-gray-5 pointer-events-none"
									class="cap-settings-nav-item rounded-lg h-8 hover:bg-gray-3 text-[13px] px-2 flex flex-row items-center gap-1.5 transition-colors"
									data-tauri-drag-region="false"
								>
									<item.icon class="opacity-60 size-4" aria-hidden="true" />
									<span>{item.name}</span>
								</A>
							</li>
						)}
					</For>
				</ul>

				<div class="cap-settings-account p-2.5 text-left flex flex-col">
					<Show when={version()}>
						{(v) => (
							<div class="mb-2 text-xs text-gray-11 flex flex-col items-start gap-1.5">
								<span>v{v()}</span>
								<div class="flex flex-col items-start gap-1.5">
									<button
										type="button"
										class="text-gray-11 hover:text-gray-12 underline transition-colors"
										onClick={() =>
											shell.open("https://cap.so/download/versions")
										}
										data-tauri-drag-region="false"
									>
										View previous versions
									</button>
									<button
										type="button"
										class="text-gray-11 hover:text-gray-12 underline transition-colors disabled:cursor-default disabled:opacity-50 disabled:hover:text-gray-11"
										disabled={isCheckingForUpdates()}
										onClick={checkForUpdates}
										data-tauri-drag-region="false"
									>
										{isCheckingForUpdates()
											? "Checking..."
											: "Check for updates"}
									</button>
								</div>
							</div>
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

			<div class="cap-settings-content flex min-w-0 flex-1 flex-col overflow-hidden">
				<Toolbar class="cap-settings-content-toolbar shrink-0 border-b border-black/10">
					<ToolbarGroup>
						<SidebarToggleButton
							collapsed={sidebarCollapsed()}
							side={chromeMetrics().captionSide}
							onClick={toggleSidebar}
						/>
					</ToolbarGroup>
					<ToolbarItemGroup class="max-w-full flex-1">
						<For each={toolbarItems()}>
							{(item) => (
								<A
									href={item.href}
									activeClass="bg-gray-12 text-gray-1 pointer-events-none"
									class="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-gray-11 transition-[opacity,filter,background-color,color] duration-200 ease-out animate-in fade-in zoom-in-95"
									data-tauri-drag-region="false"
								>
									<item.icon class="size-3.5 opacity-70" aria-hidden="true" />
									<span>{item.name}</span>
								</A>
							)}
						</For>
					</ToolbarItemGroup>
					<ToolbarSpacer />
				</Toolbar>

				<div class="min-w-0 flex-1 overflow-y-hidden animate-in fade-in">
					<CapErrorBoundary>
						<RevealWindowWithSuspense>
							{props.children}
						</RevealWindowWithSuspense>
					</CapErrorBoundary>
				</div>
			</div>
		</div>
	);
}

function SidebarToggleButton(props: {
	collapsed: boolean;
	side: "left" | "right";
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			class="flex size-8 items-center justify-center rounded-full text-gray-11 transition-colors hover:bg-black/6 hover:text-gray-12 active:bg-black/8"
			onClick={props.onClick}
			data-tauri-drag-region="false"
			aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
			aria-pressed={!props.collapsed}
		>
			<SidebarToggleIcon collapsed={props.collapsed} side={props.side} />
		</button>
	);
}
