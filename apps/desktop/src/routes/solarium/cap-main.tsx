import { Button } from "@cap/ui-solid";
import { createEventListener } from "@solid-primitives/event-listener";
import { useNavigate } from "@solidjs/router";
import { createMutation, queryOptions, useQuery } from "@tanstack/solid-query";
import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
	getAllWebviewWindows,
	WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import * as dialog from "@tauri-apps/plugin-dialog";
import { type as ostype } from "@tauri-apps/plugin-os";
import * as shell from "@tauri-apps/plugin-shell";
import * as updater from "@tauri-apps/plugin-updater";
import { cx } from "cva";
import {
	createEffect,
	createMemo,
	createSignal,
	ErrorBoundary,
	onCleanup,
	onMount,
	Show,
	Suspense,
} from "solid-js";
import { createStore, produce, reconcile } from "solid-js/store";
import { Transition } from "solid-transition-group";
import { RecoveryToast } from "~/components/RecoveryToast";
import Tooltip from "~/components/Tooltip";
import { Input } from "~/routes/editor/ui";
import { authStore, generalSettingsStore } from "~/store";
import { createSignInMutation } from "~/utils/auth";
import { createTauriEventListener } from "~/utils/createEventListener";
import {
	createCameraMutation,
	createCurrentRecordingQuery,
	createLicenseQuery,
	listAudioDevices,
	listDisplaysWithThumbnails,
	listRecordings,
	listScreens,
	listVideoDevices,
	listWindows,
	listWindowsWithThumbnails,
} from "~/utils/queries";
import {
	type CameraInfo,
	type CaptureDisplay,
	type CaptureDisplayWithThumbnail,
	type CaptureWindow,
	type CaptureWindowWithThumbnail,
	commands,
	type DeviceOrModelID,
	events,
	type RecordingTargetMode,
	type ScreenCaptureTarget,
	type UploadProgress,
} from "~/utils/tauri";
import IconCapCrop from "~icons/cap/crop";
import IconCapLogoFull from "~icons/cap/logo-full";
import IconCapLogoFullDark from "~icons/cap/logo-full-dark";
import IconCapScreen from "~icons/cap/screen";
import IconCapSettings from "~icons/cap/settings";
import IconLucideAppWindowMac from "~icons/lucide/app-window-mac";
import IconLucideArrowLeft from "~icons/lucide/arrow-left";
import IconLucideBug from "~icons/lucide/bug";
import IconLucideImage from "~icons/lucide/image";
import IconLucideSearch from "~icons/lucide/search";
import IconLucideSquarePlay from "~icons/lucide/square-play";
import ChangelogButton from "../(window-chrome)/new-main/ChangeLogButton";
import SystemAudio from "../(window-chrome)/new-main/SystemAudio";
import type {
	RecordingWithPath,
	ScreenshotWithPath,
} from "../(window-chrome)/new-main/TargetCard";
import TargetMenuGrid from "../(window-chrome)/new-main/TargetMenuGrid";
import {
	RecordingOptionsProvider,
	useRecordingOptions,
} from "../(window-chrome)/OptionsContext";
import { CameraSelectBase, MicrophoneSelectBase } from "./input-selectors";
import { Mode } from "./recording-controls";

const WINDOW_SIZE = { width: 310, height: 320 } as const;

const findCamera = (cameras: CameraInfo[], id: DeviceOrModelID) => {
	return cameras.find((c) => {
		if (!id) return false;
		return "DeviceID" in id
			? id.DeviceID === c.device_id
			: id.ModelID === c.model_id;
	});
};

type WindowListItem = Pick<
	CaptureWindow,
	"id" | "owner_name" | "name" | "bounds" | "refresh_rate"
>;

const createWindowSignature = (
	list?: readonly WindowListItem[],
): string | undefined => {
	if (!list) return undefined;

	return list
		.map((item) => {
			const { position, size } = item.bounds;
			return [
				item.id,
				item.owner_name,
				item.name,
				position.x,
				position.y,
				size.width,
				size.height,
				item.refresh_rate,
			].join(":");
		})
		.join("|");
};

type DisplayListItem = Pick<CaptureDisplay, "id" | "name" | "refresh_rate">;

const createDisplaySignature = (
	list?: readonly DisplayListItem[],
): string | undefined => {
	if (!list) return undefined;

	return list
		.map((item) => [item.id, item.name, item.refresh_rate].join(":"))
		.join("|");
};

type Page = "home" | "display" | "window" | "recording" | "screenshot";

type TargetMenuPanelProps =
	| {
			variant: "display";
			targets?: CaptureDisplayWithThumbnail[];
			onSelect: (target: CaptureDisplayWithThumbnail) => void;
	  }
	| {
			variant: "window";
			targets?: CaptureWindowWithThumbnail[];
			onSelect: (target: CaptureWindowWithThumbnail) => void;
	  }
	| {
			variant: "recording";
			targets?: RecordingWithPath[];
			onSelect: (target: RecordingWithPath) => void;
			onViewAll: () => void;
			uploadProgress?: Record<string, number>;
			reuploadingPaths?: Set<string>;
			onReupload?: (path: string) => void;
			onRefetch?: () => void;
	  }
	| {
			variant: "screenshot";
			targets?: ScreenshotWithPath[];
			onSelect: (target: ScreenshotWithPath) => void;
			onViewAll: () => void;
	  };

