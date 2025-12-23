import { useQuery } from "@tanstack/solid-query";
import { CheckMenuItem, Menu, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { cx } from "cva";
import { createEffect, createSignal, For, Show } from "solid-js";
import { trackEvent } from "~/utils/analytics";
import { createTauriEventListener } from "~/utils/createEventListener";
import { createCurrentRecordingQuery, getPermissions } from "~/utils/queries";
import { type CameraInfo, events } from "~/utils/tauri";
import useRequestPermission from "../(window-chrome)/new-main/useRequestPermission";

const NO_CAMERA = "No Camera";

export function CameraSelectBase(props: {
	disabled?: boolean;
	options: CameraInfo[];
	value: CameraInfo | null;
	onChange: (camera: CameraInfo | null) => void;
	class: string;
	iconClass: string;
}) {
	const currentRecording = createCurrentRecordingQuery();
	const permissions = useQuery(() => getPermissions);
	const requestPermission = useRequestPermission();

	const permissionGranted = () =>
		permissions?.data?.camera === "granted" ||
		permissions?.data?.camera === "notNeeded";

	const onChange = (cameraLabel: CameraInfo | null) => {
		if (!cameraLabel && !permissionGranted())
			return requestPermission("camera");

		props.onChange(cameraLabel);

		trackEvent("camera_selected", {
			camera_name: cameraLabel?.display_name ?? null,
			enabled: !!cameraLabel,
		});
	};

	return (
		<div class="inline-flex items-center justify-stretch">
			<IconCapCamera class={props.iconClass} />
			<div class="flex flex-col gap-1 items-stretch text-(--text-primary)">
				<select
					class={`flex-1 text-sm text-left truncate outline-none ${props.class}`}
					disabled={!!currentRecording.data || props.disabled}
					value={props.value?.device_id ?? "none"}
					onChange={(e) => {
						if (!permissionGranted()) {
							requestPermission("camera");
							return;
						}
						onChange(
							e.target.value === "none"
								? null
								: props.options.find((c) => c.device_id === e.target.value) ||
										null,
						);
					}}
				>
					<option value="none">{NO_CAMERA}</option>
					<For each={props.options}>
						{(option) => (
							<option value={option.device_id}>{option.display_name}</option>
						)}
					</For>
				</select>
			</div>
		</div>
	);
}

const NO_MICROPHONE = "No Microphone";

export function MicrophoneSelectBase(props: {
	disabled?: boolean;
	options: string[];
	value: string | null;
	onChange: (micName: string | null) => void;
	class: string;
	levelIndicatorClass: string;
	iconClass: string;
}) {
	const DB_SCALE = 40;

	const permissions = useQuery(() => getPermissions);
	const currentRecording = createCurrentRecordingQuery();

	const [dbs, setDbs] = createSignal<number | undefined>();
	const [isInitialized, setIsInitialized] = createSignal(false);

	const requestPermission = useRequestPermission();

	const permissionGranted = () =>
		permissions?.data?.microphone === "granted" ||
		permissions?.data?.microphone === "notNeeded";

	type Option = { name: string };

	const handleMicrophoneChange = async (item: Option | null) => {
		if (!props.options) return;
		props.onChange(item ? item.name : null);
		if (!item) setDbs();

		trackEvent("microphone_selected", {
			microphone_name: item?.name ?? null,
			enabled: !!item,
		});
	};

	createTauriEventListener(events.audioInputLevelChange, (dbs) => {
		if (!props.value) setDbs();
		else setDbs(dbs);
	});

	// visual audio level from 0 -> 1
	const audioLevel = () =>
		(1 - Math.max((dbs() ?? 0) + DB_SCALE, 0) / DB_SCALE) ** 0.5;

	createEffect(() => {
		if (!props.value || !permissionGranted() || isInitialized()) return;

		setIsInitialized(true);
		void handleMicrophoneChange({ name: props.value });
	});

	return (
		<div class="inline-flex items-center justify-stretch">
			<IconCapMicrophone class={props.iconClass} />
			<div class="flex flex-col gap-1 items-stretch text-(--text-primary)">
				<select
					class={`flex-1 text-sm text-left truncate outline-none ${props.class}`}
					disabled={!!currentRecording.data || props.disabled}
					value={props.value ?? "none"}
					onClick={() => {
						if (!permissionGranted()) {
							requestPermission("microphone");
							return;
						}
					}}
					onChange={(e) => {
						if (!permissionGranted()) {
							requestPermission("microphone");
							return;
						}
						handleMicrophoneChange(
							e.target.value === "none" ? null : { name: e.target.value },
						);
					}}
				>
					<option value="none">{NO_MICROPHONE}</option>
					<For each={props.options}>
						{(option) => <option value={option}>{option}</option>}
					</For>
					<Show when={props.value !== null && dbs()}>
						{(_) => {
							return (
								<div
									class={cx(
										"left-0 inset-y-0 absolute transition-[right] ease-in-out duration-100",
										props.levelIndicatorClass,
									)}
									style={{ right: `${audioLevel() * 100}%` }}
								>
									Hello
								</div>
							);
						}}
					</Show>
				</select>
			</div>
		</div>
	);
}
