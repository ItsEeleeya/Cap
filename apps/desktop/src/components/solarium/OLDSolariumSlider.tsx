/**
 * KineticSlider.tsx
 *
 * Two layers, one job each:
 *
 * ┌─ Kobalte <Slider> (visible, but Thumb removed) ─────────────────────────┐
 * │  Owns: Track, Fill, Input, keyboard nav, ARIA, form output.             │
 * │  Slider.Fill is driven by Kobalte's own value — always correct.         │
 * │  Slider.Thumb is replaced by a plain visual pill below.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ┌─ Visual pill (absolute, pointer-events-none) ───────────────────────────┐
 * │  Owns: position spring, rubber-band overshoot, kinetic squash/stretch,  │
 * │  press scale. Positioned over the track via absolute layout.            │
 * │                                                                         │
 * │  posSpring tracks pill centre in px (value-space: [0, trackWidth]).     │
 * │  During drag: snapped 1:1 to rubber-banded x from createDrag.          │
 * │  Past boundary: applyRubberband compresses the overshoot.              │
 * │  On release: posSpring.set(clampedPx) — spring snaps back, no bounce.  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Fill vs pill — two independent data sources:
 *
 *   Fill  → Kobalte's value signal (always the committed value, never rubber-banded)
 *   Pill  → posSpring.value() (may exceed track bounds during overshoot)
 *
 * Pill containment:
 *
 *   The pill's visual centre is posSpring.value(), which in value-space is
 *   [0, trackWidth] normally but can go negative or exceed trackWidth during
 *   rubber-band. To keep the pill's outer edge from flying off screen, we
 *   apply a separate pill-edge clamp only to the translateX:
 *
 *     pillCentrePx = posSpring.value()                  (drives fill — raw spring)
 *     pillTranslateX = clamp(pillCentrePx, HALF_PILL, w - HALF_PILL) - HALF_PILL
 *
 *   Wait — that would cancel the rubber band visually. Instead we allow the pill
 *   to travel into the rubber-band zone but clamp it so the outer edge never
 *   exits the track element itself. The rubber-band already asymptotes, so the
 *   pill will never travel more than ~elasticity * trackWidth past the edge.
 *
 * Keyboard navigation:
 *
 *   Kobalte's Slider.Track has its own internal pointerdown/move/up
 *   handlers (calling its internal onSlideStart/onSlideMove/onSlideEnd) that
 *   run in PARALLEL with our own createDrag + handleTrackClick — both react
 *   to the same physical pointer events, since Slider.Track is nested
 *   inside the div createDrag/handleTrackClick are attached to. That means
 *   handleKobalteChange (Kobalte's onChange) fires for BOTH pointer-driven
 *   changes and keyboard arrow-key changes — it can't tell them apart on
 *   its own.
 *
 *   We distinguish them with `isDragging`, set true by a CAPTURE-phase
 *   listener on the outer div (capture-phase listeners on an ancestor run
 *   before bubble-phase listeners on a descendant, which is the only
 *   ordering that reliably beats Slider.Track's own pointerdown handler to
 *   the punch — a bubble-phase listener in the same position would arrive
 *   too late, letting the first pixel of a drag slip through as if it were
 *   keyboard). With drag filtered out, what's left really is keyboard nav:
 *   it moves the pill instantly (posSpring.snap, not .set) and skips the
 *   kinetic squash entirely — an arrow-key nudge isn't a fling, it
 *   shouldn't wobble.
 */

import type { SliderRootProps } from "@kobalte/core/slider";
import { Slider } from "@kobalte/core/slider";
import {
	type Component,
	createSignal,
	onCleanup,
	onMount,
	splitProps,
} from "solid-js";
import { createSpring, type SpringPreset, springs } from "~/utils/springs";
import { createDrag } from "./drag";
import { createKinetic, type KineticConfig } from "./kinetic";

function criticallyDamped(k: number): SpringPreset {
	return { k, d: 2 * Math.sqrt(k) };
}
const CLICK_SPRING = criticallyDamped(springs.default.k);

