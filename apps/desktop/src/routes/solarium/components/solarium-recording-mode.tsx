import { createSignal } from "solid-js";

import Tooltip from "~/components/Tooltip";
import { useRecordingOptions } from "~/routes/(window-chrome)/OptionsContext";
import { commands } from "~/utils/tauri";
import { SolariumTab, SolariumTabs } from "./SolariumTabs";

interface ModeProps {
	onInfoClick?: () => void;
}

export default function Mode(_props: ModeProps) {
	const { rawOptions, setOptions } = useRecordingOptions();

	const handleValueChange = (value: string) => {
		if (value === "instant" || value === "studio" || value === "screenshot") {
			setOptions({ mode: value });
		}
	};

	return (
		<div class="flex flex-row-reverse gap-1.5">
			<button
				type="button"
				class="apple-glass-subdued rounded-full h-8 aspect-square inline-flex items-center justify-center"
			>
				<IconCapInfo class="apple-vibrancy-fill invert transition-opacity duration-200 p-1 dark:invert-0 group-hover:opacity-50" />
			</button>
			<div class="apple-glass-subdued p-0.5 rounded-full text-xs w-full h-8 flex">
				<SolariumTabs
					onSnap={() => commands.performHapticFeedback("alignment", "now")}
					value={rawOptions.mode}
					onValueChange={handleValueChange}
					class="w-full"
				>
					<SolariumTab
						value="studio"
						class="flex-1 flex justify-center items-center"
					>
						<IconCapFilmCut class="size-3.5 invert dark:invert-0" />
					</SolariumTab>
					<SolariumTab
						value="instant"
						class="flex-1 flex justify-center items-center"
					>
						<IconCapInstant class="invert size-4 dark:invert-0" />
					</SolariumTab>
					<SolariumTab
						value="screenshot"
						class="flex-1 flex justify-center items-center"
					>
						<IconCapScreenshot class="size-3.5 invert dark:invert-0" />
					</SolariumTab>
				</SolariumTabs>
			</div>
		</div>
	);
}

const _Mode = (props: ModeProps) => {
	const { rawOptions, setOptions } = useRecordingOptions();
	const [isInfoHovered, setIsInfoHovered] = createSignal(false);

	const handleInfoClick = () => {
		if (props.onInfoClick) {
			props.onInfoClick();
		} else {
			commands.showWindow("ModeSelect");
		}
	};

	return (
		<div class="relative">
			<div
				class="absolute z-50 -left-1.5 -top-2 p-1 rounded-full w-fit bg-gray-5 group"
				onClick={handleInfoClick}
				onMouseEnter={() => setIsInfoHovered(true)}
				onMouseLeave={() => setIsInfoHovered(false)}
			>
				<IconCapInfo class="invert transition-opacity duration-200 size-2.5 dark:invert-0 group-hover:opacity-50" />
			</div>
			<div class="flex gap-2 relative justify-end items-center p-1.5 rounded-full w-fit apple-glass">
				{!isInfoHovered() && (
					<Tooltip
						placement="top"
						content="Instant mode"
						openDelay={0}
						closeDelay={0}
					>
						<div
							onClick={() => {
								setOptions({ mode: "instant" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "instant"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-7 hover:bg-gray-7 ring-blue-500"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapInstant class="invert size-4 dark:invert-0" />
						</div>
					</Tooltip>
				)}

				{!isInfoHovered() && (
					<Tooltip
						placement="top"
						content="Studio mode"
						openDelay={0}
						closeDelay={0}
					>
						<div
							onClick={() => {
								setOptions({ mode: "studio" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "studio"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-7 hover:bg-gray-7 ring-blue-500"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapFilmCut class="size-3.5 invert dark:invert-0" />
						</div>
					</Tooltip>
				)}

				{!isInfoHovered() && (
					<Tooltip
						placement="top"
						content="Screenshot mode"
						openDelay={0}
						closeDelay={0}
					>
						<div
							onClick={() => {
								setOptions({ mode: "screenshot" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "screenshot"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-7 hover:bg-gray-7 ring-blue-500"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapScreenshot class="size-3.5 invert dark:invert-0" />
						</div>
					</Tooltip>
				)}

				{isInfoHovered() && (
					<>
						<div
							onClick={() => {
								setOptions({ mode: "instant" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "instant"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-5 hover:bg-gray-7 ring-blue-500"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapInstant class="invert size-4 dark:invert-0" />
						</div>

						<div
							onClick={() => {
								setOptions({ mode: "studio" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "studio"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-5 hover:bg-gray-7 ring-blue-10"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapFilmCut class="size-3.5 invert dark:invert-0" />
						</div>

						<div
							onClick={() => {
								setOptions({ mode: "screenshot" });
							}}
							class={`flex justify-center items-center transition-all duration-200 rounded-full size-7 hover:${
								rawOptions.mode === "screenshot"
									? "ring-2 ring-offset-1 ring-offset-gray-1 bg-gray-5 hover:bg-gray-7 ring-blue-10"
									: "bg-gray-3 hover:bg-gray-7"
							}`}
						>
							<IconCapScreenshot class="size-3.5 invert dark:invert-0" />
						</div>
					</>
				)}
			</div>
		</div>
	);
};

// export default Mode;
