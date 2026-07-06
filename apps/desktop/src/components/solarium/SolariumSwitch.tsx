/**
 * Switch.tsx
 *
 * A binary toggle sharing FluidSurface's physics (position spring + kinetic
 * squash/stretch) with SolariumSlider's thumb — same drag primitive
 * (createDrag), same rubber-band feel, same size scale/proportions. Unlike
 * a slider, the state is boolean and only COMMITS when the gesture ends
 * (onRelease, which also fires for a plain click). During a drag, the
 * thumb tracks the pointer and the active-color preview follows live
 * (crossing 50% previews the coming commit, dragging back reverts it), but
 * nothing is committed to `checked` until release. A release with
 * negligible movement just flips the boolean instead of committing from
 * position — see onRelease's dragDistance check.
 *
 * ── Track geometry ───────────────────────────────────────────────────────
 *
 * Track width is trackWidthRatio × thumb width (default 1.55). Thumb
 * proportions match SolariumSlider's pill, so the same `size` scale
 * produces a visually consistent thumb across both components.
 *
 * ── Visual track vs. real (functional) track ────────────────────────────
 *
 * Two different elements, not one element styled to look bigger:
 *
 *   - The REAL track (`<button ref={trackEl}>`) is the actual drag
 *     hit-target createDrag measures against, sized exactly to the
 *     thumb's height so every geometry calculation only has to reason
 *     about one height. Fully invisible.
 *   - The VISUAL track (the outer `Smoothed` div) is what's actually
 *     seen — larger by TRACK_VISUAL_PADDING px on every side, carrying
 *     the squircle mask and on/off color fill. Purely decorative: no
 *     pointer handlers, no ref drag logic reads.
 *
 * A single element can't simultaneously be "the exact size createDrag
 * measures for 1:1 pointer math" and "visually bigger for padding" —
 * padding on the real track would shift where drag coordinates land
 * relative to what's rendered. Two elements, real one centered inside
 * visual one via an inset of TRACK_VISUAL_PADDING, keeps drag math exact
 * while letting the visual track look as padded as wanted.
 *
 * ── Content: white capsule <-> glass crossfade ──────────────────────────
 *
 * FluidSurface owns ONLY the transform — never content. The knob is two
 * stacked, absolutely-positioned layers (plain white capsule, and an
 * `apple-glass-clear` layer) that cross-fade opacity based on whether the
 * user is touching the thumb, rather than swapping outright (which would
 * pop instead of ease). Both live inside one wrapper carrying the
 * press-scale + kinetic squash/stretch together.
 *
 * ── Live preview vs. commit ──────────────────────────────────────────────
 *
 * `previewChecked` drives the active-color fill/crossfade and updates
 * continuously, reverting if you drag back past 50%. `checked` (the real
 * committed boolean) only updates in onRelease/keyboard activation. These
 * are deliberately separate: collapsing them would either commit mid-drag
 * or fail to preview at all.
 *
 * ── Settle-lockout, and the three-phase commit choreography ─────────────
 *
 * A new pointerdown can't interrupt an in-flight commit: FluidSurface's
 * `animate=false` path is a hard teleport, not a handoff, so letting a new
 * gesture drive `thumbX` mid-animation made the thumb SNAP to the new
 * pointer position rather than sliding smoothly. Fix: while a commit is in
 * flight (`isSettling`), the switch ignores new pointer/keyboard input
 * entirely until the commit finishes.
 *
 * A commit itself is three explicit sequenced phases — scale up and hold,
 * slide, scale back down — not all at once (see beginCommit). A real drag
 * release skips the first two phases (already scaled up and positioned
 * live) and goes straight to scale-down. `isSettling` covers the whole
 * sequence, not just the slide.
 *
 * If a new gesture starts (or is still held) while a commit is playing,
 * `pointerIsDown`/`pendingFlipOnUnlock` remember what to do the instant it
 * ends — hand off into a live drag if the pointer's still down, or replay
 * a completed click as a fresh commit otherwise (see unlockIfPending).
 *
 * ── Accessibility ─────────────────────────────────────────────────────────
 *
 *   - `role="switch"` + `aria-checked` on a native `<button>`.
 *   - Keyboard: Space/Enter toggles. Arrow keys aren't wired — a switch is
 *     binary, and platforms activate it with Space/Enter only.
 *   - `focus-visible:outline` on the real track only.
 *   - `aria-label`/`aria-labelledby` passthrough — the consumer must
 *     supply one (or wrap with a `<label>`).
 *   - Both `disabled` and `aria-disabled` are set; handlers also
 *     short-circuit on `local.disabled` in case pointer-events get
 *     force-enabled via CSS.
 *   - A hidden native `<input type="checkbox">` mirrors `checked` for
 *     plain `<form>` participation (name/value, reset, autofill).
 *     `tabIndex={-1}` + `aria-hidden` — never itself focused/announced.
 *   - Not yet gated behind `prefers-reduced-motion` — would need to be
 *     threaded through at the springs/kinetic layer, outside this file.
 */

