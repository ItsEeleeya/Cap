import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./solarium.css";
import { createElementSize } from "@solid-primitives/resize-observer";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { children, createEffect, type ParentProps, untrack } from "solid-js";
import {
	createCameraMutation,
	createCurrentRecordingQuery,
	listAudioDevices,
	listVideoDevices,
} from "~/utils/queries";
import {
	commands,
	type RecordingMode,
	type RecordingTargetMode,
} from "~/utils/tauri";
import SystemAudio from "../(window-chrome)/new-main/SystemAudio";
import {
	RecordingOptionsProvider,
	useRecordingOptions,
} from "../(window-chrome)/OptionsContext";
import {
	CameraSelect,
	CameraSelectBase,
	MicrophoneSelect,
	MicrophoneSelectBase,
} from "./input-selectors";

const webview = getCurrentWebviewWindow();

export default function SolariumRecordingControls() {
	let mainRef: HTMLDivElement | undefined;
	const size = createElementSize(() => mainRef);
	createEffect(() => {
		if (!size.width || !size.height) return;
		webview.setSize(new LogicalSize(size.width, size.height));
	});

	return (
		<RecordingOptionsProvider>
			<div data-tauri-drag-region class="size-fit" ref={mainRef}>
				<Inner />
			</div>
		</RecordingOptionsProvider>
	);
}

function Inner() {
	return (
		<div
			data-tauri-drag-region
			class="flex items-center justify-center gap-2 h-15 m-10 mb-18 size-fit"
		>
			<div
				class="recording-controls gap apple-glass size-11 aspect-square rounded-full inline-flex items-center justify-center hover:bg-blue-4/30"
				onClick={() => webview.close()}
			>
				<IconCapX class="apple-vibrancy-fill size-3 pointer-events-none" />
			</div>
			<div class="relative size-fit">
				<div
					data-tauri-drag-region
					class="absolute rounded-full w-fit z-50 apple-glass p-1 -ml-2.5 -mt-0.5"
					onClick={() => commands.showWindow("ModeSelect")}
				>
					<IconCapInfo class="invert transition-opacity duration-200 cursor-pointer size-3 dark:invert-0 group-hover:opacity-50 apple-vibrancy-fill" />
				</div>

				<div
					data-tauri-drag-region
					class="recording-controls gap apple-glass h-14 rounded-full inline-flex items-center justify-center"
				>
					<Mode />
				</div>
			</div>
			<div
				data-tauri-drag-region
				class="recording-controls gap apple-glass h-14 rounded-full inline-flex items-center justify-center"
			>
				<TargetSelectMode />
			</div>
			<div
				data-tauri-drag-region
				class="recording-controls gap apple-glass h-14 rounded-full inline-flex items-center justify-center"
			>
				<RecordingInputs />
			</div>
		</div>
	);
}

function Mode() {
	const { rawOptions, setOptions } = useRecordingOptions();

	function ModeButton(props: ParentProps<{ forMode: RecordingMode }>) {
		const resolved = children(() => props.children);
		const mode = untrack(() => props.forMode);
		return (
			<button
				type="button"
				title={
					mode === "instant"
						? "Instant"
						: mode === "studio"
							? "Studio"
							: "Screenshot"
				}
				onClick={() => setOptions({ mode })}
				class="flex justify-center items-center transition-colors duration-200 ease-in-out rounded-full aspect-square h-full"
				classList={{
					"bg-blue-10/10 border-2 border-blue-10": rawOptions.mode === mode,
					"hover:bg-blue-10/10": rawOptions.mode !== mode,
				}}
			>
				{resolved()}
			</button>
		);
	}

	return (
		<div
			data-tauri-drag-region
			class="flex gap-1 relative justify-end items-center p-1.5 rounded-full w-fit h-full"
		>
			<ModeButton forMode="instant">
				<IconCapInstant class="invert size-4 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</ModeButton>
			<ModeButton forMode="studio">
				<IconCapFilmCut class="invert size-4 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</ModeButton>
			<ModeButton forMode="screenshot">
				<IconCapScreenshot class="invert size-4 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</ModeButton>
		</div>
	);
}

