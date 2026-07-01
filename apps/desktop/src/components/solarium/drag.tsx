import { createSignal, onCleanup } from "solid-js";
import { ElasticSurface } from "~/components/ElasticSurface";
import { FilterGlassSurface } from "./FilterGlassEffect";
import { createKinetic } from "./kinetic";

export function FloatingPanel() {
	const [rect, setRect] = createSignal({
		x: 300,
		y: 150,
		width: 300,
		height: 100,
	});

	let mode: "move" | "resize" | null = null;
	let startX = 0;
	let startY = 0;
	let startRect = rect();

	function begin(e: PointerEvent, newMode: "move" | "resize") {
		e.preventDefault();

		lastX = e.clientX;
		lastY = e.clientY;
		lastT = performance.now();
		k.wake();

		mode = newMode;
		startX = e.clientX;
		startY = e.clientY;
		startRect = rect();

		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", end);
	}

	let lastX = 0,
		lastY = 0,
		lastT = 0;

	function move(e: PointerEvent) {
		const now = performance.now();
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		if (mode === "move") {
			setRect({ ...startRect, x: startRect.x + dx, y: startRect.y + dy });

			// Compute pixel/s velocity on the dominant axis
			if (lastT > 0) {
				const dt = now - lastT;
				const vx = ((e.clientX - lastX) / dt) * 1000;
				const vy = ((e.clientY - lastY) / dt) * 1000;
				const v = Math.abs(vx) >= Math.abs(vy) ? vx : vy;
				k.inject(v);
			}
		} else {
			// resize: dominant axis of the delta
			if (lastT > 0) {
				const dt = now - lastT;
				const vx = ((e.clientX - lastX) / dt) * 1000;
				const vy = ((e.clientY - lastY) / dt) * 1000;
				const v = Math.abs(vx) >= Math.abs(vy) ? vx : vy;
				k.inject(v);
			}
			setRect({
				...startRect,
				width: Math.max(120, startRect.width + dx),
				height: Math.max(120, startRect.height + dy),
			});
		}

		lastX = e.clientX;
		lastY = e.clientY;
		lastT = now;
	}

	function end() {
		k.release();
		window.removeEventListener("pointermove", move);
		window.removeEventListener("pointerup", end);
		mode = null;
	}

	onCleanup(end);

	const k = createKinetic({ preset: "subtle" });

	return (
		<div
			class="z-50"
			style={{
				position: "absolute",
				left: `${rect().x}px`,
				top: `${rect().y}px`,
				height: `${rect().height}px`,
				width: `${rect().width}px`,
			}}
		>
			<div
				class="size-full"
				style={{
					"transform-origin": "center center",
					transform: `scaleX(${k.scaleX()}) scaleY(${k.scaleY()})`,
					"will-change": "transform",
				}}
			>
				<ElasticSurface class="size-full">
					<InnerGlass />
					{/* <InnerFilterGlass /> */}
				</ElasticSurface>
			</div>

			<div
				onPointerDown={(e) => begin(e, "resize")}
				class="rounded-full absolute bg-blue-200"
				style={{
					right: "-6px",
					bottom: "-6px",
					cursor: "nwse-resize",
				}}
			></div>

			<div
				onPointerDown={(e) => begin(e, "move")}
				class="hover:bg-gray-5- rounded-full w-20 h-5 cursor-grab"
				style={{ margin: "12px auto 0" }}
			/>
		</div>
	);
}

function InnerGlass() {
	return (
		<div class="apple-glass overflow-clip rounded-full size-full flex items-center justify-center">
			<p class="font-extrabold apple-vibrancy-fill inline-flex gap-2">Bouncy</p>
			<p class="font-medium apple-vibrancy-secondary-label pl-1">Glass</p>
		</div>
	);
}

function InnerFilterGlass() {
	return <FilterGlassSurface width={200} height={100}></FilterGlassSurface>;
}