type SharedTargetMenuProps = {
	isLoading: boolean;
	errorMessage?: string;
	disabled: boolean;
	onBack: () => void;
	searchQuery: string;
	onSearchChange: (query: string) => void;
};

function TargetMenuPanel(props: TargetMenuPanelProps & SharedTargetMenuProps) {
	const trimmedSearch = createMemo(() => props.searchQuery.trim());
	const normalizedQuery = createMemo(() => trimmedSearch().toLowerCase());
	const noResultsMessage =
		props.variant === "display"
			? "No matching displays"
			: props.variant === "window"
				? "No matching windows"
				: props.variant === "recording"
					? "No matching recordings"
					: "No matching screenshots";

	const filteredDisplayTargets = createMemo<CaptureDisplayWithThumbnail[]>(
		() => {
			if (props.variant !== "display") return [];
			const query = normalizedQuery();
			const targets = props.targets ?? [];
			if (!query) return targets;

			const matchesQuery = (value?: string | null) =>
				!!value && value.toLowerCase().includes(query);

			return targets.filter(
				(target) => matchesQuery(target.name) || matchesQuery(target.id),
			);
		},
	);

	const filteredWindowTargets = createMemo<CaptureWindowWithThumbnail[]>(() => {
		if (props.variant !== "window") return [];
		const query = normalizedQuery();
		const targets = props.targets ?? [];
		if (!query) return targets;

		const matchesQuery = (value?: string | null) =>
			!!value && value.toLowerCase().includes(query);

		return targets.filter(
			(target) =>
				matchesQuery(target.name) ||
				matchesQuery(target.owner_name) ||
				matchesQuery(target.id),
		);
	});

	const filteredRecordingTargets = createMemo<RecordingWithPath[]>(() => {
		if (props.variant !== "recording") return [];
		const query = normalizedQuery();
		const targets = props.targets ?? [];
		if (!query) return targets;

		const matchesQuery = (value?: string | null) =>
			!!value && value.toLowerCase().includes(query);

		return targets.filter((target) => matchesQuery(target.pretty_name));
	});

	const filteredScreenshotTargets = createMemo<ScreenshotWithPath[]>(() => {
		if (props.variant !== "screenshot") return [];
		const query = normalizedQuery();
		const targets = props.targets ?? [];
		if (!query) return targets;

		const matchesQuery = (value?: string | null) =>
			!!value && value.toLowerCase().includes(query);

		return targets.filter((target) => matchesQuery(target.pretty_name));
	});

	return (
		<div class="flex flex-col w-full h-full min-h-0 pt-12">
			<div class="px-2 custom-scroll flex-1 overflow-y-auto">
				{props.variant === "display" ? (
					<TargetMenuGrid
						variant="display"
						targets={filteredDisplayTargets()}
						isLoading={props.isLoading}
						errorMessage={props.errorMessage}
						onSelect={props.onSelect}
						disabled={props.disabled}
						highlightQuery={trimmedSearch()}
						emptyMessage={trimmedSearch() ? noResultsMessage : undefined}
					/>
				) : props.variant === "window" ? (
					<TargetMenuGrid
						variant="window"
						targets={filteredWindowTargets()}
						isLoading={props.isLoading}
						errorMessage={props.errorMessage}
						onSelect={props.onSelect}
						disabled={props.disabled}
						highlightQuery={trimmedSearch()}
						emptyMessage={trimmedSearch() ? noResultsMessage : undefined}
					/>
				) : props.variant === "recording" ? (
					<TargetMenuGrid
						variant="recording"
						targets={filteredRecordingTargets()}
						isLoading={props.isLoading}
						errorMessage={props.errorMessage}
						onSelect={props.onSelect}
						disabled={props.disabled}
						highlightQuery={trimmedSearch()}
						emptyMessage={trimmedSearch() ? noResultsMessage : undefined}
						uploadProgress={props.uploadProgress}
						reuploadingPaths={props.reuploadingPaths}
						onReupload={props.onReupload}
						onRefetch={props.onRefetch}
						onViewAll={props.onViewAll}
					/>
				) : (
					<TargetMenuGrid
						variant="screenshot"
						targets={filteredScreenshotTargets()}
						isLoading={props.isLoading}
						errorMessage={props.errorMessage}
						onSelect={props.onSelect}
						disabled={props.disabled}
						highlightQuery={trimmedSearch()}
						emptyMessage={trimmedSearch() ? noResultsMessage : undefined}
						onViewAll={props.onViewAll}
					/>
				)}
			</div>
		</div>
	);
}

