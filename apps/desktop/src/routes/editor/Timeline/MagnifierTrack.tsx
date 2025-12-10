import { createEventListenerMap } from "@solid-primitives/event-listener";
import { Menu } from "@tauri-apps/api/menu";
import { cx } from "cva";
import { Option } from "effect";
import {
	batch,
	createMemo,
	createRoot,
	createSignal,
	Index,
	Match,
	onCleanup,
	Show,
	Switch,
} from "solid-js";
import { produce } from "solid-js/store";
import type { MagnifierSegment, MagnifierShape } from "~/utils/tauri";
import { commands } from "~/utils/tauri";
import { useEditorContext } from "../context";
import {
	useSegmentContext,
	useTimelineContext,
	useTrackContext,
} from "./context";
import { SegmentContent, SegmentHandle, SegmentRoot, TrackRoot } from "./Track";

export type MagnifierSegmentDragState =
	| { type: "idle" }
	| { type: "movePending" }
	| { type: "moving" };

const MIN_NEW_SEGMENT_PIXEL_WIDTH = 80;
const MIN_NEW_SEGMENT_SECS_WIDTH = 1;

export function MagnifierTrack(props: {
	onDragStateChanged: (v: MagnifierSegmentDragState) => void;
	handleUpdatePlayhead: (e: MouseEvent) => void;
}) {
	const { project, setProject, setEditorState, editorState, totalDuration } =
		useEditorContext();

	const { secsPerPixel } = useTimelineContext();

	const newSegmentMinDuration = () => MIN_NEW_SEGMENT_SECS_WIDTH;

	const newSegmentDetails = () => {
		if (
			editorState.timeline.hoveredTrack !== "magnifier" ||
			editorState.previewTime === null
		) {
			return;
		}

		const existingSegments = project.timeline?.magnifierSegments ?? [];
		const previewTime = editorState.previewTime;

		const overlappingSegment = existingSegments.find(
			(segment) => previewTime >= segment.start && previewTime <= segment.end,
		);

		if (overlappingSegment) return;

		const start = Math.max(0, previewTime - newSegmentMinDuration() / 2);
		let end = start + newSegmentMinDuration();

		if (end > totalDuration()) {
			end = totalDuration();
		}

		return { start, end };
	};

	const handleCreateSegment = async () => {
		const details = newSegmentDetails();
		if (!details) return;

		const { start, end } = details;

		const newSegment: MagnifierSegment = {
			start,
			end,
			enabled: true,
			center: { x: 0.5, y: 0.5 },
			// size: { x: 0.3, y: 0.3 },
			shape: "circle",
			zoomAmount: 2.0,
			glassStrength: 0.1,
			glassRadius: 4.0,
		};

		setProject(
			"timeline",
			"magnifierSegments",
			produce((segments = []) => [...segments, newSegment]),
		);
	};

	const handleSegmentDoubleClick = (
		segment: MagnifierSegment,
		index: number,
	) => {
		setEditorState("timeline", "selection", null as any);
	};

	const shapeLabel = (shape: MagnifierShape) => {
		switch (shape) {
			case "circle":
				return "Circle";
			case "ellipse":
				return "Ellipse";
			case "roundedRectangle":
				return "Rounded Rect";
			default:
				return "Unknown";
		}
	};

	return (
		<TrackRoot
			onMouseEnter={() =>
				setEditorState("timeline", "hoveredTrack", "magnifier")
			}
			onMouseLeave={() => setEditorState("timeline", "hoveredTrack", null)}
			onClick={handleCreateSegment}
			class={cx(newSegmentDetails() && "cursor-pointer")}
		>
			<Show
				when={project.timeline?.magnifierSegments}
				fallback={
					<div class="text-center text-sm text-[--text-tertiary] flex flex-col justify-center items-center inset-0 w-full bg-gray-3/20 dark:bg-gray-3/10 hover:bg-gray-3/30 dark:hover:bg-gray-3/20 transition-colors rounded-xl pointer-events-none">
						<div>Click to add magnifier segment</div>
						<div class="text-[10px] text-[--text-tertiary]/40 mt-0.5">
							(Magnify and distort areas with glass effect)
						</div>
					</div>
				}
			>
				<Index each={project.timeline?.magnifierSegments}>
					{(segment, i) => (
						<SegmentRoot
							class={cx(
								"border duration-200 hover:border-gray-12 transition-colors group",
								"bg-gradient-to-r from-purple-900/50 via-purple-800/50 to-purple-900/50 shadow-[inset_0_8px_12px_3px_rgba(255,255,255,0.1)]",
								"border-transparent",
							)}
							innerClass="ring-purple-5"
							segment={segment()}
							onDblClick={() => handleSegmentDoubleClick(segment(), i)}
						>
							<SegmentContent>
								<div class="flex items-center gap-2 text-xs">
									<span class="font-medium">{shapeLabel(segment().shape)}</span>
									<span class="text-gray-400">
										{Number(segment().zoomFactor).toFixed(1)}x
									</span>
								</div>
							</SegmentContent>
							<SegmentHandle position="start" />
							<SegmentHandle position="end" />
						</SegmentRoot>
					)}
				</Index>
			</Show>
		</TrackRoot>
	);
}