import { createEventListener } from "@solid-primitives/event-listener";
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
import { commands } from "~/utils/tauri.ts";
import Smoothed from "../smoothed";
import { applyRubberband, createDrag } from "./drag";
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
	xs: 10,
	sm: 14,
	md: 18,
	lg: 22,
	xl: 28,
};

const THUMB_SIZE_EM = 1.7;

// Thumb height, as a fraction of thumb WIDTH — keeps the pill proportion.
// The real track's height now equals the thumb's height exactly (see file
// doc comment), so there's no separate track-height ratio anymore.
const THUMB_HEIGHT_OF_WIDTH = 0.6;

// Default track-width-to-thumb-width ratio, overridable via the
// `trackWidthRatio` prop.
const DEFAULT_TRACK_WIDTH_RATIO = 1.55;

// Fixed px padding between the real (functional, invisible) track and the
// visual track drawn around it — see file doc comment's "Visual track vs.
// real track" section for why these are two separate elements.
const TRACK_VISUAL_PADDING = 2;

const RUBBER_OVERSHOOT = 8;
const RUBBER_SOFTNESS = 350;

// Spring for the commit snap (release-to-rest and click-to-rest), in the
// real { k, d } shape from ~/utils/springs's SpringPreset. Per
// springs.ts's own tuning guide: k=260,d=18 is "default" (mild bounce),
// k=380,d=28 is "snappy, minimal overshoot", k=500,d=40 is "instant, no
// bounce". Passed into FluidSurface's `spring` prop — only takes effect
// while `animate` is true (the commit snap), not during live drag
// tracking, which ignores spring config entirely since it's driven by
// the pointer directly every frame. Tightened from the original
// {k:300,d:24} — a higher k settles faster, which is part of what makes
// the overall click-to-settled sequence feel snappier.
const COMMIT_SPRING = { k: 420, d: 30 };

