/**
 * KineticSlider.tsx
 *
 * A stepped slider: Kobalte owns state/a11y/keyboard, we own everything
 * visual. The pill and fill always land on one of Kobalte's discrete step
 * positions — never a free pixel — but the *approach* to that position is
 * animated (posSpring below), and dragging snaps live as you cross each
 * step's midpoint (magnetic feel), not just on release.
 *
 * ┌─ Kobalte <Slider> (headless) ────────────────────────────────────────┐
 * │  Owns: state, keyboard nav, ARIA, form output via Slider.Input.       │
 * │  Renders no visible Track/Fill/Thumb — those are ours (see below).    │
 * └─────────────────────────────────────────────────────────────────────┘
 * ┌─ Our Track / Fill / Pill (absolute, driven by posSpring) ────────────┐
 * │  posSpring holds ONE number: raw pixel position along the track,      │
 * │  [0, trackWidth], same convention Kobalte itself uses. Fill reads it  │
 * │  directly as a width. The pill reads it too, but nudged inward by     │
 * │  pillEdgeClampPx (sliderMath.ts) only at render time, so its own box  │
 * │  doesn't clip outside the track near the extremes — the pill always  │
 * │  sits centred on the fill's edge except right at min/max, where it   │
 * │  pulls in just enough to stay fully visible. This is the same        │
 * │  approach Kobalte's own Fill/Thumb take; the only thing we add is    │
 * │  animating the approach to each position instead of jumping to it.   │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Stepping:
 *
 *   Every px -> value conversion goes through sliderMath's nearestStep,
 *   which derives its step size from Kobalte's own `step`/`minValue`/
 *   `maxValue` props. We never compute stepping independently of Kobalte —
 *   if we did, our snapped value could disagree with what Kobalte itself
 *   would round to on blur/keyboard, causing a visible correction jump.
 *
 *   While dragging, the raw pointer position still gets full rubber-band
 *   treatment (see createDrag), but the moment the rubber-banded pointer
 *   crosses a step's midpoint, we advance `currentValue` to that step and
 *   let posSpring animate toward it — the magnetic feel comes from the
 *   spring easing into each step rather than the value jumping instantly.
 *
 * Keyboard vs. pointer disambiguation:
 *
 *   Slider.Track's internal pointerdown handler and our own createDrag
 *   both react to the same physical events (createDrag is attached to an
 *   ancestor of Slider.Track). That means Kobalte's onChange fires for
 *   both pointer drags AND keyboard arrow keys, with no way to tell them
 *   apart from inside onChange alone.
 *
 *   We disambiguate with `isDragging`, flipped true by a CAPTURE-phase
 *   pointerdown listener on the outer div. Capture-phase runs before
 *   bubble-phase on a descendant, which is the only ordering that beats
 *   Slider.Track's own (bubble-phase) pointerdown handler — a bubble-phase
 *   listener at the same level would arrive one tick too late, letting the
 *   first pixel of a drag slip through as if it were a keyboard nudge.
 *
 *   Once drag is filtered out, what's left in onChange is genuinely
 *   keyboard-driven, so it snaps the pill instantly (no kinetic squash —
 *   an arrow-key nudge isn't a fling and shouldn't wobble).
 */

import type { SliderRootProps } from "@kobalte/core/slider";
import { Slider } from "@kobalte/core/slider";
import {
	type Component,
	createMemo,
	createSignal,
	onCleanup,
	onMount,
	splitProps,
} from "solid-js";
import { createSpring, type SpringPreset, springs } from "~/utils/springs";
import { createDrag } from "./drag";
import { createKinetic, type KineticConfig } from "./kinetic";
import {
	nearestStep,
	pillEdgeClampPx,
	rawCentrePx,
	type SliderGeometry,
	toT,
	valueAtPx,
} from "./sliderMath";

function criticallyDamped(k: number): SpringPreset {
	return { k, d: 2 * Math.sqrt(k) };
}
// 2.2x stiffer than springs.default — the magnetic step-snap should read as
// quick and decisive, not a slow drift into place.
const CLICK_SPRING = criticallyDamped(springs.default.k * 2.2);

const PILL_WIDTH = 24;
const HALF_PILL = PILL_WIDTH / 2;

