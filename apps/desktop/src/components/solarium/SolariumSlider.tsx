/**
 * SolariumSlider.tsx
 *
 * This is the original KineticSlider, patched to fix the pill/fill desync
 * bugs below and to swap the inline pill markup for FluidSurface.
 * Everything else — rubber-band drag, click-to-position, the capture-phase
 * isDragging trick for keyboard-vs-drag disambiguation — is untouched,
 * because it already worked and wasn't the problem.
 *
 * ── The pill/fill desync bug, and the fix ───────────────────────────────
 *
 * Slider.Fill and the visual pill used to be driven by two INDEPENDENT
 * computations of "the value at this pointer position": Fill from
 * Kobalte's own internal pointer tracking, and the pill from this
 * component's own createDrag-driven math. These agree almost always, but
 * not quite always: any rounding difference between the two could make one
 * land on a different step than the other for the rest of (or the tail end
 * of) a drag.
 *
 * The fix: `<Slider>` is now always rendered with `value={kobalteValue()}`
 * (falling back to our own signal only when the consumer didn't pass a
 * `value` themselves), so Slider.Fill is ALWAYS painted from the exact same
 * signal that positions the pill. There is only one computation of "the
 * value," done in onMove/handleKobalteChange, and both Fill and the pill
 * read from its result — they cannot disagree by construction.
 *
 * ── The rubber-band-invisible bug, and the fix ──────────────────────────
 *
 * `createDrag` already rubber-bands `x` past `[0, trackWidth]` (its
 * `getConstraints` is the FULL track, deliberately — so value math can
 * actually reach min/max). That rubber-banded `x` IS being computed
 * correctly by createDrag; the bug was entirely on our side, in how we
 * turned it into a pill-centre pixel.
 *
 * The old code re-clamped `x` (track-space, 0..w) into
 * `[halfPill - PILL_EDGE_BLEED, w - halfPill + PILL_EDGE_BLEED]` — a window
 * only PILL_EDGE_BLEED (4px) wider than the pill's own resting position at
 * min/max, AND in a different coordinate space (pill-centre-space, already
 * shifted in by halfPill) than `x` lives in. Any overshoot `x` produces
 * (e.g. x = -5 for a 5px rubber-band pull past the left edge) got
 * immediately clamped right back to `halfPill - PILL_EDGE_BLEED` — which is
 * ALSO exactly the pill's resting position at value=min. The overshoot was
 * computed, then clamped away before it could ever render, because two
 * different coordinate spaces were being treated as one number line.
 *
 * The fix: when out of bounds, don't reinterpret `x` as a pill-centre
 * position at all. Take the overshoot AMOUNT (`0 - x` on the low side,
 * `x - w` on the high side — always >= 0, asymptotically capped at
 * RUBBER_OVERSHOOT by createDrag's own tanh falloff) and apply that as a
 * DELTA from the pill's resting bleed edge. "How far past the edge did the
 * user pull" (track-space, createDrag's problem) and "where does the
 * pill's centre render" (pill-space, ours) stay related by an offset
 * instead of getting conflated into one clamp. See pillCentreForOvershoot.
 *
 * ── Router ───────────────────────────────────────────────────────────────
 *
 * SolariumSlider picks between this (single value) and a plain Kobalte
 * slider (2+ values) — multi-thumb kinetic dragging is a substantially
 * harder problem (thumb ownership, collision) and out of scope; plain
 * Kobalte already handles range sliders correctly on its own.
 */

import type { SliderRootProps } from "@kobalte/core/slider";
import { Slider } from "@kobalte/core/slider";
import {
	type Component,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	Show,
	splitProps,
} from "solid-js";
import { createSpring, springs } from "~/utils/springs";
import { createDrag } from "./drag";
import { FluidSurface } from "./FluidSurface";
import type { KineticConfig } from "./kinetic";

// Thumb size is selected via a font-size-like scale (matching the pixel
// values behind Tailwind's text-xs/sm/base/lg/xl), the same convention as
// icon/avatar sizing — `size` selects a font-size, and the thumb's
// diameter is a fixed multiple of it (an "em"). Nothing else (track
// height, Fill) is affected — see PlainSolariumSlider/SimpleSolariumSlider
// for where that font-size is actually applied, scoped to the thumb only.
export type SolariumSliderSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_FONT_SIZE_PX: Record<SolariumSliderSize, number> = {
	xs: 12,
	sm: 14,
	md: 16,
	lg: 18,
	xl: 24,
};

