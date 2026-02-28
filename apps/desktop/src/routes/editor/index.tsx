import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { type as ostype } from "@tauri-apps/plugin-os";
import { cx } from "cva";
import "../solarium/solarium.css";
import { createEffect, Suspense } from "solid-js";
import { generalSettingsStore } from "~/store";
import { commands } from "~/utils/tauri";
import { Editor } from "./Editor";
import { EditorSkeleton } from "./editor-skeleton";

export default function () {
	const generalSettings = generalSettingsStore.createQuery();

	createEffect(() => {
		const transparent = generalSettings.data?.windowTransparency ?? false;
		commands.setWindowTransparent(transparent);
		getCurrentWindow().setEffects({
			// effects: transparent ? [Effect.HudWindow] : [],
			effects: [Effect.HudWindow]
		});
	});

	commands.addToolbarShell();

	return (
		<div
			class={cx(
				"flex flex-col w-screen h-screen bg-transparent",
				// !(
				// ostype() === "windows" || !generalSettings.data?.windowTransparency
				// ) && "bg-transparent-window",
			)}
		>
			<Suspense fallback={<EditorSkeleton />}>
				<Editor />
			</Suspense>
		</div>
	);
}