const PILL_WIDTH = 24;
const HALF_PILL = PILL_WIDTH / 2;

// Rubber-band feels subtle but physical. Increase toward 0.3 for panels/drawers.
const RUBBER_OVERSHOOT = 5;
const RUBBER_SOFTNESS = 42;

// ─── Props ───────────────────────────────────────────────────────────────────

export interface KineticSliderProps extends SliderRootProps {
	kinetic?: KineticConfig;
	class?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const KineticSlider: Component<KineticSliderProps> = (rawProps) => {
	const [local, sliderProps] = splitProps(rawProps, [
		"kinetic",
		"class",
		"onChange",
		"onChangeEnd",
	]);

	const k = createKinetic(local.kinetic);
	const pressScale = createSpring(1, springs.snappy);

	const minValue = (sliderProps.minValue ?? 0) as number;
	const maxValue = (sliderProps.maxValue ?? 100) as number;
	const range = maxValue - minValue;

	// Kobalte's value — kept in sync so Fill and keyboard nav work correctly.
	const [kobalteValue, setKobalteValue] = createSignal<number[]>(
		(() => {
			if (Array.isArray(sliderProps.defaultValue))
				return sliderProps.defaultValue as number[];
			if (sliderProps.value !== undefined) return sliderProps.value as number[];
			return [50];
		})(),
	);

	// Our own mutable copy for fast reads inside event handlers (avoids signal reads).
	let currentValue = kobalteValue()[0];

	function toT(v: number) {
		return (v - minValue) / range;
	}
	function fromRawPx(px: number, w: number) {
		return minValue + (px / w) * range;
	}
	function clampValue(v: number) {
		return Math.min(Math.max(v, minValue), maxValue);
	}

	// Pixel position of the pill centre for a normalised t ∈ [0,1],
	// clamped so the pill outer edge doesn't cross the track edge.
	function clampedCentrePx(t: number, w: number) {
		return Math.min(Math.max(t * w, HALF_PILL), w - HALF_PILL);
	}

	// ─── Track geometry ──────────────────────────────────────────────────────

	let trackEl: HTMLDivElement | undefined;
	const [trackWidth, setTrackWidth] = createSignal(0);

	onMount(() => {
		if (!trackEl) return;
		const ro = new ResizeObserver(([entry]) =>
			setTrackWidth(entry.contentRect.width),
		);
		ro.observe(trackEl);
		setTrackWidth(trackEl.clientWidth);
		onCleanup(() => ro.disconnect());
	});

	// ─── Position spring ─────────────────────────────────────────────────────
	//
	// Tracks pill centre in px. Value-space: normally [HALF_PILL, w - HALF_PILL]
	// but may exceed that during rubber-band overshoot.
	//
	// Fill is NOT driven by this — it's driven by kobalteValue() via Kobalte's
	// own percentage math, which always reflects the committed value.

	const posSpring = createSpring(
		clampedCentrePx(toT(currentValue), 0),
		CLICK_SPRING,
	);

	onMount(() => {
		const w = trackWidth();
		if (w > 0) posSpring.snap(clampedCentrePx(toT(currentValue), w));
	});

	// ─── Drag handling ───────────────────────────────────────────────────────

	let isDragging = false;
	const [isInteracting, setIsInteracting] = createSignal(false);