// md (16px font) × 1.5 = 24px, matching the slider's original fixed thumb size.
const THUMB_SIZE_EM = 1.5;

// How far the thumb's outer edge is allowed to sit past the track's edge at
// min/max — a small, deliberate, size-independent overshoot so the thumb
// doesn't look flush/clipped against the track ends.
const PILL_EDGE_BLEED = 4;

// Fixed-magnitude kinetic kick applied on every discrete step commit (drag
// crossing a step boundary, or a keyboard nudge) — see FluidSurface's
// `pulseId` doc comment for why this can't just rely on the continuous
// position-sampling velocity estimate.
const STEP_KICK_VELOCITY = 500;

// Rubber-band feels subtle but physical. Increase toward 0.3 for panels/drawers.
const RUBBER_OVERSHOOT = 5;
const RUBBER_SOFTNESS = 42;

// ─── Slider-only math (kept local to this file, nothing here is reused elsewhere) ──

function toT(value: number, min: number, range: number) {
	return (value - min) / range;
}

function fromRawPx(px: number, w: number, min: number, range: number) {
	return min + (px / w) * range;
}

function clampValue(v: number, min: number, max: number) {
	return Math.min(Math.max(v, min), max);
}

// Pixel position of the pill centre for a normalised t ∈ [0,1]. Clamped so
// the pill's outer edge sits PILL_EDGE_BLEED px past the track edge at the
// extremes (not flush with it) — matching macOS's own slider feel. `t` is
// expected to reach exactly 0/1 at minValue/maxValue (see the drag/value
// math below, which deliberately does NOT inset by halfPill), so this is
// purely a rendering concern, never used to compute a value.
function clampedCentrePx(t: number, w: number, halfPill: number) {
	const min = halfPill - PILL_EDGE_BLEED;
	const max = w - halfPill + PILL_EDGE_BLEED;
	return Math.min(Math.max(t * w, min), max);
}

/**
 * Maps an out-of-bounds, already-rubber-banded `x` (in TRACK-space — what
 * createDrag hands back, roughly `[-RUBBER_OVERSHOOT, trackWidth +
 * RUBBER_OVERSHOOT]` at the asymptotic extreme) to a pill-CENTRE pixel that
 * visibly shows the overshoot, without conflating the two coordinate
 * spaces.
 *
 * This only ever runs when the drag is out of bounds (raw < 0 or raw > w),
 * so `restEdgePx` is always one of the pill's two resting bleed positions —
 * `halfPill - PILL_EDGE_BLEED` on the low side, `w - halfPill +
 * PILL_EDGE_BLEED` on the high side — the position the pill already sits
 * at when the value is pinned to min/max. We take the overshoot AMOUNT out
 * of `x` (how far past 0 or w createDrag's own rubber-band pulled it) and
 * apply that same amount as a delta from the resting edge, so a 5px pull
 * past the track edge shows as ~5px of visible pill movement past its
 * resting position — not 5px past raw track pixel 0, which is a different,
 * much larger, distance once halfPill and the bleed are folded in.
 */
function pillCentreForOvershoot(
	x: number,
	w: number,
	restEdgePx: number,
	side: "low" | "high",
) {
	if (side === "low") {
		const overshoot = Math.max(0 - x, 0);
		return restEdgePx - overshoot;
	}
	const overshoot = Math.max(x - w, 0);
	return restEdgePx + overshoot;
}

/**
 * Quantizes a raw value to Kobalte's `step`, the same way Kobalte's own
 * internal slide handling does — round to nearest step, then clamp.
 * This is what keeps the pill's stepped position in agreement with Fill.
 */