function TargetSelectMode() {
	const { rawOptions, setOptions } = useRecordingOptions();
	const currentRecording = createCurrentRecordingQuery();
	const isRecording = () => !!currentRecording.data;

	const toggleTargetMode = (mode: "display" | "window" | "area") => {
		if (isRecording()) return;
		const nextMode = rawOptions.targetMode === mode ? null : mode;
		setOptions("targetMode", nextMode);
		if (nextMode) commands.openTargetSelectOverlays(null);
		else commands.closeTargetSelectOverlays();
	};

	function TargetButton(
		props: ParentProps<{ forTarget: RecordingTargetMode }>,
	) {
		const resolved = children(() => props.children);
		const mode = untrack(() => props.forTarget);
		return (
			<button
				type="button"
				title={
					mode === "display" ? "Display" : mode === "window" ? "Window" : "Area"
				}
				onClick={() => toggleTargetMode(mode)}
				class="flex justify-center items-center transition-colors duration-200 ease-in-out rounded-full aspect-square h-full"
				classList={{
					"bg-blue-10/10 border-2 border-blue-10":
						rawOptions.targetMode === mode,
					"hover:bg-blue-10/10": rawOptions.targetMode !== mode,
				}}
			>
				{resolved()}
			</button>
		);
	}

	return (
		<div
			data-tauri-drag-region
			class="flex gap-1 relative justify-end items-center p-1.5 rounded-full w-fit h-full"
		>
			<TargetButton forTarget="display">
				<IconCapScreen class="invert size-5.5 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</TargetButton>
			<TargetButton forTarget="window">
				<IconLucideAppWindowMac class="invert size-5 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</TargetButton>
			<TargetButton forTarget="area">
				<IconCapCrop class="invert size-5 dark:invert-0 pointer-events-none apple-vibrancy-fill" />
			</TargetButton>
		</div>
	);
}

function RecordingInputs() {
	const { rawOptions, setOptions } = useRecordingOptions();
	const currentRecording = createCurrentRecordingQuery();
	const isRecording = () => !!currentRecording.data;

	const cameras = useQuery(() => listVideoDevices);
	const mics = useQuery(() => listAudioDevices);

	const options = {
		camera: () => {
			if (!rawOptions.cameraID) return undefined;
			const id = rawOptions.cameraID;
			return cameras.data.find((c) => {
				if (!c) return false;
				return "DeviceID" in id
					? id.DeviceID === c.device_id
					: id.ModelID === c.model_id;
			});
		},
		micName: () => mics.data?.find((name) => name === rawOptions.micName),
	};

	const setCamera = createCameraMutation();
	const setMicInput = useMutation(() => ({
		mutationFn: async (name: string | null) => {
			await commands.setMicInput(name);
			setOptions("micName", name);
		},
	}));

	return (
		<div class="inline-flex gap-2 px-3">
			<CameraSelectBase
				class="inline-flex items-center justify-center h-full gap-1.5 apple-vibrancy-fill w-32"
				iconClass="apple-vibrancy-fill"
				disabled={cameras.isPending}
				options={cameras.data ?? []}
				value={options.camera() ?? null}
				onChange={(c) => {
					if (!c) setCamera.mutate(null);
					else if (c.model_id) setCamera.mutate({ ModelID: c.model_id });
					else setCamera.mutate({ DeviceID: c.device_id });
				}}
			/>
			<div class="apple-vibrancy-tertiary-fill border-l h-8" />
			{/*<MicrophoneSelectBase
				class="relative inline-flex items-center justify-center h-full gap-1.5 apple-vibrancy-fill w-32"
				iconClass="apple-vibrancy-fill"
				levelIndicatorClass="bg-white/50 h-1 top-auto bottom-0 rounded-full -m-1.5"
				disabled={mics.isPending}
				options={mics.isPending ? [] : (mics.data ?? [])}
				value={
					mics.isPending ? rawOptions.micName : (options.micName() ?? null)
				}
				onChange={(v) => setMicInput.mutate(v)}
			/>*/}
		</div>
	);
}