export default function () {
	const generalSettings = generalSettingsStore.createQuery();

	const navigate = useNavigate();
	createEventListener(window, "focus", () => {
		const data = generalSettings.data;
		if (data?.enableNewRecordingFlow === false) navigate("/");
	});

	return (
		<Suspense fallback={null}>
			<RecordingOptionsProvider>
				<Suspense fallback={null}>
					<Page />
				</Suspense>
			</RecordingOptionsProvider>
		</Suspense>
	);
}

let hasChecked = false;
function createUpdateCheck() {
	if (import.meta.env.DEV) return;

	const navigate = useNavigate();

	onMount(async () => {
		if (hasChecked) return;
		hasChecked = true;

		await new Promise((res) => setTimeout(res, 1000));

		const update = await updater.check();
		if (!update) return;

		const shouldUpdate = await dialog.confirm(
			`Version ${update.version} of Cap is available, would you like to install it?`,
			{ title: "Update Cap", okLabel: "Update", cancelLabel: "Ignore" },
		);

		if (!shouldUpdate) return;
		navigate("/update");
	});
}

function Page() {
	const { rawOptions, setOptions } = useRecordingOptions();
	const currentRecording = createCurrentRecordingQuery();
	const isRecording = () => !!currentRecording.data;
	const auth = authStore.createQuery();

	const authData = () => auth.data;

	const [page, setPage] = createSignal<Page>("home");
	const [searchQuery, setSearchQuery] = createSignal("");
	const [searchExpanded, setSearchExpanded] = createSignal(false);
	let searchInputRef: HTMLInputElement | undefined;

	const [hasHiddenMainWindowForPicker, setHasHiddenMainWindowForPicker] =
		createSignal(false);
	createEffect(() => {
		const pickerActive = rawOptions.targetMode != null;
		const hasHidden = hasHiddenMainWindowForPicker();
		if (pickerActive && !hasHidden) {
			setHasHiddenMainWindowForPicker(true);
			void getCurrentWindow().hide();
		} else if (!pickerActive && hasHidden) {
			setHasHiddenMainWindowForPicker(false);
			const currentWindow = getCurrentWindow();
			void currentWindow.show();
			void currentWindow.setFocus();
		}
	});
	onCleanup(() => {
		if (!hasHiddenMainWindowForPicker()) return;
		setHasHiddenMainWindowForPicker(false);
		void getCurrentWindow().show();
	});

	const displayTargets = useQuery(() => ({
		...listDisplaysWithThumbnails,
		refetchInterval: false,
	}));

	const windowTargets = useQuery(() => ({
		...listWindowsWithThumbnails,
		refetchInterval: false,
	}));

	const recordings = useQuery(() => listRecordings);

	const [uploadProgress, setUploadProgress] = createStore<
		Record<string, number>
	>({});
	const [reuploadingPaths, setReuploadingPaths] = createSignal<Set<string>>(
		new Set(),
	);

	createTauriEventListener(events.uploadProgressEvent, (e) => {
		if (e.uploaded === e.total) {
			setUploadProgress(
				produce((s) => {
					delete s[e.video_id];
				}),
			);
		} else {
			const total = Number(e.total);
			const progress = total > 0 ? (Number(e.uploaded) / total) * 100 : 0;
			setUploadProgress(e.video_id, progress);
		}
	});

	createTauriEventListener(events.recordingDeleted, () => recordings.refetch());

	const handleReupload = async (path: string) => {
		setReuploadingPaths((prev) => new Set([...prev, path]));
		try {
			await commands.uploadExportedVideo(
				path,
				"Reupload",
				new Channel<UploadProgress>(() => {}),
				null,
			);
		} finally {
			setReuploadingPaths((prev) => {
				const next = new Set(prev);
				next.delete(path);
				return next;
			});
			recordings.refetch();
		}
	};

	const screenshots = useQuery(() =>
		queryOptions<ScreenshotWithPath[]>({
			queryKey: ["screenshots"],
			queryFn: async () => {
				const result = await commands
					.listScreenshots()
					.catch(() => [] as const);

				return result.map(
					([path, meta]) => ({ ...meta, path }) as ScreenshotWithPath,
				);
			},
			refetchInterval: 2000,
			reconcile: (old, next) => reconcile(next)(old),
			initialData: [],
		}),
	);

	const screens = useQuery(() => listScreens);
	const windows = useQuery(() => listWindows);

	const hasDisplayTargetsData = () => displayTargets.status === "success";
	const hasWindowTargetsData = () => windowTargets.status === "success";

	const existingDisplayIds = createMemo(() => {
		const currentScreens = screens.data;
		if (!currentScreens) return undefined;
		return new Set(currentScreens.map((screen) => screen.id));
	});

	const displayTargetsData = createMemo(() => {
		if (!hasDisplayTargetsData()) return undefined;
		const ids = existingDisplayIds();
		if (!ids) return displayTargets.data;
		return displayTargets.data?.filter((target) => ids.has(target.id));
	});

	const existingWindowIds = createMemo(() => {
		const currentWindows = windows.data;
		if (!currentWindows) return undefined;
		return new Set(currentWindows.map((win) => win.id));
	});

	const windowTargetsData = createMemo(() => {
		if (!hasWindowTargetsData()) return undefined;
		const ids = existingWindowIds();
		if (!ids) return windowTargets.data;
		return windowTargets.data?.filter((target) => ids.has(target.id));
	});

	const recordingsData = createMemo(() => {
		const data = recordings.data;
		if (!data) return [];
		return data
			.slice(0, 20)
			.map(([path, meta]) => ({ ...meta, path }) as RecordingWithPath);
	});

	const screenshotsData = createMemo(() => {
		const data = screenshots.data;
		if (!data) return [];
		return data.slice(0, 20) as ScreenshotWithPath[];
	});

	const displayMenuLoading = () =>
		!hasDisplayTargetsData() &&
		(displayTargets.status === "pending" ||
			displayTargets.fetchStatus === "fetching");
	const windowMenuLoading = () =>
		!hasWindowTargetsData() &&
		(windowTargets.status === "pending" ||
			windowTargets.fetchStatus === "fetching");

	const displayErrorMessage = () => {
		if (!displayTargets.error) return undefined;
		return "Unable to load displays. Try using the Display button.";
	};

	const windowErrorMessage = () => {
		if (!windowTargets.error) return undefined;
		return "Unable to load windows. Try using the Window button.";
	};

	const selectDisplayTarget = (target: CaptureDisplayWithThumbnail) => {
		setOptions(
			"captureTarget",
			reconcile({ variant: "display", id: target.id }),
		);
		setOptions("targetMode", "display");
		commands.openTargetSelectOverlays({ variant: "display", id: target.id });
		setPage("home");
		setSearchQuery("");
		setSearchExpanded(false);
	};

	const selectWindowTarget = async (target: CaptureWindowWithThumbnail) => {
		setOptions(
			"captureTarget",
			reconcile({ variant: "window", id: target.id }),
		);
		setOptions("targetMode", "window");
		commands.openTargetSelectOverlays({ variant: "window", id: target.id });
		setPage("home");
		setSearchQuery("");
		setSearchExpanded(false);

		try {
			await commands.focusWindow(target.id);
		} catch (error) {
			console.error("Failed to focus window:", error);
		}
	};

	createEffect(() => {
		if (!isRecording()) return;
		setPage("home");
		setSearchQuery("");
		setSearchExpanded(false);
	});

	createUpdateCheck();

	commands.addToolbarShell();

	onMount(async () => {
		const { __CAP__ } = window as typeof window & {
			__CAP__?: { initialTargetMode?: RecordingTargetMode | null };
		};
		const targetMode = __CAP__?.initialTargetMode ?? null;
		setOptions({ targetMode });
		if (targetMode) await commands.openTargetSelectOverlays(null);
		else await commands.closeTargetSelectOverlays();

		const currentWindow = getCurrentWindow();

		currentWindow.setSize(
			new LogicalSize(WINDOW_SIZE.width, WINDOW_SIZE.height),
		);

		const unlistenFocus = currentWindow.onFocusChanged(
			({ payload: focused }) => {
				if (focused) {
					currentWindow.setSize(
						new LogicalSize(WINDOW_SIZE.width, WINDOW_SIZE.height),
					);
				}
			},
		);

		const unlistenResize = currentWindow.onResized(() => {
			currentWindow.setSize(
				new LogicalSize(WINDOW_SIZE.width, WINDOW_SIZE.height),
			);
		});

		commands.updateAuthPlan();

		onCleanup(async () => {
			(await unlistenFocus)?.();
			(await unlistenResize)?.();
		});
	});

	const cameras = useQuery(() => listVideoDevices);
	const mics = useQuery(() => listAudioDevices);

	const windowListSignature = createMemo(() =>
		createWindowSignature(windows.data),
	);
	const displayListSignature = createMemo(() =>
		createDisplaySignature(screens.data),
	);
	const [windowThumbnailsSignature, setWindowThumbnailsSignature] =
		createSignal<string | undefined>();
	const [displayThumbnailsSignature, setDisplayThumbnailsSignature] =
		createSignal<string | undefined>();

	createEffect(() => {
		if (windowTargets.status !== "success") return;
		const signature = createWindowSignature(windowTargets.data);
		if (signature !== undefined) setWindowThumbnailsSignature(signature);
	});

	createEffect(() => {
		if (displayTargets.status !== "success") return;
		const signature = createDisplaySignature(displayTargets.data);
		if (signature !== undefined) setDisplayThumbnailsSignature(signature);
	});

	createEffect(() => {
		if (page() !== "window") return;
		const signature = windowListSignature();
		if (signature === undefined) return;
		if (windowTargets.fetchStatus !== "idle") return;
		if (windowThumbnailsSignature() === signature) return;
		void windowTargets.refetch();
	});

	createEffect(() => {
		if (page() !== "display") return;
		const signature = displayListSignature();
		if (signature === undefined) return;
		if (displayTargets.fetchStatus !== "idle") return;
		if (displayThumbnailsSignature() === signature) return;
		void displayTargets.refetch();
	});

	cameras.promise.then((cameras) => {
		if (rawOptions.cameraID && findCamera(cameras, rawOptions.cameraID)) {
			setOptions("cameraLabel", null);
		}
	});

	mics.promise.then((mics) => {
		if (rawOptions.micName && !mics.includes(rawOptions.micName)) {
			setOptions("micName", null);
		}
	});

	const options = {
		screen: () => {
			let screen: CaptureDisplay | undefined;

			if (rawOptions.captureTarget.variant === "display") {
				const screenId = rawOptions.captureTarget.id;
				screen =
					screens.data?.find((s) => s.id === screenId) ?? screens.data?.[0];
			} else if (rawOptions.captureTarget.variant === "area") {
				const screenId = rawOptions.captureTarget.screen;
				screen =
					screens.data?.find((s) => s.id === screenId) ?? screens.data?.[0];
			}

			return screen;
		},
		window: () => {
			let win: CaptureWindow | undefined;

			if (rawOptions.captureTarget.variant === "window") {
				const windowId = rawOptions.captureTarget.id;
				win = windows.data?.find((s) => s.id === windowId) ?? windows.data?.[0];
			}

			return win;
		},
		camera: () => {
			if (!rawOptions.cameraID) return undefined;
			return findCamera(cameras.data || [], rawOptions.cameraID);
		},
		micName: () => mics.data?.find((name) => name === rawOptions.micName),
		target: (): ScreenCaptureTarget | undefined => {
			switch (rawOptions.captureTarget.variant) {
				case "display": {
					const screen = options.screen();
					if (!screen) return;
					return { variant: "display", id: screen.id };
				}
				case "window": {
					const window = options.window();
					if (!window) return;
					return { variant: "window", id: window.id };
				}
				case "area": {
					const screen = options.screen();
					if (!screen) return;
					return {
						variant: "area",
						bounds: rawOptions.captureTarget.bounds,
						screen: screen.id,
					};
				}
			}
		},
	};

	const toggleTargetMode = (mode: "display" | "window" | "area") => {
		if (isRecording()) return;
		const nextMode = rawOptions.targetMode === mode ? null : mode;
		setOptions("targetMode", nextMode);
		if (nextMode) commands.openTargetSelectOverlays(null);
		else commands.closeTargetSelectOverlays();
	};

	const openMenu = (
		menuPage: "display" | "window" | "recording" | "screenshot",
	) => {
		if (isRecording()) return;
		setPage(menuPage);
		setSearchQuery("");
		setSearchExpanded(false);
	};

	createEffect(() => {
		const target = options.target();
		if (!target) return;
		const screen = options.screen();
		if (!screen) return;

		if (target.variant === "window" && windows.data?.length === 0) {
			setOptions(
				"captureTarget",
				reconcile({ variant: "display", id: screen.id }),
			);
		}
	});

	const setMicInput = createMutation(() => ({
		mutationFn: async (name: string | null) => {
			await commands.setMicInput(name);
			setOptions("micName", name);
		},
	}));

	const setCamera = createCameraMutation();

	onMount(() => {
		if (rawOptions.micName) {
			setMicInput
				.mutateAsync(rawOptions.micName)
				.catch((error) => console.error("Failed to set mic input:", error));
		}

		if (rawOptions.cameraID && "ModelID" in rawOptions.cameraID)
			setCamera.mutate({ ModelID: rawOptions.cameraID.ModelID });
		else if (rawOptions.cameraID && "DeviceID" in rawOptions.cameraID)
			setCamera.mutate({ DeviceID: rawOptions.cameraID.DeviceID });
		else setCamera.mutate(null);
	});

	const license = createLicenseQuery();

	const signIn = createSignInMutation();

	const handleSearchKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			if (searchQuery()) {
				event.preventDefault();
				setSearchQuery("");
			} else {
				event.preventDefault();
				setSearchExpanded(false);
			}
		}
	};

	createEffect(() => {
		if (searchExpanded()) {
			searchInputRef?.focus();
		}
	});

	createEffect(() => {
		if (!searchExpanded() && !searchQuery()) {
			setSearchQuery("");
		}
	});

	const startSignInCleanup = listen("start-sign-in", async () => {
		const abort = new AbortController();
		for (const win of await getAllWebviewWindows()) {
			if (win.label.startsWith("target-select-overlay")) {
				await win.hide();
			}
		}

		await signIn.mutateAsync(abort).catch(() => {});

		for (const win of await getAllWebviewWindows()) {
			if (win.label.startsWith("target-select-overlay")) {
				await win.show();
			}
		}
	});
	onCleanup(() => startSignInCleanup.then((cb) => cb()));

	const isMenuPage = () => page() !== "home";

	return (
		<div class="apple-glass rounded-[20px] flex relative flex-col h-full min-h-0 text-(--text-primary) pl-3">
			<div
				data-tauri-drag-region
				class="h-12.5 w-full flex items-center justify-start relative"
			>
				<Transition
					mode="outin"
					enterActiveClass="transition-all duration-300 ease-out"
					enterClass="opacity-0 scale-95"
					enterToClass="opacity-100 scale-100"
					exitActiveClass="transition-all duration-300 ease-in"
					exitClass="opacity-100 scale-100"
					exitToClass="opacity-0 scale-95"
				>
					<Show
						when={isMenuPage()}
						fallback={
							<div
								class={cx(
									"flex items-center -mx-1 w-fit p-2 apple-glass rounded-full",
									ostype() === "macos" && "flex-row-reverse",
								)}
								data-tauri-drag-region
							>
								<div
									class="flex gap-3 items-center justify-start"
									data-tauri-drag-region
								>
									<Tooltip content={<span>Settings</span>}>
										<button
											type="button"
											onClick={async () => {
												await commands.showWindow({
													Settings: { page: "general" },
												});
												getCurrentWindow().hide();
											}}
											class="flex items-center justify-center size-5 -ml-[1.5px]"
										>
											<IconCapSettings class="transition-colors text-gray-11 size-4 hover:text-gray-12" />
										</button>
									</Tooltip>
									<Tooltip content={<span>Screenshots</span>}>
										<button
											type="button"
											onClick={() => openMenu("screenshot")}
											class="flex justify-center items-center size-5"
										>
											<IconLucideImage class="transition-colors text-gray-11 size-4 hover:text-gray-12" />
										</button>
									</Tooltip>
									<Tooltip content={<span>Recordings</span>}>
										<button
											type="button"
											onClick={() => openMenu("recording")}
											class="flex justify-center items-center size-5"
										>
											<IconLucideSquarePlay class="transition-colors text-gray-11 size-4 hover:text-gray-12" />
										</button>
									</Tooltip>
									<ChangelogButton />
									{import.meta.env.DEV && (
										<button
											type="button"
											onClick={() => {
												new WebviewWindow("debug", { url: "/debug" });
											}}
											class="flex justify-center items-center"
										>
											<IconLucideBug class="transition-colors text-gray-11 size-4 hover:text-gray-12" />
										</button>
									)}
								</div>
							</div>
						}
					>
						<div class="flex items-center gap-2 w-full" data-tauri-drag-region>
							<button
								type="button"
								onClick={() => {
									setPage("home");
									setSearchQuery("");
									setSearchExpanded(false);
								}}
								class="flex gap-1 items-center rounded-md px-2 py-1 text-xs text-gray-11 transition-opacity hover:opacity-70 hover:text-gray-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1"
							>
								<IconLucideArrowLeft class="size-3 text-gray-11" />
								<span class="font-medium text-gray-12">Back</span>
							</button>
							<div class="flex-1" />
							<Transition
								mode="outin"
								enterActiveClass="transition-all duration-300 ease-out"
								enterClass="opacity-0 scale-95"
								enterToClass="opacity-100 scale-100"
								exitActiveClass="transition-all duration-300 ease-in"
								exitClass="opacity-100 scale-100"
								exitToClass="opacity-0 scale-95"
							>
								<Show
									when={searchExpanded()}
									fallback={
										<button
											type="button"
											onClick={() => setSearchExpanded(true)}
											class="flex items-center justify-center size-8 rounded-md text-gray-11 transition-colors hover:text-gray-12 hover:bg-gray-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1"
										>
											<IconLucideSearch class="size-4" />
										</button>
									}
								>
									<div class="relative flex items-center min-w-[200px]">
										<IconLucideSearch class="absolute left-2 pointer-events-none size-3 text-gray-10" />
										<Input
											ref={searchInputRef}
											type="search"
											class="py-1.5 pl-7 pr-2 h-8 text-sm"
											value={searchQuery()}
											onInput={(event) =>
												setSearchQuery(event.currentTarget.value)
											}
											onKeyDown={handleSearchKeyDown}
											onBlur={() => {
												if (!searchQuery()) {
													setSearchExpanded(false);
												}
											}}
											placeholder={
												page() === "display"
													? "Search displays"
													: page() === "window"
														? "Search windows"
														: page() === "recording"
															? "Search recordings"
															: "Search screenshots"
											}
											autoCapitalize="off"
											autocorrect="off"
											autocomplete="off"
											spellcheck={false}
										/>
									</div>
								</Show>
							</Transition>
						</div>
					</Show>
				</Transition>
			</div>

			<Show when={!isMenuPage()}>
				<div class="flex items-center justify-between mt-4">
					<div class="flex items-center space-x-1">
						<a
							class="*:w-[92px] *:h-auto text-(--text-primary)"
							target="_blank"
							href={
								authData()
									? `${import.meta.env.VITE_SERVER_URL}/dashboard`
									: import.meta.env.VITE_SERVER_URL
							}
						>
							<IconCapLogoFullDark class="hidden dark:block" />
							<IconCapLogoFull class="block dark:hidden" />
						</a>
						<ErrorBoundary fallback={null}>
							<Suspense fallback={null}>
								<Show when={license.data}>
									{(licenseData) => (
										<span
											onClick={async () => {
												if (licenseData().type !== "pro") {
													await commands.showWindow("Upgrade");
												}
											}}
											class={cx(
												"text-[0.6rem] rounded-lg px-1 py-0.5",
												licenseData().type === "pro"
													? "bg-(--blue-400) text-gray-1 dark:text-gray-12"
													: "bg-gray-3 cursor-pointer hover:bg-gray-5",
											)}
										>
											{licenseData().type === "commercial"
												? "Commercial"
												: licenseData().type === "pro"
													? "Pro"
													: "Personal"}
										</span>
									)}
								</Show>
							</Suspense>
						</ErrorBoundary>
					</div>
					<Mode />
				</div>
			</Show>

			<div class="flex-1 min-h-0 w-full flex flex-col relative">
				<Show when={signIn.isPending}>
					<div class="flex absolute inset-0 justify-center items-center bg-gray-1 animate-in fade-in">
						<div class="flex flex-col gap-4 justify-center items-center">
							<span>Signing In...</span>
							<Button
								onClick={() => {
									signIn.variables?.abort();
									signIn.reset();
								}}
								variant="gray"
								class="w-full"
							>
								Cancel Sign In
							</Button>
						</div>
					</div>
				</Show>
				<Show when={!signIn.isPending}>
					<Transition
						mode="outin"
						enterActiveClass="transition-all duration-300 ease-out"
						enterClass="opacity-0 translate-x-4"
						enterToClass="opacity-100 translate-x-0"
						exitActiveClass="transition-all duration-300 ease-in"
						exitClass="opacity-100 translate-x-0"
						exitToClass="opacity-0 -translate-x-4"
					>
						<Show
							when={page() === "home"}
							fallback={
								<Show
									when={page() === "display"}
									fallback={
										<Show
											when={page() === "window"}
											fallback={
												<Show
													when={page() === "recording"}
													fallback={
														<TargetMenuPanel
															variant="screenshot"
															targets={screenshotsData()}
															isLoading={screenshots.isPending}
															errorMessage={
																screenshots.error
																	? "Failed to load screenshots"
																	: undefined
															}
															onSelect={async (screenshot) => {
																await commands.showWindow({
																	ScreenshotEditor: {
																		path: screenshot.path,
																	},
																});
															}}
															disabled={isRecording()}
															onBack={() => setPage("home")}
															searchQuery={searchQuery()}
															onSearchChange={setSearchQuery}
															onViewAll={async () => {
																await commands.showWindow({
																	Settings: { page: "screenshots" },
																});
																getCurrentWindow().hide();
															}}
														/>
													}
												>
													<TargetMenuPanel
														variant="recording"
														targets={recordingsData()}
														isLoading={recordings.isPending}
														errorMessage={
															recordings.error
																? "Failed to load recordings"
																: undefined
														}
														onSelect={async (recording) => {
															if (recording.mode === "studio") {
																let projectPath = recording.path;

																const needsRecovery =
																	recording.status.status === "InProgress" ||
																	recording.status.status === "NeedsRemux";

																if (needsRecovery) {
																	try {
																		projectPath =
																			await commands.recoverRecording(
																				projectPath,
																			);
																	} catch (e) {
																		console.error(
																			"Failed to recover recording:",
																			e,
																		);
																	}
																}

																await commands.showWindow({
																	Editor: { project_path: projectPath },
																});
															} else {
																if (recording.sharing?.link) {
																	await shell.open(recording.sharing.link);
																}
															}
															getCurrentWindow().hide();
														}}
														disabled={isRecording()}
														onBack={() => setPage("home")}
														searchQuery={searchQuery()}
														onSearchChange={setSearchQuery}
														onViewAll={async () => {
															await commands.showWindow({
																Settings: { page: "recordings" },
															});
															getCurrentWindow().hide();
														}}
														uploadProgress={uploadProgress}
														reuploadingPaths={reuploadingPaths()}
														onReupload={handleReupload}
														onRefetch={() => recordings.refetch()}
													/>
												</Show>
											}
										>
											<TargetMenuPanel
												variant="window"
												targets={windowTargetsData()}
												isLoading={windowMenuLoading()}
												errorMessage={windowErrorMessage()}
												onSelect={selectWindowTarget}
												disabled={isRecording()}
												onBack={() => setPage("home")}
												searchQuery={searchQuery()}
												onSearchChange={setSearchQuery}
											/>
										</Show>
									}
								>
									<TargetMenuPanel
										variant="display"
										targets={displayTargetsData()}
										isLoading={displayMenuLoading()}
										errorMessage={displayErrorMessage()}
										onSelect={selectDisplayTarget}
										disabled={isRecording()}
										onBack={() => setPage("home")}
										searchQuery={searchQuery()}
										onSearchChange={setSearchQuery}
									/>
								</Show>
							}
						>
							<div class="flex flex-col gap-2 w-full">
								<div class="flex flex-row gap-2 items-stretch w-full text-xs text-gray-11">
									<div
										class={cx(
											"apple-glass flex flex-1 overflow-hidden rounded-xl bg-gray-3/25 ring-1 ring-transparent transition focus-within:ring-blue-9 focus-within:ring-offset-2 focus-within:ring-offset-gray-1",
											rawOptions.targetMode === "display" && "ring-blue-9",
										)}
									>
										<button
											type="button"
											onClick={() => toggleTargetMode("display")}
											class={cx(
												"apple-glass flex flex-1 flex-col items-center justify-end gap-2 rounded-none py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1",
												rawOptions.targetMode === "display"
													? "text-gray-12"
													: "text-gray-12 hover:bg-gray-4",
												isRecording() && "pointer-events-none opacity-60",
											)}
										>
											<IconCapScreen class="size-6 transition-colors" />
											<p class="text-xs">Display</p>
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												openMenu("display");
											}}
											disabled={isRecording()}
											class={cx(
												"flex h-full w-5 shrink-0 items-center justify-center bg-gray-4/10 text-gray-12 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 hover:bg-gray-5",
												isRecording() && "pointer-events-none opacity-60",
											)}
										>
											<IconLucideSearch class="size-3 text-gray-11" />
										</button>
									</div>
									<div
										class={cx(
											"apple-glass flex flex-1 overflow-hidden rounded-xl bg-gray-3/25 ring-1 ring-transparent transition focus-within:ring-blue-9 focus-within:ring-offset-2 focus-within:ring-offset-gray-1",
											rawOptions.targetMode === "window" && "ring-blue-9",
										)}
									>
										<button
											type="button"
											onClick={() => toggleTargetMode("window")}
											class={cx(
												"apple-glass flex flex-1 flex-col items-center justify-end gap-2 rounded-none py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1",
												rawOptions.targetMode === "window"
													? "text-gray-12"
													: "text-gray-12 hover:bg-gray-4",
												isRecording() && "pointer-events-none opacity-60",
											)}
										>
											<IconLucideAppWindowMac class="size-6 transition-colors" />
											<p class="text-xs">Window</p>
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												openMenu("window");
											}}
											disabled={isRecording()}
											class={cx(
												"flex h-full w-5 shrink-0 items-center justify-center bg-gray-4/10 text-gray-12 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 hover:bg-gray-5",
												isRecording() && "pointer-events-none opacity-60",
											)}
										>
											<IconLucideSearch class="size-3 text-gray-11" />
										</button>
									</div>
									<button
										type="button"
										onClick={() => toggleTargetMode("area")}
										class={cx(
											"apple-glass flex flex-1 flex-col items-center justify-end gap-2 rounded-xl bg-gray-3/25 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-9 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1",
											rawOptions.targetMode === "area"
												? "text-gray-12 ring-1 ring-blue-9"
												: "text-gray-12 hover:bg-gray-4",
											isRecording() && "pointer-events-none opacity-60",
										)}
									>
										<IconCapCrop class="size-6 transition-colors" />
										<p class="text-xs">Area</p>
									</button>
								</div>
								<div class="space-y-2">
									<div class="flex flex-col gap-2 px-3 py-2 apple-glass rounded-xl">
										<CameraSelectBase
											class="inline-flex items-center justify-center h-full apple-vibrancy-fill w-full"
											iconClass="apple-vibrancy-fill"
											disabled={cameras.isPending}
											options={cameras.data ?? []}
											value={options.camera() ?? null}
											onChange={(c) => {
												if (!c) setCamera.mutate(null);
												else if (c.model_id)
													setCamera.mutate({ ModelID: c.model_id });
												else setCamera.mutate({ DeviceID: c.device_id });
											}}
										/>
										<div class="apple-vibrancy-tertiary-fill border-t w-full" />
										<MicrophoneSelectBase
											class="relative inline-flex items-center justify-center h-full apple-vibrancy-fill w-full"
											iconClass="apple-vibrancy-fill"
											levelIndicatorClass="bg-white/40 h-1 rounded-full"
											disabled={mics.isPending}
											options={mics.isPending ? [] : (mics.data ?? [])}
											value={
												mics.isPending
													? rawOptions.micName
													: (options.micName() ?? null)
											}
											onChange={(v) => setMicInput.mutate(v)}
										/>
									</div>
									<SystemAudio />
								</div>
							</div>
						</Show>
					</Transition>
				</Show>
			</div>
			<RecoveryToast />
		</div>
	);
}
