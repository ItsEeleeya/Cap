import { Button } from "@cap/ui-solid";
import { createTimeoutLoop } from "@solid-primitives/timer";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { cx } from "cva";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import {
	isPermissionGranted as isPermitted,
	requestAndVerifyPermission,
} from "~/utils/os-permissions";
import {
	commands,
	type OSPermission,
	type OSPermissionStatus,
} from "~/utils/tauri";

type SetupPermission = {
	name: string;
	key: OSPermission;
	description: string;
	requiresManualGrant: boolean;
	optional?: boolean;
};

const setupPermissions: readonly SetupPermission[] = [
	{
		name: "Screen Recording",
		key: "screenRecording",
		description:
			"Click Grant to allow when macOS asks, or pick Cap in System Settings if needed. Restart the app after allowing screen recording.",
		requiresManualGrant: false,
	},
	{
		name: "Accessibility",
		key: "accessibility",
		description:
			"During recording, Cap collects mouse activity locally to generate automatic zoom in segments.",
		requiresManualGrant: false,
	},
	{
		name: "Microphone",
		key: "microphone",
		description: "This permission is required to record audio in your Caps.",
		requiresManualGrant: false,
		optional: true,
	},
	{
		name: "Camera",
		key: "camera",
		description:
			"This permission is required to record your camera in your Caps.",
		requiresManualGrant: false,
		optional: true,
	},
];

export function PermissionsStep(props: {
	active: boolean;
	onPermissionsChanged: (allRequired: boolean) => void;
	onCorePermissionsChanged: (granted: boolean) => void;
}) {
	const [visible, setVisible] = createSignal(false);
	const [initialCheck, setInitialCheck] = createSignal(true);
	const [check, setCheck] = createSignal<
		Record<string, OSPermissionStatus> | undefined
	>(undefined);

	const fetchPermissions = async () => {
		const result = await commands.doPermissionsCheck(initialCheck());
		setCheck(result as unknown as Record<string, OSPermissionStatus>);
	};

	onMount(() => {
		fetchPermissions();
	});

	createEffect(() => {
		if (props.active) {
			setVisible(false);
			const t = setTimeout(() => setVisible(true), 100);
			onCleanup(() => clearTimeout(t));
			createTimeoutLoop;
		} else {
			setVisible(false);
		}
	});

	createEffect(() => {
		if (props.active && !initialCheck()) {
			const interval = setInterval(fetchPermissions, 250);
			onCleanup(() => clearInterval(interval));
		}
	});

	createEffect(() => {
		const c = check();
		if (!c) return;
		const allRequired = setupPermissions
			.filter((p) => !p.optional)
			.every((p) => isPermitted(c[p.key]));
		props.onPermissionsChanged(allRequired);
		props.onCorePermissionsChanged(
			isPermitted(c.screenRecording) && isPermitted(c.accessibility),
		);
	});

	const maybePromptRestartForPermission = async (permission: OSPermission) => {
		const message =
			permission === "accessibility"
				? "After enabling Accessibility for Cap in System Settings, macOS may keep showing it as denied until you restart the app."
				: "After adding Cap in System Settings, you'll need to restart the app for the permission to take effect.";
		const shouldRestart = await ask(message, {
			title: "Restart Required",
			kind: "info",
			okLabel: "Restart, I've granted permission",
			cancelLabel: "No, I still need to add it",
		});
		if (shouldRestart) {
			await relaunch();
		}
	};

	const [requestingPermission, setRequestingPermission] = createSignal(false);

	const requestPermission = async (permission: OSPermission) => {
		if (requestingPermission()) return;
		setRequestingPermission(true);
		try {
			const status = check()?.[permission] as OSPermissionStatus | undefined;
			setInitialCheck(false);
			const result = await requestAndVerifyPermission(
				commands,
				permission,
				status,
			);
			setCheck(result.check as unknown as Record<string, OSPermissionStatus>);
			if (
				result.openedSettings &&
				(permission === "screenRecording" || permission === "accessibility")
			) {
				await maybePromptRestartForPermission(permission);
			}
		} catch (err) {
			console.error(`Error requesting permission: ${err}`);
			fetchPermissions().catch(() => {});
		} finally {
			setRequestingPermission(false);
		}
	};

	const openSettings = async (permission: OSPermission) => {
		if (requestingPermission()) return;
		setRequestingPermission(true);
		try {
			await commands.openPermissionSettings(permission);
			if (permission === "screenRecording" || permission === "accessibility") {
				await maybePromptRestartForPermission(permission);
			}
			setInitialCheck(false);
			fetchPermissions();
		} catch (err) {
			console.error(`Error opening permission settings: ${err}`);
		} finally {
			setRequestingPermission(false);
		}
	};

	return (
		<div class="flex flex-col items-center justify-center min-h-full px-12 gap-6">
			<div
				class={cx(
					"flex flex-col items-center gap-3 text-center max-w-[440px] transition-all duration-500",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<div class="flex items-center justify-center size-12 rounded-2xl bg-white dark:bg-gray-3 border border-gray-4">
					<IconLucideShield class="size-5 text-gray-11" />
				</div>
				<h2 class="text-2xl font-bold text-gray-12 tracking-tight">
					Permissions Required
				</h2>
				<p class="text-[14px] text-gray-10 leading-relaxed">
					Cap needs a few permissions to record your screen and capture audio.
				</p>
			</div>

			<div
				class={cx(
					"w-full max-w-[440px] flex flex-col gap-2 transition-all duration-500 delay-100",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<For each={setupPermissions}>
					{(permission, index) => {
						const permStatus = () =>
							check()?.[permission.key] as OSPermissionStatus | undefined;

						return (
							<Show when={permStatus() !== "notNeeded"}>
								<div
									class="flex items-center gap-4 px-4 py-3 rounded-xl border border-gray-4 bg-white dark:bg-gray-2 transition-all duration-500 shadow-xs"
									style={{
										"transition-delay": `${150 + index() * 80}ms`,
										opacity: visible() ? 1 : 0,
										transform: visible() ? "translateY(0)" : "translateY(8px)",
									}}
								>
									<div class="flex flex-col flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-[13px] font-medium text-gray-12">
												{permission.name}
											</span>
											<Show when={permission.optional}>
												<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-2 dark:bg-gray-4 text-gray-9">
													Optional
												</span>
											</Show>
										</div>
										<span class="text-[11px] text-gray-10 leading-snug mt-0.5">
											{permission.description}
										</span>
									</div>
									<Show
										when={!isPermitted(permStatus())}
										fallback={
											<div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-3 border border-green-5 text-green-11 text-[12px] font-medium shrink-0">
												<IconLucideCheck class="size-3" />
												Granted
											</div>
										}
									>
										<Button
											size="sm"
											variant="gray"
											class="shrink-0"
											disabled={requestingPermission()}
											onClick={() =>
												permission.requiresManualGrant ||
												permStatus() === "denied"
													? openSettings(permission.key)
													: requestPermission(permission.key)
											}
										>
											{permission.requiresManualGrant ||
											permStatus() === "denied"
												? "Open Settings"
												: "Grant"}
										</Button>
									</Show>
								</div>
							</Show>
						);
					}}
				</For>
			</div>
		</div>
	);
}