// The three phases of beginCommit's choreography — see its doc comment.
// SLIDE_MS is longer than the scale phases since it needs to roughly
// match how long COMMIT_SPRING (the thumb position spring) takes to
// settle, so scale-down doesn't start mid-slide.
//
// These durations do NOT try to match how long `pressScale` (springs.fluid,
// ~750ms settle) takes to visually finish — it keeps easing in the
// background on its own timeline after a phase's wait elapses; the waits
// only gate when the next phase's LOGIC runs, not when the scale spring
// visually completes.
const SCALE_UP_MS = 100;
const SLIDE_MS = 150;
const SCALE_DOWN_MS = 100;

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
	/** Accessible label — required unless the switch has visible text association elsewhere (e.g. via aria-labelledby or a wrapping <label>). */
	"aria-label"?: string;
	"aria-labelledby"?: string;
	id?: string;
	/** Name/value for native form participation (a hidden checkbox input mirrors `checked`, so this works inside a plain <form> without JS). */
	name?: string;
	value?: string;
	/**
	 * Shows iOS-style on/off glyphs inside the track: a vertical line
	 * fixed to the left position, a circle fixed to the right — matching
	 * Apple's switch. The thumb sliding over one or the other covers it;
	 * neither glyph's identity changes with state. Both fade out during
	 * drag/press and fade back in once the interaction ends.
	 */
	differentiateWithoutColor?: boolean;
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
		"name",
		"value",
		"differentiateWithoutColor",
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
	function thumbHeight() {
		return thumbWidth() * THUMB_HEIGHT_OF_WIDTH;
	}
	function trackWidthRatio() {
		return local.trackWidthRatio ?? DEFAULT_TRACK_WIDTH_RATIO;
	}
	function trackWidth() {
		return thumbWidth() * trackWidthRatio();
	}
	// Real track height == thumb height, exactly — see file doc comment.
	function trackHeight() {
		return thumbHeight();
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
	// flush inside the (real) track with no part of it crossing the
	// track's rendered boundary. This SAME range is also what bounds
	// dragging; see getConstraints below. Keeping one definition for both
	// rest and drag bounds is what prevents the thumb from being
	// draggable further than it's ever allowed to rest.
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
	const pressScale = createSpring(1, springs.default);
	createEffect(() => {
		pressScale.set(pressed() || isInteracting() ? 1.5 : 1);
	});

	let trackEl: HTMLButtonElement | undefined;

	// Tracks whether the current gesture moved enough to count as a real
	// drag (as opposed to a stationary click). createDrag fires onMove
	// once immediately on pointerdown even for a plain click (with raw =
	// the click's own position) — if onRelease always committed from
	// position, a stationary click would be forced through position math
	// instead of simply flipping, which is wrong for a switch.
	let dragDistance = 0;
	let dragStartRaw = 0;
	let dragStartThumbX = 0;
	let gestureStarted = false;
	const DRAG_THRESHOLD_PX = 4;

	// See file doc comment's "Settle-lockout" section. Plain mutable
	// state, not a signal — read only inside imperative event handlers,
	// never in JSX, so no reactivity is needed.
	let isSettling = false;

	// Tracks whether the pointer is CURRENTLY physically down, independent
	// of isSettling — a press can start, and even end, entirely within the
	// lockout window. We still record the raw position on every onMove
	// call (even ones the isSettling guard otherwise ignores) so that
	// whichever of the two lockout-end behaviors applies (see below) has
	// an accurate, current pointer position to act on.
	let pointerIsDown = false;
	let lastRawWhileLocked = 0;

	// What to do the instant lockout ends, decided by whether the pointer
	// that was active during lockout is STILL down when the choreography
	// in beginCommit finishes:
	//
	//   - Still down: the user pressed during lockout and is still
	//     holding — hand off into a live drag immediately, using their
	//     CURRENT pointer position, as if pointerdown had just happened.
	//     This is what makes "click and drag" during a commit feel like
	//     one continuous gesture rather than two separate ones.
	//   - Already released: a full click-and-release happened entirely
	//     within the lockout window, with no real movement (this only
	//     gets recorded when dragDistance stayed under threshold — see
	//     onRelease below) — replay it as a fresh commit the instant
	//     lockout ends, so the click's intent isn't silently dropped.
	let pendingFlipOnUnlock = false;

	function wait(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	// A REAL drag release is already mid-way through the three-phase
	// choreography by the time it gets here: already scaled up (from the
	// drag's own press-scale) and already at (or very near) its final
	// position (from live tracking). Replaying scale-up+slide for it would
	// be pure redundant delay before scale-down even starts — which is
	// what made release feel slow to settle. `alreadyScaledAndPositioned`
	// lets a real drag's onRelease skip straight to scale-down; a
	// stationary click/keyboard/queued replay still plays all three phases
	// from scratch. `commit()` fires IMMEDIATELY either way, before any of
	// this — consumers never wait on the cosmetic animation.
	async function beginCommit(
		next: boolean,
		alreadyScaledAndPositioned = false,
	) {
		commit(next);
		isSettling = true;

		if (!alreadyScaledAndPositioned) {
			setPressed(true);
			setIsInteracting(true);
			await wait(SCALE_UP_MS);

			setPreviewChecked(next);
			setThumbAnimate(true);
			setThumbX(restX(next));
			await wait(SLIDE_MS);
		} else {
			// Correct any sub-pixel drift between the live drag's last
			// tracked position and the true rest position — animated, but
			// no wait, since the difference is negligible.
			setPreviewChecked(next);
			setThumbAnimate(true);
			setThumbX(restX(next));
		}

		setPressed(false);
		setIsInteracting(false);
		await wait(SCALE_DOWN_MS);

		isSettling = false;
		unlockIfPending();
	}

	// If a new gesture queued itself (or is still physically held) while
	// the choreography above was playing, act on it now that isSettling
	// has actually cleared.
	function unlockIfPending() {
		if (pointerIsDown) {
			setPressed(true);
			setIsInteracting(true);
			gestureStarted = true;
			dragStartRaw = lastRawWhileLocked;
			dragStartThumbX = thumbX();
			dragDistance = 0;
			isDragging = true;
		} else if (pendingFlipOnUnlock) {
			pendingFlipOnUnlock = false;
			beginCommit(!checked());
		}
	}

	onMount(() => {
		if (!trackEl || local.disabled) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			// Inset to the thumb CENTER's allowed range, not the raw track
			// span [0, trackWidth()] — see dragMin/dragMax's doc comment.
			getConstraints: () => ({ min: dragMin(), max: dragMax() }),

			onMove({ x, raw, isDragging: dragging }) {
				pointerIsDown = dragging;
				lastRawWhileLocked = raw;

				if (isSettling) return;

				const isFirstMoveOfGesture = !gestureStarted;
				if (isFirstMoveOfGesture) {
					dragStartRaw = raw;
					dragStartThumbX = thumbX();
					dragDistance = 0;
					gestureStarted = true;
				} else {
					dragDistance = Math.max(dragDistance, Math.abs(raw - dragStartRaw));
				}
				isDragging = dragging;
				setIsInteracting(true);
				if (!dragging) return;

				// The very first onMove of a gesture fires synchronously
				// from pointerdown itself — no actual pointer movement has
				// happened yet, just a press. Moving the thumb here would
				// make it jump straight to wherever the pointer went down.
				if (isFirstMoveOfGesture) return;

				const min = dragMin();
				const max = dragMax();

				// Delta tracking (thumb moves relative to where it already
				// was, not snapped to the pointer's absolute position — see
				// dragStartThumbX's assignment above for why) PLUS
				// rubber-band on that delta-adjusted position. The `x`
				// createDrag hands back is rubber-banded around `raw`'s
				// relationship to bounds, not around the thumb's own
				// delta-adjusted target — reusing it directly would still
				// snap to pointer-relative rubber-banding, and a plain
				// clampValue (last version) threw the rubber-band away
				// entirely, pinning flat at the edge instead of a soft
				// overshoot. applyRubberband recomputes the correct
				// elastic response for the thumb's OWN target position.
				const delta = raw - dragStartRaw;
				const targetThumbX = dragStartThumbX + delta;
				const nextThumbX = applyRubberband(
					targetThumbX,
					min,
					max,
					RUBBER_OVERSHOOT,
					RUBBER_SOFTNESS,
				);
				const isPastHalf =
					clampValue(targetThumbX, min, max) >= (min + max) / 2;

				// Haptic tick exactly when a genuine drag move crosses the
				// on/off boundary — this is the only place previewChecked
				// changes from live pointer movement, so there's no
				// ambiguity with clicks, keyboard, or beginCommit's own
				// settle-animation writes.
				if (isPastHalf !== previewChecked()) {
					commands.performHapticFeedback("alignment", "drawCompleted");
				}

				// Live preview — reverts if you drag back, per spec. NOT a
				// commit.
				setPreviewChecked(isPastHalf);

				setThumbAnimate(false);
				setThumbX(nextThumbX);
			},

			onRelease({ raw }) {
				pointerIsDown = false;

				if (isSettling) {
					// The pointer went down AND up entirely within the
					// lockout window, with (by construction — see below)
					// no real movement recorded, since we returned early
					// in onMove and never advanced dragDistance. Queue a
					// flip to replay the instant lockout ends, rather than
					// silently dropping a completed click.
					pendingFlipOnUnlock = true;
					return;
				}

				isDragging = false;
				gestureStarted = false;
				const min = dragMin();
				const max = dragMax();

				const wasRealDrag = dragDistance >= DRAG_THRESHOLD_PX;
				// Same delta-from-start math as onMove (see its comment) —
				// keeps the commit decision consistent with wherever the
				// thumb was actually last shown.
				const finalThumbX = clampValue(
					dragStartThumbX + (raw - dragStartRaw),
					min,
					max,
				);
				const next = wasRealDrag
					? finalThumbX >= (min + max) / 2 // real drag: commit from final position
					: !checked(); // stationary click: just flip, like any switch

				// See beginCommit's comment for why a real drag skips ahead.
				beginCommit(next, wasRealDrag);
			},
		});

		onCleanup(() => drag.destroy());
	});

	// Capture-phase, not bubble/JSX onPointerDown, so `pressed` (and
	// gesture-start bookkeeping) is set as early as physically possible in
	// the event cycle — capture-phase listeners on an element run before
	// bubble-phase listeners on that same element or its descendants.
	createEventListener(
		() => trackEl,
		"pointerdown",
		() => {
			if (local.disabled) return;
			pointerIsDown = true;
			if (isSettling) return; // no visible press feedback during lockout
			isDragging = true;
			setPressed(true);
		},
		{ capture: true },
	);

	// ─── Keyboard ──────────────────────────────────────────────────────────
	//
	// Space/Enter toggle, matching native <input type="checkbox"> and ARIA
	// switch conventions. Arrow keys are deliberately NOT wired to a
	// specific on/off (unlike a slider) — a switch is binary, and most
	// screen readers / platform conventions activate switches with
	// Space/Enter only, not arrows.
	function handleKeyDown(e: KeyboardEvent) {
		if (local.disabled || isSettling) return;
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			beginCommit(!checked());
		}
	}

	// NOTE: no separate click handler beyond keyboard. createDrag's
	// onPointerDown/onPointerUp already produce a full onMove+onRelease
	// cycle for a plain pointer click (a mouse click always dispatches
	// pointerdown then pointerup on the same element first) — onRelease's
	// dragDistance check already handles "was this a click or a real drag"
	// and commits accordingly. A separate onClick handler here would
	// double-commit on every pointer interaction; keyboard activation
	// (handleKeyDown) is the only path that doesn't go through createDrag
	// at all, so it needs its own explicit commit call.

	return (
		<div
			class={`relative inline-block ${
				local.disabled ? "opacity-50 cursor-not-allowed" : ""
			} ${local.class ?? ""}`}
			style={{
				width: `${trackWidth() + TRACK_VISUAL_PADDING * 2}px`,
				height: `${trackHeight() + TRACK_VISUAL_PADDING * 2}px`,
			}}
		>
			{/* VISUAL track — purely decorative. Squircle mask + color fill
			    only, nothing else goes inside Smoothed. Absolutely fills
			    this wrapper exactly; the real track (below) is a separate,
			    smaller, centered element — see file doc comment's "Visual
			    track vs. real track" section. */}
			<Smoothed
				radius={9999}
				class="absolute inset-0 rounded-full"
				style={{
					"background-color": previewChecked()
						? "var(--color-blue-9)"
						: "var(--color-gray-7)",
					transition: "background-color 150ms ease-out",
				}}
			/>

			{/* On/off differentiator glyphs, iOS-style: a vertical line
			    fixed to the left position, a circle fixed to the right —
			    matching Apple's switch exactly. Neither glyph's identity
			    changes with state; only the thumb sliding over one or the
			    other determines which is visibly covered. Positioned to
			    match the REAL track (not the padded visual track) so left/
			    right lines up with actual thumb travel. Both fade with
			    isInteracting during drag/press. */}
			<Show when={local.differentiateWithoutColor}>
				<div
					class="absolute pointer-events-none flex items-center justify-between"
					style={{
						left: `${TRACK_VISUAL_PADDING}px`,
						top: `${TRACK_VISUAL_PADDING}px`,
						width: `${trackWidth()}px`,
						height: `${trackHeight()}px`,
						padding: `0 ${halfThumb() * 0.35}px`,
						opacity: isInteracting() ? 0 : 1,
						transition: "opacity 150ms ease-out",
					}}
				>
					{/* Line — fixed to the LEFT position, always. Visible
							    (uncovered) when the thumb is on the right (on);
							    physically covered by the thumb itself when off. */}
					<svg
						width={thumbHeight() * 0.55}
						height={thumbHeight() * 0.55}
						viewBox="0 0 24 24"
						fill="none"
						classList={{ "opacity-0": !checked() }}
					>
						<line
							x1="12"
							y1="5"
							x2="12"
							y2="19"
							stroke="var(--color-white)"
							stroke-width="3.5"
							stroke-linecap="round"
						/>
					</svg>
					{/* Circle — fixed to the RIGHT position, always.
							    Visible (uncovered) when the thumb is on the left
							    (off); physically covered by the thumb when on. */}
					<svg
						width={thumbHeight() * 0.55}
						height={thumbHeight() * 0.55}
						viewBox="0 0 24 24"
						fill="none"
						classList={{ "opacity-0": checked() }}
					>
						<circle
							cx="12"
							cy="12"
							r="7"
							stroke="var(--color-white)"
							stroke-width="3"
						/>
					</svg>
				</div>
			</Show>

			{/* REAL track — the actual hit-target and drag surface,
			    invisible, inset by TRACK_VISUAL_PADDING from the visual
			    track on every side so the two appear concentric. Sized to
			    exactly trackWidth() x trackHeight() (== thumb height) — see
			    file doc comment for why these are deliberately two
			    different elements rather than one padded element. */}
			<button
				type="button"
				role="switch"
				aria-checked={checked()}
				aria-disabled={local.disabled || undefined}
				aria-label={local["aria-label"]}
				aria-labelledby={local["aria-labelledby"]}
				disabled={local.disabled}
				id={local.id}
				ref={trackEl}
				onKeyDown={handleKeyDown}
				class="absolute rounded-full select-none touch-none bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
				style={{
					left: `${TRACK_VISUAL_PADDING}px`,
					top: `${TRACK_VISUAL_PADDING}px`,
					width: `${trackWidth()}px`,
					height: `${trackHeight()}px`,
				}}
			>
				<FluidSurface
					x={thumbX()}
					animate={thumbAnimate()}
					// Only takes effect while animate=true (the commit snap
					// on release/click) — live drag tracking is driven
					// directly by pointer position every frame and ignores
					// spring config entirely.
					spring={COMMIT_SPRING}
					size={thumbWidth()}
					axis="x"
					kinetic={{
						preset: "bouncy",
					}}
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

			{/* Hidden native checkbox — purely for <form> participation
			    (name/value submit, form.reset(), :invalid with required,
			    autofill, etc). Kept in sync with `checked`, never rendered
			    visibly, never itself focused (tabIndex=-1) — the button
			    above is the real interactive/focusable element; this just
			    gives the surrounding form something standard to read. */}
			<input
				type="checkbox"
				checked={checked()}
				name={local.name}
				value={local.value}
				disabled={local.disabled}
				tabIndex={-1}
				aria-hidden="true"
				readOnly
				class="sr-only"
			/>
		</div>
	);
};
