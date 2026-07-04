/**
 * Switch.tsx
 *
 * A binary toggle sharing FluidSurface's physics (position spring + kinetic
 * squash/stretch) with SolariumSlider's thumb — same drag primitive
 * (createDrag), same rubber-band feel, same size scale/proportions. What's
 * different from a slider: the underlying state is a boolean, not a
 * continuous value, and — per spec — that boolean only COMMITS when the
 * gesture ends (createDrag's onRelease, which fires for a plain click too,
 * since a click always dispatches pointerdown then pointerup first). During
 * a drag, the thumb tracks the pointer continuously and the active-color
 * preview follows it live (crossing 50% previews the coming commit;
 * dragging back below 50% reverts the preview), but nothing is committed
 * to `checked` until release. A release with negligible movement (a plain
 * click, not a drag) just flips the boolean instead of committing from
 * position — see onRelease's dragDistance check for why.
 *
 * ── Track geometry ───────────────────────────────────────────────────────
 *
 * Track width is always trackWidthRatio × the thumb width (default 1.55).
 * Thumb proportions match SolariumSlider's pill exactly, so the same
 * `size` scale produces a visually consistent thumb across both
 * components.
 *
 * Track HEIGHT and thumb height both derive from THUMB_HEIGHT_OF_TRACK
 * (see constant below) rather than being two independent literals. They
 * used to be separate numbers that happened to agree — once the track
 * height became configurable, the thumb (still hardcoded) could exceed
 * the track's height and bleed out vertically. Deriving both from one
 * source makes that impossible by construction: the thumb is always
 * strictly smaller than the track it sits in.
 *
 * ── Drag constraints vs. rest position ───────────────────────────────────
 *
 * The thumb's *rest* position (see restX) keeps its center inset by
 * halfThumb() from the track edges, so the thumb never visually exits the
 * track at rest. Drag constraints must use that SAME inset — [halfThumb(),
 * trackWidth() - halfThumb()] — not the raw [0, trackWidth()] track span.
 * If the drag range were wider than the rest range, the thumb could be
 * dragged further than it's ever allowed to rest, and releasing would snap
 * it back in by the difference — reading as a jump right before the
 * rubber-band engages, rather than the rubber-band being the only thing
 * that ever pulls it back.
 *
 * ── Three-layer track: layout / color+mask / functional ─────────────────
 *
 * The track is split into three stacked layers rather than two, because
 * the squircle mask (the `smoothed` utility class) and the drag
 * hit-target can't share an element:
 *
 *   1. Outer `div` — layout only. Sizes the visible track box (width,
 *      height) and establishes the positioning context. No color, no
 *      mask, no geometry the physics reads from.
 *   2. Middle `div` (`smoothed` + background color) — purely decorative,
 *      absolutely positioned to fill the outer div exactly (`inset-0`).
 *      This is the ONLY element with the squircle mask on it. It has no
 *      interactive role and sits BEHIND the functional button in paint
 *      order (first in the DOM; the button below isn't itself positioned,
 *      so it doesn't compete for stacking) — the mask clips just the
 *      color fill, never the thumb.
 *   3. Inner `button` — the functional track: `ref={trackEl}`, sized via
 *      `w-full h-full` to exactly match the outer div (which carries
 *      trackWidth()/trackHeight() — the values every drag/rest
 *      calculation is derived from). Transparent background (the color
 *      shows through from layer 2 beneath it), and deliberately carries
 *      NO mask, so the thumb — its child — is never clipped by the
 *      squircle at the extremes of travel. This is why the mask couldn't
 *      simply go on the outer div: the thumb is a descendant of the
 *      functional button, and clipping any ancestor of the thumb clips
 *      the thumb too.
 *
 * ── Content: white capsule <-> glass crossfade ──────────────────────────
 *
 * Per spec, FluidSurface owns ONLY the transform (position + kinetic
 * squash/stretch) — never content. The actual knob is two stacked,
 * absolutely-positioned layers (a plain white capsule, and a
 * `apple-glass-clear` glass layer, both also carrying `smoothed` so the
 * thumb reads as a squircle matching the track) that cross-fade opacity
 * based on whether the user is actively touching the thumb (dragging or
 * pressing), rather than being swapped outright — an outright swap would
 * pop, a crossfade eases. Both layers live inside one wrapper that gets
 * the press-scale and the kinetic squash/stretch composed together, same
 * pattern as SolariumSlider's pill.
 *
 * ── Live preview vs. commit ──────────────────────────────────────────────
 *
 * `previewChecked` (a plain signal off the live drag/click position)
 * drives the active-color fill and crossfade — it updates continuously
 * and reverts if you drag back past 50%. `checked` (the actual committed
 * boolean, what onCheckedChange reports) only updates in onRelease.
 * These are deliberately two different pieces of state; collapsing them
 * into one would either commit mid-drag (wrong, per spec) or fail to
 * preview at all (also wrong, per spec).
 *
 * ── Click vs. drag: scale-up timing ───────────────────────────────────────
 *
 * A plain click must still show the press scale-up while the thumb
 * slides to the other side, not just for drags. `pressed` is set true in
 * the capture-phase pointerdown handler and false in onRelease — the SAME
 * lifecycle for both a click and a drag, since a click is just a drag
 * with near-zero movement (see the dragDistance check in onRelease).
 * Because `pressScale` is a spring (not an instant toggle) driven by
 * `pressed() || isInteracting()`, releasing doesn't snap the scale back
 * to 1 immediately — it eases back down over the same spring curve, so a
 * fast click still visibly scales up and back rather than the two
 * transitions being imperceptible flickers either side of an instant
 * flip. The slide itself comes from `setThumbX(restX(next))` in
 * onRelease: for a stationary click, thumbX was never touched during
 * onMove (see the isFirstMoveOfGesture early-return there), so it's still
 * sitting at the OLD rest position when onRelease fires — this animated
 * set is what actually drives the visible slide to the new side.
 *
 * ── Commit animation ──────────────────────────────────────────────────────
 *
 * The snap-to-rest after release/click uses its own spring config
 * (COMMIT_SPRING) rather than whatever FluidSurface's "position" kinetic
 * preset defaults to — passed through FluidSurface's `spring` prop. Real
 * { k, d } values (see ~/utils/springs's SpringPreset), not milliseconds.
 */

