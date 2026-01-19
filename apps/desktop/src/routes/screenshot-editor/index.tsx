import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { type as ostype } from "@tauri-apps/plugin-os";
import { cx } from "cva";
import { createEffect, onMount } from "solid-js";
import { generalSettingsStore } from "~/store";
import { commands } from "~/utils/tauri";
import { ScreenshotEditorProvider } from "./context";
import { Editor } from "./Editor";

export default function ScreenshotEditorRoute() {
	const generalSettings = generalSettingsStore.createQuery();

	onMount(() => commands.addToolbarShell());

	createEffect(() => {
		const transparent = generalSettings.data?.windowTransparency ?? false;
		commands.setWindowTransparent(transparent);
		getCurrentWindow().setEffects({
			effects: transparent ? [Effect.HudWindow] : [],
		});
	});

	return (
		<div
			class={cx(
				"flex flex-col w-screen h-screen bg-transparent",
				!(
					ostype() === "windows" || !generalSettings.data?.windowTransparency
				) && "bg-transparent-window",
			)}
		>
			<ScreenshotEditorProvider>
				<Editor />
			</ScreenshotEditorProvider>
		</div>
	);
}