// Rubber-band feels subtle but physical. Increase toward 0.3 for panels/drawers.
const RUBBER_OVERSHOOT = 5;
const RUBBER_SOFTNESS = 42;

export interface KineticSliderProps extends SliderRootProps {
	kinetic?: KineticConfig;
	class?: string;
}

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
	const step = (sliderProps.step ?? 1) as number;

	let trackEl: HTMLDivElement | undefined;
	const [trackWidth, setTrackWidth] = createSignal(0);

	// Single source of truth for every px<->value conversion in this file.
	function geometry(): SliderGeometry {
		return { minValue, maxValue, step, trackWidth: trackWidth(), pillWidth: PILL_WIDTH };
	}

	const [kobalteValue, setKobalteValue] = createSignal<number[]>(
		(() => {
			if (Array.isArray(sliderProps.defaultValue)) return sliderProps.defaultValue as number[];
			if (sliderProps.value !== undefined) return sliderProps.value as number[];
			return [nearestStep(geometry(), (minValue + maxValue) / 2)];
		})(),
	);

	// Mutable mirror of kobalteValue for synchronous reads inside event handlers.
	let currentValue = kobalteValue()[0];

	onMount(() => {
		if (!trackEl) return;
		const ro = new ResizeObserver(([entry]) => setTrackWidth(entry.contentRect.width));
		ro.observe(trackEl);
		setTrackWidth(trackEl.clientWidth);
		onCleanup(() => ro.disconnect());
	});

	// Holds ONE number: raw pixel position along the track, [0, trackWidth].
	// Fill reads this directly as a width. The pill reads it too, but only
	// nudges it inward at render time via pillEdgeClampPx, so the two never
	// have separate positions to keep in sync — there's only one position.
	const posSpring = createSpring(rawCentrePx(geometry(), toT(geometry(), currentValue)), CLICK_SPRING);

	// During rubber-band this can go negative or exceed trackWidth — left
	// unclamped on purpose (aside from the floor at 0), since the track's
	// overflow-hidden clips it, which reads as the fill "pushing against"
	// the edge rather than stopping short of it.
	const fillWidthPx = createMemo(() => Math.max(0, posSpring.value()));

	onMount(() => {
		const w = trackWidth();
		if (w > 0) posSpring.snap(rawCentrePx(geometry(), toT(geometry(), currentValue)));
	});

	let isDragging = false;
	const [isInteracting, setIsInteracting] = createSignal(false);

	// Commits a new stepped value. No-ops (including skipping onChange) if
	// the value hasn't actually moved — this runs every pointermove frame
	// while dragging, including every frame spent pinned at an edge, so a
	// naive "always notify" here would spam onChange with duplicate values.
	// Returns whether it actually changed, since callers use that to decide
	// whether to fire a kinetic push / spring transition.
	function commitValue(next: number) {
		if (next === currentValue) return false;
		currentValue = next;
		setKobalteValue([next]);
		local.onChange?.([next]);
		return true;
	}

	onMount(() => {
		if (!trackEl) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			// Value bounds in px, [0, trackWidth] — matches Kobalte's own
			// range and where rubber-band should actually kick in. Must stay
			// in sync with the `inBounds` check below.
			getConstraints: () => ({ min: 0, max: trackWidth() }),

			onMove({ x, raw, isDragging: dragging }) {
				isDragging = dragging;
				setIsInteracting(true);
				if (!dragging) return;

				const g = geometry();
				const inBounds = raw >= 0 && raw <= g.trackWidth;

				if (inBounds) {
					// Live magnetic snapping: nearest step to the pointer,
					// value pinned to the same steps Kobalte would land on.
					const steppedValue = valueAtPx(g, raw);
					if (commitValue(steppedValue)) {
						// Spring eases into the new step — this IS the magnetic
						// feel. Only fires on an actual step change, so kinetic
						// velocity reflects "steps crossed", not raw pixels moved.
						posSpring.set(rawCentrePx(g, toT(g, steppedValue)));
						k.push(steppedValue);
					}
				} else {
					// Past the track edge: value is pinned at min/max, but the
					// spring keeps tracking the rubber-banded pointer 1:1 every
					// frame — `x` from createDrag already has its own
					// spring-like ease baked in, so following it with .snap
					// (not .set) is what makes the overshoot read as continuous
					// instead of jumping once and freezing. Fill overshoots
					// along with the pill here (clipped by overflow-hidden),
					// which reads as both "pushing against" the edge together.
					commitValue(raw < 0 ? minValue : maxValue);
					posSpring.snap(x);
				}
			},

			onRelease({ raw }) {
				isDragging = false;
				setIsInteracting(false);
				const g = geometry();
				const clampedRaw = Math.min(Math.max(raw, 0), g.trackWidth);
				const snappedValue = valueAtPx(g, clampedRaw);

				commitValue(snappedValue);
				posSpring.set(rawCentrePx(g, toT(g, snappedValue)));

				k.release();
				pressScale.set(1);
				local.onChangeEnd?.([snappedValue]);
			},
		});

		onCleanup(() => drag.destroy());
	});

	// See file header re: capture-phase ordering — this must beat
	// Slider.Track's own bubble-phase pointerdown handler.
	onMount(() => {
		if (!trackEl) return;
		function onCaptureDown() {
			isDragging = true;
			k.wake();
			pressScale.set(1.25);
		}
		trackEl.addEventListener("pointerdown", onCaptureDown, { capture: true });
		onCleanup(() => trackEl?.removeEventListener("pointerdown", onCaptureDown, { capture: true }));
	});

	function handleTrackClick(e: MouseEvent) {
		if (!trackEl) return;
		const g = geometry();
		const rect = trackEl.getBoundingClientRect();
		const rawPx = e.clientX - rect.left;
		const newValue = valueAtPx(g, rawPx);
		const delta = newValue - currentValue;

		commitValue(newValue);
		posSpring.set(rawCentrePx(g, toT(g, newValue)));
		k.inject((delta / (maxValue - minValue)) * 800);
		k.release();
		pressScale.set(1);
		isDragging = false;
		setIsInteracting(false);
		local.onChangeEnd?.([newValue]);
	}

	// Kobalte's own onChange — also fires from Slider.Track's internal
	// pointer handling, in parallel with our createDrag/handleTrackClick
	// math (see file header). Guarded by isDragging so it only actually
	// does anything for keyboard nav.
	function handleKobalteChange(v: number[]) {
		if (isDragging) return;
		const g = geometry();
		const next = nearestStep(g, v[0]);
		currentValue = next;
		setKobalteValue([next]);
		posSpring.snap(rawCentrePx(g, toT(g, next)));
		local.onChange?.([next]);
	}

	function handleKobalteChangeEnd(v: number[]) {
		if (!isDragging) local.onChangeEnd?.(v);
	}

	onCleanup(() => {
		pressScale.destroy();
		posSpring.destroy();
	});

	// Render-time-only nudge: pulls the pill in from posSpring's raw
	// position just enough to keep its own box inside the track. Fill
	// never applies this — only the pill's box has a size to clip.
	function pillTranslateX() {
		return pillEdgeClampPx(geometry(), posSpring.value()) - HALF_PILL;
	}

	return (
		<div class={`select-none w-full ${local.class ?? ""}`}>
			<Slider
				{...sliderProps}
				value={rawProps.value}
				onChange={handleKobalteChange}
				onChangeEnd={handleKobalteChangeEnd}
				class="relative w-full"
			>
				<div ref={trackEl} class="relative w-full" onClick={handleTrackClick}>
					<Slider.Track class="relative flex items-center h-6 w-full">
						{/* Our Fill, not Slider.Fill — reads posSpring directly, same raw px as Kobalte's own value range. */}
						<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
							<div
								class="absolute inset-y-0 left-0 rounded-full bg-blue-9"
								style={{ width: `${fillWidthPx()}px` }}
							/>
						</div>

						<div
							class="absolute top-1/2 pointer-events-none"
							style={{ transform: `translateY(-50%) translateX(${pillTranslateX()}px)` }}
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
										transition: "background-color 150ms ease-out, transform 150ms ease-out",
										"background-color": isInteracting() ? "transparent" : "var(--color-white)",
									}}
								/>
							</div>
						</div>

						{/* Kobalte requires at least one Thumb for Input to be valid; hidden, our pill is the only visible thumb. */}
						<Slider.Thumb class="sr-only">
							<Slider.Input />
						</Slider.Thumb>
					</Slider.Track>
				</div>
			</Slider>
		</div>
	);
};