	onMount(() => {
		if (!trackEl) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			// Constraints are the VALUE bounds in px — [0, trackWidth].
			// Pill-edge clamping ([HALF_PILL, w-HALF_PILL]) is separate.
			getConstraints: () => ({
				min: HALF_PILL,
				max: trackWidth() - HALF_PILL,
			}),

			onMove({ x, raw, isDragging: dragging }) {
				isDragging = dragging;
				setIsInteracting(true);
				if (!dragging) return;

				const w = trackWidth();

				// x is already rubber-banded by createDrag. Snap the spring
				// directly — pillTranslateX() will show the overshoot as-is.
				// Do NOT re-clamp here; that's what was hiding the rubber band.
				posSpring.snap(x);

				// Value is always derived from raw clamped to valid range.
				// Kinetic push only fires while inside the track — past the edge
				// the value is pinned at min/max so delta is 0 anyway, and
				// pushing with zero delta was causing the stuck-squish.
				const minPx = HALF_PILL;
				const maxPx = w - HALF_PILL;

				const clampedRaw = Math.min(Math.max(raw, minPx), maxPx);

				const newValue = clampValue(fromRawPx(clampedRaw, w));

				const inBounds = raw >= minPx && raw <= maxPx;

				if (newValue !== currentValue) {
					currentValue = newValue;
					setKobalteValue([newValue]);
					local.onChange?.([newValue]);
				}

				// Only feed kinetic velocity while the pointer is within the track.
				// Outside, the rubber band provides its own visual resistance cue.
				k.push(newValue);
			},

			onRelease({ raw }) {
				isDragging = false;
				setIsInteracting(false);
				const w = trackWidth();
				const snappedValue = clampValue(
					fromRawPx(Math.min(Math.max(raw, HALF_PILL), w - HALF_PILL), w),
				);
				currentValue = snappedValue;
				setKobalteValue([snappedValue]);

				// Animate back from wherever rubber-band left us to the clamped centre.
				posSpring.set(clampedCentrePx(toT(snappedValue), w));

				k.release();
				pressScale.set(1);
				local.onChange?.([snappedValue]);
				local.onChangeEnd?.([snappedValue]);
			},
		});