function quantizeToStep(
	value: number,
	step: number | undefined,
	min: number,
	max: number,
) {
	if (!step) return value;
	const snapped = Math.round((value - min) / step) * step + min;
	return clampValue(snapped, min, max);
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface SolariumSliderProps extends SliderRootProps {
	kinetic?: KineticConfig;
	class?: string;
	/** Thumb size, on a font-size-like scale. Affects only the thumb. @default "md" */
	size?: SolariumSliderSize;
}

function valueCount(props: SolariumSliderProps): number {
	if (Array.isArray(props.value)) return props.value.length;
	if (Array.isArray(props.defaultValue)) return props.defaultValue.length;
	return 1;
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const SolariumSlider: Component<SolariumSliderProps> = (props) => {
	return (
		<Show
			when={valueCount(props) <= 1}
			fallback={<PlainSolariumSlider {...props} />}
		>
			<SimpleSolariumSlider {...props} />
		</Show>
	);
};

// ─── Plain fallback (2+ values) ───────────────────────────────────────────────

const PlainSolariumSlider: Component<SolariumSliderProps> = (rawProps) => {
	const [local, sliderProps] = splitProps(rawProps, [
		"kinetic",
		"class",
		"size",
	]);
	return (
		<Slider {...sliderProps} class={`relative w-full ${local.class ?? ""}`}>
			<Slider.Track class="relative flex items-center h-6 w-full">
				<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
					<Slider.Fill class="absolute inset-y-0 left-0 rounded-full bg-blue-9" />
				</div>
				{/* font-size + em sizing scoped to the thumb only — nothing else here uses em units */}
				<Slider.Thumb
					class="block rounded-full bg-white shadow"
					style={{
						"font-size": `${SIZE_FONT_SIZE_PX[local.size ?? "md"]}px`,
						width: `${THUMB_SIZE_EM}em`,
						height: `${THUMB_SIZE_EM}em`,
					}}
				>
					<Slider.Input />
				</Slider.Thumb>
			</Slider.Track>
		</Slider>
	);
};

// ─── Single-value kinetic slider ───────────────────────────────────────────────

const SimpleSolariumSlider: Component<SolariumSliderProps> = (rawProps) => {
	const [local, sliderProps] = splitProps(rawProps, [
		"kinetic",
		"class",
		"onChange",
		"onChangeEnd",
		"size",
	]);

	const [pillPressed, setPillPressed] = createSignal(false);
	// Press-down scale bump — owned here, not FluidSurface (which is
	// effects-only: position spring + kinetic squash/stretch, nothing about
	// what the content looks like or how it responds to being pressed).
	// Pops to 1.25x while pressed/interacting, back to 1x on release.
	const pressScale = createSpring(1, springs.snappy);

	// Thumb diameter, in px — the only thing `size` affects. Track height,
	// Fill, rubber-band feel, etc. are all independent of it.
	const fontSizePx = () => SIZE_FONT_SIZE_PX[local.size ?? "md"];
	const pillWidth = () => fontSizePx() * THUMB_SIZE_EM;
	const halfPill = () => pillWidth() / 2;

	const minValue = (sliderProps.minValue ?? 0) as number;
	const maxValue = (sliderProps.maxValue ?? 100) as number;
	const range = maxValue - minValue;
	const step = sliderProps.step as number | undefined;

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

	// ─── Pill position: x=px target, animate=whether FluidSurface should spring to it ──

	const [pillX, setPillX] = createSignal(
		clampedCentrePx(toT(currentValue, minValue, range), 0, halfPill()),
	);
	const [pillAnimate, setPillAnimate] = createSignal(false);

	onMount(() => {
		const w = trackWidth();
		if (w > 0) {
			setPillAnimate(false);
			setPillX(
				clampedCentrePx(toT(currentValue, minValue, range), w, halfPill()),
			);
		}
	});

	// ─── Step kick: a discrete kinetic pulse on every step commit ────────────

	const [stepPulseId, setStepPulseId] = createSignal(0);
	const [stepPulseVelocity, setStepPulseVelocity] = createSignal(0);

	function pulseStep(from: number, to: number) {
		const direction = Math.sign(to - from) || 1;
		setStepPulseVelocity(direction * STEP_KICK_VELOCITY);
		setStepPulseId((id) => id + 1);
	}

	// ─── Drag handling ───────────────────────────────────────────────────────

	let isDragging = false;
	const [isInteracting, setIsInteracting] = createSignal(false);

	createEffect(() => {
		pressScale.set(pillPressed() || isInteracting() ? 1.25 : 1);
	});
	onCleanup(() => pressScale.destroy());

	onMount(() => {
		if (!trackEl) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			// Constraints are the VALUE bounds in px — the FULL track width,
			// [0, trackWidth] — so a drag can actually reach minValue/maxValue
			// exactly (raw=0 or raw=trackWidth). Pill-edge bleed past the track
			// at the extremes (clampedCentrePx) is a separate, purely visual
			// concern layered on top — it must never feed back into value math,
			// or the value could never reach the real min/max via dragging.
			getConstraints: () => ({
				min: 0,
				max: trackWidth(),
			}),

			onMove({ x, raw, isDragging: dragging }) {
				isDragging = dragging;
				setIsInteracting(true);
				if (!dragging) return;

				const w = trackWidth();
				const inBounds = raw >= 0 && raw <= w;

				const clampedRaw = Math.min(Math.max(raw, 0), w);
				const rawValue = clampValue(
					fromRawPx(clampedRaw, w, minValue, range),
					minValue,
					maxValue,
				);
				const steppedValue = quantizeToStep(rawValue, step, minValue, maxValue);

				if (step !== undefined && steppedValue !== currentValue) {
					pulseStep(currentValue, steppedValue);
				}
				if (steppedValue !== currentValue) {
					currentValue = steppedValue;
					setKobalteValue([steppedValue]);
					local.onChange?.([steppedValue]);
				}

				// Position the pill at the stepped value's pixel — the SAME value
				// `<Slider value={kobalteValue()}>` feeds Fill, so the two can
				// never disagree (see the render below). Past the edge
				// (rubber-band zone), there's no value to quantize to (it's
				// pinned at min/max), so the pill's centre is offset from its
				// resting bleed edge by however far createDrag's rubber-band
				// pulled `x` past the real track edge — see
				// pillCentreForOvershoot's doc comment for why this can't just
				// reuse clampedCentrePx/x directly.
				setPillAnimate(false);
				if (inBounds) {
					setPillX(
						clampedCentrePx(toT(steppedValue, minValue, range), w, halfPill()),
					);
				} else if (raw < 0) {
					setPillX(
						pillCentreForOvershoot(x, w, halfPill() - PILL_EDGE_BLEED, "low"),
					);
				} else {
					setPillX(
						pillCentreForOvershoot(
							x,
							w,
							w - halfPill() + PILL_EDGE_BLEED,
							"high",
						),
					);
				}
				// Kinetic velocity is derived by FluidSurface itself from the
				// pillX changes we just fed it — no separate push needed here.
			},

			onRelease() {
				isDragging = false;
				setIsInteracting(false);
				const w = trackWidth();

				// No value recompute here — currentValue is already exactly
				// what the last onMove committed (and what Fill is already
				// showing, since it's driven by the same kobalteValue signal).
				// Recomputing from the pointerup event's own coordinate would
				// reintroduce a second, separate sample that can round
				// differently than the preceding pointermove did.
				const snappedValue = currentValue;

				// Animate back from wherever rubber-band left us to the clamped
				// centre. FluidSurface's own velocity sampling loop will detect
				// this motion and, once it settles, release its internal
				// kinetic engine into decay on its own — no manual release
				// needed here.
				setPillAnimate(true);
				setPillX(
					clampedCentrePx(toT(snappedValue, minValue, range), w, halfPill()),
				);

				setPillPressed(false);
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
			setPillPressed(true);
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
		const rawValue = clampValue(
			fromRawPx(rawPx, w, minValue, range),
			minValue,
			maxValue,
		);
		const newValue = quantizeToStep(rawValue, step, minValue, maxValue);
		const clampedPx = clampedCentrePx(
			toT(newValue, minValue, range),
			w,
			halfPill(),
		);

		currentValue = newValue;
		setKobalteValue([newValue]);
		// Just hand FluidSurface the new target with animate=true — its own
		// velocity sampling loop observes the resulting spring motion and
		// drives the kinetic squash from that, the same way an animated
		// keyboard/step commit already does. We used to also call
		// k.inject()/k.release() here to manually kick off a fling, but that
		// raced against the sampling loop's own push() (which unconditionally
		// cancels any in-progress decay) and could cancel the fling a frame
		// after starting it. Letting the spring's motion be the single
		// source of truth for velocity avoids the race entirely.
		setPillAnimate(true);
		setPillX(clampedPx);
		setPillPressed(false);
		isDragging = false;
		setIsInteracting(false);

		local.onChange?.([newValue]);
		local.onChangeEnd?.([newValue]);
	}

	// ─── Keyboard (and the tail end of a drag) ───────────────────────────────
	//
	// handleKobalteChange is Kobalte's own onChange — it ALSO fires from
	// Slider.Track's internal pointer handling, running in parallel with our
	// own createDrag/handleTrackClick math. The isDragging guard suppresses
	// it during pointer-driven changes; what's left is keyboard nav, which
	// moves the pill instantly (no animation, no kinetic squash — an
	// arrow-key nudge isn't a fling).
	function handleKobalteChange(v: number[]) {
		if (isDragging) return;
		const next = v[0];
		currentValue = next;
		setKobalteValue(v);
		const w = trackWidth();
		setPillAnimate(false);
		setPillX(clampedCentrePx(toT(next, minValue, range), w, halfPill()));
		local.onChange?.(v);
	}

	function handleKobalteChangeEnd(v: number[]) {
		if (!isDragging) local.onChangeEnd?.(v);
	}

	return (
		<div class={`select-none w-full ${local.class ?? ""}`}>
			<Slider
				{...sliderProps}
				// Always controlled, even when the consumer didn't pass `value`
				// themselves (the common case, e.g. `defaultValue={[2]}`) — falling
				// back to our own `kobalteValue` keeps Kobalte's internal state
				// (and therefore Slider.Fill) driven ENTIRELY by the value we
				// compute in onMove/handleKobalteChange, rather than letting
				// Kobalte also independently track pointer position internally.
				value={rawProps.value ?? kobalteValue()}
				onChange={handleKobalteChange}
				onChangeEnd={handleKobalteChangeEnd}
				class="relative w-full"
			>
				<div ref={trackEl} class="relative w-full" onClick={handleTrackClick}>
					<Slider.Track class="relative flex items-center h-6 w-full">
						{/* Kobalte's Fill — driven by value, never by the pill spring */}
						<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
							<Slider.Fill class="absolute inset-y-0 left-0 rounded-full bg-blue-9" />
						</div>

						{/* Visual pill — FluidSurface supplies position+kinetic effects only; the actual content (white/glass, press-scale) is ours */}
						<FluidSurface
							x={pillX()}
							animate={pillAnimate()}
							size={pillWidth()}
							axis="x"
							kinetic={local.kinetic}
							pulseId={stepPulseId()}
							pulseVelocity={stepPulseVelocity()}
						>
							{(effects) => (
								<div
									style={{
										position: "relative",
										width: `${pillWidth()}px`,
										height: `${pillWidth() * 0.75}px`,
										"transform-origin": "center center",
										transform: `scale(${pressScale.value()}) ${effects.kineticScale}`,
										"will-change": "transform",
									}}
								>
									{/* White capsule <-> glass crossfade, both stacked and faded, not swapped outright — see Switch for the same pattern */}
									<div
										class="apple-glass-clear -"
										style={{
											position: "absolute",
											inset: "0",
											"border-radius": "999px",
											"background-color": "var(--color-white)",
											opacity: pillPressed() || isInteracting() ? 0 : 1,
											transition: "opacity 150ms ease-out",
										}}
									/>
									<div
										class="apple-glass-clear"
										style={{
											position: "absolute",
											inset: "0",
											"border-radius": "999px",
											"background-color": "transparent",
											opacity: pillPressed() || isInteracting() ? 1 : 0,
											transition: "opacity 150ms ease-out",
										}}
									/>
								</div>
							)}
						</FluidSurface>

						{/*
						 * Slider.Input with no Slider.Thumb — Kobalte renders
						 * a hidden input for keyboard / form, but no visual thumb.
						 * We need at least one Thumb for the Input to be valid.
						 * Hide it visually; FluidSurface handles all visual feedback.
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
