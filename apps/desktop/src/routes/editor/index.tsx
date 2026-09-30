import { Suspense } from "solid-js";
import { Editor } from "./Editor";
import { EditorSkeleton } from "./editor-skeleton";
import { PreparingEditorProvider } from "./preparing-editor-context";

export default function () {
	return (
		<div
			class={cx(
				"flex flex-col w-screen h-screen bg-ed-window text-ed-text-1",
				ostype() !== "windows" && "bg-transparent-window",
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
