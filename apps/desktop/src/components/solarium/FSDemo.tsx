/**
 * FluidSurfaceDemo.tsx
 *
 * Minimal playground: a 100%-wide, 100px-tall strip you can drag the pill
 * around in. No Kobalte, no slider semantics, no step quantization — just
 * FluidSurface driven directly by a raw px position, so you can see the
 * kinetic squash/stretch in isolation.
 *
 * FluidSurface is effects-only (position spring + kinetic squash/stretch);
 * it renders no content of its own. This demo owns the actual pill markup
 * and its own press-scale spring, same pattern SolariumSlider/Switch use —
 * which is also what convinced me FluidSurface shouldn't own content OR
 * drag: three different consumers (this demo, a stepped slider, a binary
 * switch) each want meaningfully different markup and drag semantics
 * around the same underlying physics.
 */

import {
	type Component,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";
import { createSpring, springs } from "~/utils/springs";
import { FluidSurface } from "./FluidSurface";

const PILL_SIZE = 32;
const HALF = PILL_SIZE / 2;

export const FluidSurfaceDemo: Component = () => {
	let stripEl: HTMLDivElement | undefined;
	const [width, setWidth] = createSignal(0);
	const [x, setX] = createSignal(HALF);
	const [pressed, setPressed] = createSignal(false);

	const pressScale = createSpring(1, springs.snappy);
	createEffect(() => pressScale.set(pressed() ? 1.25 : 1));
	onCleanup(() => pressScale.destroy());

	onMount(() => {
		if (!stripEl) return;
		const ro = new ResizeObserver(([entry]) => {
			const w = entry.contentRect.width;
			setWidth(w);
			setX((prev) => Math.min(Math.max(prev, HALF), Math.max(w - HALF, HALF)));
		});
		ro.observe(stripEl);
		setWidth(stripEl.clientWidth);
		onCleanup(() => ro.disconnect());
	});

	let dragging = false;

	function clamp(px: number) {
		const w = width();
		return Math.min(Math.max(px, HALF), Math.max(w - HALF, HALF));
	}

	function onPointerDown(e: PointerEvent) {
		if (!stripEl) return;
		dragging = true;
		stripEl.setPointerCapture(e.pointerId);
		setPressed(true);
		const rect = stripEl.getBoundingClientRect();
		setX(clamp(e.clientX - rect.left));
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging || !stripEl) return;
		const rect = stripEl.getBoundingClientRect();
		setX(clamp(e.clientX - rect.left));
	}

	function onPointerUp() {
		dragging = false;
		setPressed(false);
	}

	return (
		<div class="w-full flex flex-col gap-2">
			<div
				ref={stripEl}
				class="relative w-full touch-none select-none"
				style={{
					height: "100px",
					background: "var(--color-gray-2, #1a1a1a)",
					"border-radius": "12px",
				}}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				<FluidSurface
					x={x()}
					size={PILL_SIZE}
					kinetic={{ preset: "position-bouncy" }}
				>
					{(effects) => (
						<div
							style={{
								width: `${PILL_SIZE}px`,
								height: `${PILL_SIZE}px`,
								"border-radius": "999px",
								"background-color": "var(--color-white)",
								"transform-origin": "center center",
								transform: `scale(${pressScale.value()}) ${effects.kineticScale}`,
							}}
						/>
					)}
				</FluidSurface>
			</div>
			<p style={{ opacity: 0.6, "font-size": "13px" }}>
				Drag anywhere in the strip. Flick and release to see the kinetic
				follow-through; the squash/stretch is driven purely by how fast x is
				changing, independent of anything slider-shaped.
			</p>
		</div>
	);
};
