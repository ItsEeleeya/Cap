import { type } from "@tauri-apps/plugin-os";
import { cx } from "cva";
import { onMount, Suspense } from "solid-js";
import { commands } from "~/utils/tauri";
import { Editor } from "./Editor";
import { EditorSkeleton } from "./editor-skeleton";
import { PreparingEditorProvider } from "./preparing-editor-context";

export default function () {
	return (
		<div
			class={cx(
				"flex flex-col w-screen h-screen bg-ed-window text-ed-text-1",
				// type() !== "windows" && "bg-transparent-window",
			)}
		>
			<PreparingEditorProvider>
				<Suspense fallback={<EditorSkeleton />}>
					<Editor />
				</Suspense>
			</PreparingEditorProvider>
		</div>
	);
}
