import { createQuery } from "@tanstack/solid-query";
import type { WebviewOptions } from "@tauri-apps/api/webview";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
	Effect,
	EffectState,
	type WindowOptions,
} from "@tauri-apps/api/window";
import { createUniqueId, For } from "solid-js";
import { commands } from "~/utils/tauri";

export default function Debug() {
	const fails = createQuery(() => ({
		queryKey: ["fails"],
		queryFn: () => commands.listFails(),
	}));

	const orderedFails = () => Object.entries(fails.data ?? {});

	return (
		<main class="w-full h-full bg-gray-2 text-(--text-primary) p-4">
			<h2 class="text-2xl font-bold">Debug Windows</h2>
			<div class="py-4 gap-3 inline-flex">
				<button
					class="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
					onClick={() => commands.showWindow("Setup")}
				>
					Show Setup Window
				</button>
				<button
					class="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
					onClick={() =>
						commands.showWindow({ InProgressRecording: { countdown: 3 } })
					}
				>
					Show Recording Controls Window
				</button>
			</div>

			<h2 class="text-2xl font-bold">Fail Points</h2>
			<ul class="p-2">
				<For each={orderedFails()}>
					{(fail) => {
						const id = createUniqueId();

						return (
							<li class="flex flex-row items-center gap-2">
								<input
									class="size-4"
									id={id}
									type="checkbox"
									checked={fail[1]}
									value={fail[1].toString()}
									onClick={(e) => {
										e.preventDefault();
										commands
											.setFail(fail[0], !fail[1])
											.then(() => fails.refetch());
									}}
								/>
								<label for={id}>{fail[0]}</label>
							</li>
						);
					}}
				</For>
			</ul>

			<h2 class="text-2xl font-bold">Solarium</h2>
			<div class="py-4 gap-3 inline-flex">
				<button
					class="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
					onClick={() => {
						createSolariumWindow({
							decorations: false,
							shadow: false,
							label: "recording-controls-solarium",
							title: "Recording Controls",
							url: "/solarium-recording-controls",
							transparent: true,
						});
					}}
				>
					Show Recording Controls
				</button>
				<button
					class="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
					onClick={async () => {
						await WebviewWindow.getByLabel("solarium-cap-main").then((w) =>
							w?.close(),
						);
						createSolariumWindow({
							label: "solarium-cap-main",
							title: "Recording Controls",
							url: "/solarium-cap-main",
							hiddenTitle: true,
							titleBarStyle: "overlay",
							resizable: false,
							alwaysOnTop: true,
							// windowEffects: {
							// 	effects: [Effect.UnderWindowBackground, Effect.Mica],
							// 	state: EffectState.Active,
							// },
							transparent: true,
						});
					}}
				>
					Show Solarium Main
				</button>
			</div>
		</main>
	);
}

export function createSolariumWindow(
	options: Omit<WebviewOptions, "x" | "y" | "width" | "height"> &
		WindowOptions & { label: string },
) {
	commands.createWindowTryWithMaterialHosting(JSON.stringify(options));
}