import {
	type Component,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	splitProps,
} from "solid-js";
import { createSpring, springs } from "~/utils/springs";
import Smoothed from "../smoothed";
import { createDrag } from "./drag";
import { FluidSurface } from "./FluidSurface";
import type { KineticConfig } from "./kinetic";

export type SwitchSize = "xs" | "sm" | "md" | "lg" | "xl";

// Matches SolariumSlider's SIZE_FONT_SIZE_PX exactly, so thumbs read as
// the same control at the same size across both components. Kept as its
// own local table rather than importing SolariumSlider's — a switch's
// size scale is conceptually independent even though the numbers agree
// today, and this avoids one component's slider-specific tuning leaking
// into the other's.
const SIZE_FONT_SIZE_PX: Record<SwitchSize, number> = {
	xs: 12,
	sm: 14,
	md: 16,
	lg: 18,
	xl: 24,
};

const THUMB_SIZE_EM = 1.7;

// Track height, as a multiple of thumb WIDTH (not em/font-size).
const TRACK_HEIGHT_RATIO = 0.7;

// Thumb height, as a FRACTION OF TRACK HEIGHT (not thumb width). Keeps
// the thumb strictly smaller than the track by construction, regardless
// of what TRACK_HEIGHT_RATIO (or a future trackHeightRatio prop) is set
// to.
const THUMB_HEIGHT_OF_TRACK = 0.9;

// Default track-width-to-thumb-width ratio, overridable via the
// `trackWidthRatio` prop.
const DEFAULT_TRACK_WIDTH_RATIO = 1.55;

const RUBBER_OVERSHOOT = 5;
const RUBBER_SOFTNESS = 42;