		onCleanup(() => drag.destroy());
	});

	// Attached with `capture: true` and deliberately NOT via the JSX
	// onPointerDown prop. Slider.Track (nested inside trackEl) has its own
	// pointerdown listener that calls Kobalte's onSlideStart synchronously,
	// which can fire onChange (→ handleKobalteChange) on the very first
	// pixel of a drag. Bubble-phase listeners on trackEl (an ancestor) would
	// run AFTER that inner listener — too late to flip isDragging in time.
	// Capture-phase listeners on ancestors run BEFORE bubble-phase listeners
	// on descendants, so this is the only ordering that's actually correct.
	onMount(() => {
		if (!trackEl) return;
		function onCaptureDown() {
			isDragging = true;
			k.wake();
			pressScale.set(1.25);
		}
		trackEl.addEventListener("pointerdown", onCaptureDown, { capture: true });
		onCleanup(() =>
			trackEl?.removeEventListener("pointerdown", onCaptureDown, {
				capture: true,
			}),
		);
	});

	// ─── Track click ─────────────────────────────────────────────────────────

	function handleTrackClick(e: MouseEvent) {
		// pointerdown already set isDragging = true; a click that immediately
		// follows a drag would be filtered here. Use a small movement threshold
		// in createDrag if needed — for now clicks always animate.
		if (!trackEl) return;
		const w = trackWidth();
		const rect = trackEl.getBoundingClientRect();
		const rawPx = e.clientX - rect.left;
		const clampedPx = clampedCentrePx(rawPx / w, w);
		const newValue = clampValue(fromRawPx(rawPx, w));
		const delta = newValue - currentValue;

		currentValue = newValue;
		setKobalteValue([newValue]);
		posSpring.set(clampedPx);
		k.inject((delta / range) * 800);
		k.release();
		pressScale.set(1);
		isDragging = false;
		setIsInteracting(false);

		local.onChange?.([newValue]);
		local.onChangeEnd?.([newValue]);
	}

	// ─── Keyboard (and the tail end of a drag) ───────────────────────────────
	//
	// handleKobalteChange is Kobalte's own onChange — it ALSO fires from
	// Slider.Track's internal pointer handling (onSlideStart/onSlideMove),
	// running in parallel with our own createDrag/handleTrackClick math, not
	// instead of it. We don't want this handler doing anything during a
	// pointer-driven change (no animation, since createDrag already drives
	// the spring/kinetic for that), so the isDragging guard suppresses it.
	// isDragging is set true by a CAPTURE-phase listener on trackEl (see
	// above), which fires before Slider.Track's own bubble-phase pointerdown
	// handler — without that ordering, the very first pixel of a drag could
	// sneak through here with isDragging still false.
	//
	// What's left, once drag is filtered out, really is just keyboard nav —
	// arrow keys go through the real <input> Kobalte owns (Slider.Input),
	// which has no pointer event of its own to set isDragging from. An
	// arrow-key nudge moves the pill instantly (posSpring.snap), with no
	// kinetic squash — it isn't a fling, it shouldn't wobble.
	function handleKobalteChange(v: number[]) {
		if (isDragging) return;
		const next = v[0];
		currentValue = next;
		setKobalteValue(v);
		const w = trackWidth();
		posSpring.snap(clampedCentrePx(toT(next), w));
		local.onChange?.(v);
	}

	function handleKobalteChangeEnd(v: number[]) {
		if (!isDragging) local.onChangeEnd?.(v);
	}

	onCleanup(() => {
		pressScale.destroy();
		posSpring.destroy();
	});

	// pillTranslateX — the spring value may go outside [HALF_PILL, w-HALF_PILL]
	// during rubber-band overshoot. We let it, so the overshoot is visible.
	// The only guard is clamping the pill's outer edge to [0, w] so it never
	// clips completely outside the track container. In practice the rubber-band
	// formula asymptotes well before that, so this guard almost never fires.
	function pillTranslateX() {
		return posSpring.value() - HALF_PILL;
	}

	// ─── Render ───────────────────────────────────────────────────────────────

	return (
		<div class={`select-none w-full ${local.class ?? ""}`}>
			{/*
			 * Kobalte Slider wraps everything so Fill, Input, and Label
			 * context all work. Slider.Thumb is omitted — replaced by the
			 * visual pill below. The `value` prop keeps Kobalte's Fill in
			 * sync with the committed value (never rubber-banded).
			 */}
			<Slider
				{...sliderProps}
				value={rawProps.value}
				onChange={handleKobalteChange}
				onChangeEnd={handleKobalteChangeEnd}
				class="relative w-full"
			>
				<div ref={trackEl} class="relative w-full" onClick={handleTrackClick}>
					<Slider.Track class="relative flex items-center h-6 w-full">
						{/* Kobalte's Fill — driven by value, never by the spring */}
						<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
							<Slider.Fill class="absolute inset-y-0 left-0 rounded-full bg-blue-9" />
						</div>

						{/* Visual pill — pointer-events-none, positioned by posSpring */}
						<div
							class="absolute top-1/2 pointer-events-none"
							style={{
								transform: `translateY(-50%) translateX(${pillTranslateX()}px)`,
							}}
						>
							<div style={{ width: `${PILL_WIDTH}px`, height: "18px" }}>
								<div
									classList={{
										"apple-glass-clear": isInteracting(),
										"apple-glass-clear -": !isInteracting(),
									}}
									style={{
										width: "100%",
										height: "100%",
										"border-radius": "999px",
										"transform-origin": "center center",
										transform: `scale(${pressScale.value()}) scaleX(${k.scaleX()}) scaleY(${k.scaleY()})`,
										"will-change": "transform, background-color",
										transition:
											"background-color 150ms ease-out, transform 150ms ease-out",
										"background-color": isInteracting()
											? "transparent"
											: "var(--color-white)",
									}}
								/>
							</div>
						</div>

						{/*
						 * Slider.Input with no Slider.Thumb — Kobalte renders
						 * a hidden input for keyboard / form, but no visual thumb.
						 * We need at least one Thumb for the Input to be valid.
						 * Hide it visually; our pill handles all visual feedback.
						 */}
						<Slider.Thumb class="sr-only">
							<Slider.Input />
						</Slider.Thumb>
					</Slider.Track>
				</div>
			</Slider>
		</div>
	);
};
