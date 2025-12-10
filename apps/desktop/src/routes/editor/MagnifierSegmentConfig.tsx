import { For, Show } from "solid-js";
import type { MagnifierSegment, MagnifierShape } from "~/utils/tauri";
import { useEditorContext } from "./context";

const SHAPE_OPTIONS: { value: MagnifierShape; label: string }[] = [
	{ value: "circle", label: "Circle" },
	{ value: "ellipse", label: "Ellipse" },
	{ value: "roundedRectangle", label: "Rounded Rectangle" },
];

export function MagnifierSegmentConfig() {
	const { project, setProject, editorState } = useEditorContext();

	const segmentIndex = () => {
		const selection = editorState.timeline.selection;
		if (selection?.type === "magnifier") {
			return selection.indices[0] ?? -1;
		}
		return -1;
	};

	const segment = () => {
		const timeline = project.timeline;
		const index = segmentIndex();
		return index >= 0 ? timeline?.magnifierSegments?.[index] : null;
	};

	const updateSegment = (field: keyof MagnifierSegment, value: any) => {
		const index = segmentIndex();
		if (index >= 0) {
			setProject("timeline", "magnifierSegments", index, field as any, value);
		}
	};

	const updateCenter = (axis: "x" | "y", value: number) => {
		const index = segmentIndex();
		if (index >= 0) {
			const currentSegment = segment();
			if (currentSegment) {
				setProject("timeline", "magnifierSegments", index, "center", {
					...currentSegment.center,
					[axis]: value,
				});
			}
		}
	};

	const updateSize = (axis: "x" | "y", value: number) => {
		const index = segmentIndex();
		if (index >= 0) {
			const currentSegment = segment();
			if (currentSegment) {
				setProject("timeline", "magnifierSegments", index, "size", {
					...currentSegment.size,
					[axis]: value,
				});
			}
		}
	};

	return (
		<Show when={segment()}>
			<div class="space-y-4">
				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Shape
					</label>
					<select
						value={segment()?.shape}
						onChange={(e) =>
							updateSegment("shape", e.target.value as MagnifierShape)
						}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					>
						<For each={SHAPE_OPTIONS}>
							{(option) => <option value={option.value}>{option.label}</option>}
						</For>
					</select>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Center X
					</label>
					<input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={segment()?.center.x}
						onChange={(e) => updateCenter("x", parseFloat(e.target.value))}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Center Y
					</label>
					<input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={segment()?.center.y}
						onChange={(e) => updateCenter("y", parseFloat(e.target.value))}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Size X
					</label>
					<input
						type="number"
						min="0.05"
						max="1"
						step="0.01"
						value={segment()?.size.x}
						onChange={(e) => updateSize("x", parseFloat(e.target.value))}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Size Y
					</label>
					<input
						type="number"
						min="0.05"
						max="1"
						step="0.01"
						value={segment()?.size.y}
						onChange={(e) => updateSize("y", parseFloat(e.target.value))}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Zoom Factor
					</label>
					<input
						type="number"
						min="1.0"
						max="5.0"
						step="0.1"
						value={segment()?.zoomFactor}
						onChange={(e) =>
							updateSegment("zoomAmount", parseFloat(e.target.value))
						}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Glass Strength
					</label>
					<input
						type="number"
						min="0"
						max="0.5"
						step="0.01"
						value={segment()?.glassStrength}
						onChange={(e) =>
							updateSegment("glassStrength", parseFloat(e.target.value))
						}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>

				<div class="space-y-2">
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Glass Speed
					</label>
					<input
						type="number"
						min="0"
						max="5"
						step="0.1"
						value={segment()?.glassRadius}
						onChange={(e) =>
							updateSegment("glassRadius", parseFloat(e.target.value))
						}
						class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
					/>
				</div>
			</div>
		</Show>
	);
}