// Spring for the commit snap (release-to-rest and click-to-rest), in the
// real { k, d } shape from ~/utils/springs's SpringPreset. Per
// springs.ts's own tuning guide: k=260,d=18 is "default" (mild bounce),
// k=380,d=28 is "snappy, minimal overshoot", k=500,d=40 is "instant, no
// bounce". Passed into FluidSurface's `spring` prop — only takes effect
// while `animate` is true (the commit snap), not during live drag
// tracking, which ignores spring config entirely since it's driven by
// the pointer directly every frame.
const COMMIT_SPRING = { k: 300, d: 24 };

function clampValue(v: number, min: number, max: number) {
	return Math.min(Math.max(v, min), max);
}

export interface SwitchProps {
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	size?: SwitchSize;
	/** Track width as a multiple of thumb width. @default 1.55 */
	trackWidthRatio?: number;
	kinetic?: KineticConfig;
	class?: string;
	disabled?: boolean;
	/** Accessible label — required unless the switch has visible text association elsewhere (e.g. via aria-labelledby). */
	"aria-label"?: string;
	"aria-labelledby"?: string;
	id?: string;
}

export const SolariumSwitch: Component<SwitchProps> = (rawProps) => {
	const [local] = splitProps(rawProps, [
		"checked",
		"defaultChecked",
		"onCheckedChange",
		"size",
		"trackWidthRatio",
		"kinetic",
		"class",
		"disabled",
		"aria-label",
		"aria-labelledby",
		"id",
	]);

	function fontSizePx() {
		return SIZE_FONT_SIZE_PX[local.size ?? "md"];
	}
	function thumbWidth() {
		return fontSizePx() * THUMB_SIZE_EM;
	}
	function halfThumb() {
		return thumbWidth() / 2;
	}
	function trackWidthRatio() {
		return local.trackWidthRatio ?? DEFAULT_TRACK_WIDTH_RATIO;
	}
	function trackWidth() {
		return thumbWidth() * trackWidthRatio();
	}
	function trackHeight() {
		return thumbWidth() * TRACK_HEIGHT_RATIO;
	}
	function thumbHeight() {
		return trackHeight() * THUMB_HEIGHT_OF_TRACK;
	}

	// Committed state. Falls back to defaultChecked, then false. When
	// `local.checked` is passed (controlled usage), it takes precedence on
	// each read — see `checked()` below.
	const [uncontrolledChecked, setUncontrolledChecked] = createSignal(
		local.defaultChecked ?? false,
	);
	function checked() {
		return local.checked ?? uncontrolledChecked();
	}

	function commit(next: boolean) {
		if (local.checked === undefined) setUncontrolledChecked(next);
		local.onCheckedChange?.(next);
	}

	// The thumb center's allowed rest range: inset by halfThumb() from
	// each track edge, so the thumb — drawn from its center — always sits
	// flush inside the track with no part of it crossing the track's
	// rendered boundary. This SAME range is also what bounds dragging;
	// see getConstraints below. Keeping one definition for both rest and
	// drag bounds is what prevents the thumb from being draggable further
	// than it's ever allowed to rest (the cause of the earlier overshoot
	// jump).
	function dragMin() {
		return halfThumb();
	}
	function dragMax() {
		return trackWidth() - halfThumb();
	}

	// Pixel position of the thumb centre for a given boolean, at rest.
	function restX(isOn: boolean) {
		return isOn ? dragMax() : dragMin();
	}

	const [thumbX, setThumbX] = createSignal(restX(checked()));
	const [thumbAnimate, setThumbAnimate] = createSignal(false);

	// Live preview — continuous, follows the drag/click position, and is
	// NOT the same thing as `checked`. See file doc comment.
	const [previewChecked, setPreviewChecked] = createSignal(checked());

	// Keep the thumb in sync if `checked` changes from outside (controlled
	// usage) while nothing is being dragged.
	let isDragging = false;
	createEffect(() => {
		const isOn = checked();
		if (!isDragging) {
			setThumbAnimate(true);
			setThumbX(restX(isOn));
			setPreviewChecked(isOn);
		}
	});

	const [pressed, setPressed] = createSignal(false);
	const [isInteracting, setIsInteracting] = createSignal(false);
	const pressScale = createSpring(1, springs.snappy);
	createEffect(() => {
		pressScale.set(pressed() || isInteracting() ? 1.5 : 1);
	});
	onCleanup(() => pressScale.destroy());

	let trackEl: HTMLButtonElement | undefined;
	// Tracks whether the current gesture moved enough to count as a real
	// drag (as opposed to a stationary click). createDrag fires onMove
	// once immediately on pointerdown even for a plain click (with raw =
	// the click's own position) — if onRelease always committed from
	// position, a stationary click would be forced through position math
	// instead of simply flipping, which is wrong for a switch (see
	// below).
	//
	// gestureStarted is reset explicitly in the capture-phase pointerdown
	// handler (the true, unambiguous start of any gesture) rather than
	// inferred from `isDragging` inside onMove's own "is this the first
	// move" check — `isDragging` gets set true by that SAME capture-phase
	// handler, which fires before createDrag's own bubble-phase
	// pointerdown listener (capture beats bubble), so by the time
	// onMove's own logic runs, isDragging is already true and an
	// `if (!isDragging)` check inside onMove would never see its "first
	// move" branch fire at all.
	let dragDistance = 0;
	let dragStartRaw = 0;
	let gestureStarted = false;
	const DRAG_THRESHOLD_PX = 4;

	onMount(() => {
		if (!trackEl || local.disabled) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			// Inset to the thumb CENTER's allowed range, not the raw track
			// span [0, trackWidth()]. The thumb is drawn from its center,
			// and its rest positions (restX) are already inset by
			// halfThumb() from each edge — if the drag range were the full
			// track instead of this same inset range, the pointer could
			// pull the thumb center all the way to the track edge, which
			// is halfThumb() further than the thumb is ever allowed to
			// rest. Releasing there would then snap the thumb back in by
			// that gap, reading as a visible jump BEFORE the rubber-band
			// engages — rather than the rubber-band (which only starts
			// past these bounds) being the sole source of any pull-back
			// motion.
			getConstraints: () => ({ min: dragMin(), max: dragMax() }),

			onMove({ x, raw, isDragging: dragging }) {
				const isFirstMoveOfGesture = !gestureStarted;
				if (isFirstMoveOfGesture) {
					dragStartRaw = raw;
					dragDistance = 0;
					gestureStarted = true;
				} else {
					dragDistance = Math.max(dragDistance, Math.abs(raw - dragStartRaw));
				}
				isDragging = dragging;
				setIsInteracting(true);
				if (!dragging) return;

				// The very first onMove of a gesture fires synchronously
				// from pointerdown itself — at this point there's been no
				// actual pointer movement yet, just a press. Moving the
				// thumb here would make it jump straight to wherever the
				// pointer went down, which reads as teleporting rather
				// than dragging. Per spec: on press, only the scale-up
				// (via `pressed`/`isInteracting`, already set above)
				// should happen; the thumb itself stays put until real
				// movement is observed on a SUBSEQUENT onMove call.
				if (isFirstMoveOfGesture) return;

				const min = dragMin();
				const max = dragMax();
				const clampedRaw = clampValue(raw, min, max);
				const isPastHalf = clampedRaw >= (min + max) / 2;

				// Live preview — reverts if you drag back, per spec. NOT a
				// commit.
				setPreviewChecked(isPastHalf);

				setThumbAnimate(false);
				setThumbX(x);
			},

			onRelease({ raw }) {
				isDragging = false;
				gestureStarted = false;
				setIsInteracting(false);
				setPressed(false);
				const min = dragMin();
				const max = dragMax();

				const next =
					dragDistance >= DRAG_THRESHOLD_PX
						? clampValue(raw, min, max) >= (min + max) / 2 // real drag: commit from final position
						: !checked(); // stationary click: just flip, like any switch

				// THE COMMIT — the only place `checked` actually changes.
				// Whatever happened mid-drag/mid-click before this was
				// preview only. For a click, setThumbX below is what
				// actually drives the slide (see the file doc comment's
				// "Click vs. drag" section) — the press scale-up has been
				// running since pointerdown and eases back down rather
				// than cutting off abruptly, since pressScale is a
				// spring, not a toggle.
				commit(next);
				setPreviewChecked(next);
				setThumbAnimate(true);
				setThumbX(restX(next));
			},
		});

		onCleanup(() => drag.destroy());
	});

	// Capture-phase, not bubble/JSX onPointerDown, for the same reason as
	// SolariumSlider: we want `pressed` (and gestureStarted-adjacent
	// state) set as early as physically possible in the event cycle,
	// before anything else attached to this element or its children gets
	// a chance to run — capture-phase listeners on an element run before
	// bubble-phase listeners on that same element or its descendants.
	onMount(() => {
		if (!trackEl) return;
		function onCaptureDown() {
			if (local.disabled) return;
			isDragging = true;
			setPressed(true);
		}
		trackEl.addEventListener("pointerdown", onCaptureDown, { capture: true });
		onCleanup(() =>
			trackEl?.removeEventListener("pointerdown", onCaptureDown, {
				capture: true,
			}),
		);
	});

	// NOTE: no separate click handler. createDrag's
	// onPointerDown/onPointerUp already produce a full onMove+onRelease
	// cycle for a plain click (a mouse click always dispatches
	// pointerdown then pointerup on the same element first) — onRelease's
	// dragDistance check above already handles "was this a click or a
	// real drag" and commits accordingly. A separate onClick handler
	// here would double-commit on every interaction.

	// Three-layer track — see file doc comment ("Three-layer track") for
	// why the squircle mask can't live on the same element as the drag
	// hit-target / thumb.
	return (
		<div
			class={`relative w-fit rounded-full ${
				local.disabled ? "opacity-50 cursor-not-allowed" : ""
			} ${local.class ?? ""}`}
			style={{
				width: `${trackWidth()}px`,
				height: `${trackHeight()}px`,
			}}
		>
			{/* Layer 2: color + squircle mask ONLY. Absolutely positioned
			    to fill the outer layout div exactly. Sits behind the
			    functional button in paint order (first in the DOM; the
			    button below isn't itself positioned so it doesn't compete
			    for stacking) — the mask clips just this color fill, never
			    the thumb. Never touched by drag logic. */}
			<Smoothed
				radius={999}
				class="smoothe absolute inset-0 rounded-full"
				style={{
					"background-color": previewChecked()
						? "var(--color-accent)"
						: "var(--color-gray-7)",
					transition: "background-color 150ms ease-out",
				}}
			/>
			<button
				type="button"
				role="switch"
				aria-checked={checked()}
				disabled={local.disabled}
				ref={trackEl}
				class="relative block w-full h-full rounded-full select-none touch-none bg-transparent"
			>
				<FluidSurface
					x={thumbX()}
					animate={thumbAnimate()}
					// Only takes effect while animate=true (the commit snap
					// on release/click) — live drag tracking is driven
					// directly by pointer position every frame and ignores
					// spring config entirely. See COMMIT_SPRING's own
					// comment for the actual {k, d} values and how to
					// retune them.
					spring={COMMIT_SPRING}
					size={thumbWidth()}
					axis="x"
					kinetic={{ preset: "position" }}
				>
					{(effects) => (
                        <div
                            class="rounded-full"
							style={{
								position: "relative",
								width: `${thumbWidth()}px`,
								height: `${thumbHeight()}px`,
								"transform-origin": "center center",
								transform: `scale(${pressScale.value()}) ${effects.kineticScale}`,
                                "will-change": "transform",
							}}
						>
							{/* Plain white capsule at rest, crossfades to
							    glass while touched */}
							<div
								class="rounded-full"
								style={{
									position: "absolute",
									inset: "0",
									"background-color": "var(--color-white)",
									opacity: pressed() || isInteracting() ? 0 : 1,
									transition: "opacity 150ms ease-out",
								}}
							/>
							<div
								class="apple-glass-clear rounded-full"
								style={{
									position: "absolute",
									inset: "0",
									"background-color": "transparent",
									opacity: pressed() || isInteracting() ? 1 : 0,
									transition: "opacity 150ms ease-out",
								}}
							/>
						</div>
					)}
				</FluidSurface>
			</button>
		</div>
	);
};
