import { createQuery } from "@tanstack/solid-query";
import type { Component, ComponentProps, JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { APPLE_SUPPORTS_HOSTED_MATERIALS } from "~/components/Material";
import {
	createCurrentRecordingQuery,
	isSystemAudioSupported,
} from "~/utils/queries";
import { useRecordingOptions } from "../OptionsContext";
import InfoPill from "./InfoPill";

export default function SystemAudio() {
	return (
		<SystemAudioToggleRoot
			class={
				APPLE_SUPPORTS_HOSTED_MATERIALS
					? "backdrop-opacity-25 hover:bg-gray-2/40 flex flex-row gap-2 items-center px-2 w-full h-10 rounded-full transition-colors cursor-default disabled:opacity-70 disabled:text-gray-11 KSelect"
					: "flex flex-row gap-2 items-center px-2 w-full h-10 rounded-lg transition-colors cursor-default disabled:opacity-70 bg-gray-3 disabled:text-gray-11 KSelect"
			}
			PillComponent={InfoPill}
			icon={
				<IconPhMonitorBold class="text-gray-10 size-4 apple-vibrancy-fill" />
			}
		/>
	);
}

export function SystemAudioToggleRoot(
	props: Omit<
		ComponentProps<"button">,
		"onClick" | "disabled" | "title" | "type" | "children"
	> & {
		PillComponent: Component<{
			variant: "blue" | "red";
			children: JSX.Element;
		}>;
		icon: JSX.Element;
	},
) {
	const { rawOptions, setOptions } = useRecordingOptions();
	const currentRecording = createCurrentRecordingQuery();
	const systemAudioSupported = createQuery(() => isSystemAudioSupported);

	const isDisabled = () =>
		!!currentRecording.data || systemAudioSupported.data === false;
	const tooltipMessage = () => {
		if (systemAudioSupported.data === false) {
			return "System audio capture requires macOS 13.0 or later";
		}
		return undefined;
	};

	return (
		<button
			{...props}
			type="button"
			title={tooltipMessage()}
			onClick={() => {
				if (!rawOptions || isDisabled()) return;
				setOptions({ captureSystemAudio: !rawOptions.captureSystemAudio });
			}}
			disabled={isDisabled()}
		>
			{props.icon}
			<p
				class={`flex-1 text-sm text-left truncate ${APPLE_SUPPORTS_HOSTED_MATERIALS ? "apple-vibrancy-fill" : ""}`}
			>
				{rawOptions.captureSystemAudio
					? "Record System Audio"
					: "No System Audio"}
			</p>
			<Dynamic
				component={props.PillComponent}
				variant={rawOptions.captureSystemAudio ? "blue" : "red"}
			>
				{rawOptions.captureSystemAudio ? "On" : "Off"}
			</Dynamic>
		</button>
	);
}
