/**
 * createDrag.ts
 *
 * A pointer-based drag primitive with elastic rubber-banding past constraints.
 *
 * Rubber-band uses a tanh falloff (same shape as ElasticSurface's drag-pull
 * stretch): displacement past the edge is compressed through
 *
 *   f(x) = maxOvershoot · tanh(x / falloff)
 *
 *   where x          = raw displacement past the edge (px)
 *         maxOvershoot = elasticity · size — the ceiling the pill can ever reach
 *         falloff      = size · falloffRatio — how quickly resistance ramps up
 *
 * tanh starts near-linear (so the first few px of overshoot feel free) and
 * smoothly decelerates toward maxOvershoot with NO hard ceiling — unlike the
 * x/(1+x) asymptote, there's no point where it visually "catches" or stops;
 * it just keeps slowing asymptotically, which is what makes it read as
 * elastic rather than blocked.
 *
 * Coordinate contract:
 *
 *   raw  — pointer position in track-local px, unclamped. May be negative
 *           or exceed trackWidth. The caller derives the committed value from
 *           clamp(raw, min, max).
 *
 *   x    — visual position in track-local px, rubber-banded outside [min, max].
 *           Always moves in the right direction but with increasing resistance
 *           past the edges. Use this to position visuals — do NOT re-clamp it,
 *           that defeats the rubber band (it's already bounded by maxOvershoot).
 *
 * The constraints passed to getConstraints() are the VALUE bounds — i.e. the
 * pixel positions that correspond to minValue and maxValue. Pill-edge clamping
 * (so the pill never visually exits the track) is a separate concern handled
 * by the caller, not here.
 *
 * Usage:
 *
 *   const drag = createDrag(trackEl, {
 *     getConstraints: () => ({ min: 0, max: trackWidth() }),
 *     elasticity: 0.3,      // max overshoot as a fraction of track size
 *     falloffRatio: 0.4,    // how quickly resistance ramps up
 *     onMove: ({ x, raw, isDragging }) => { ... },
 *     onRelease: ({ raw }) => { ... },
 *   });
 *
 *   onCleanup(() => drag.destroy());
 */

export interface DragConstraints {
	min: number;
	max: number;
}

export interface DragMoveEvent {
	/** Rubber-banded visual position in track-local px. Use to position the pill. */
	x: number;
	/** Raw unclamped pointer position in track-local px. Use to compute value. */
	raw: number;
	isDragging: boolean;
}

export interface DragReleaseEvent {
	/** Raw pointer position at release, unclamped. Caller should clamp before use. */
	raw: number;
}

export interface DragConfig {
	/**
	 * Returns the current value-space constraint [min, max] in px.
	 * These are the pixel positions corresponding to minValue and maxValue.
	 * Called on every pointermove so it stays in sync with track resizes.
	 */
	getConstraints: () => DragConstraints;

	/**
	 * Maximum visual overshoot in pixels.
	 * @default 28
	 */
	maxOvershoot?: number;

	/**
	 * How soft the rubber band is.
	 * Larger = easier to pull.
	 * @default 48
	 */
	softness?: number;

	onMove?: (e: DragMoveEvent) => void;
	onRelease?: (e: DragReleaseEvent) => void;

	/** @default "x" */
	axis?: "x" | "y";
}

export interface DragHandle {
	destroy: () => void;
}

/** Small helper to avoid relying on Math.tanh's availability assumptions. */
function tanh(x: number): number {
	if (x === Number.POSITIVE_INFINITY) return 1;
	if (x === Number.NEGATIVE_INFINITY) return -1;
	const ex = Math.exp(x);
	const emx = Math.exp(-x);
	return (ex - emx) / (ex + emx);
}

export function rubberband(
	displacement: number,
	maxOvershoot: number,
	softness: number,
): number {
	if (maxOvershoot <= 0) return 0;

	return maxOvershoot * tanh(displacement / Math.max(softness, 1));
}

/**
 * Apply rubber-banding to a raw position outside [min, max].
 * Within bounds, returns raw unchanged.
 */
export function applyRubberband(
	raw: number,
	min: number,
	max: number,
	maxOvershoot: number,
	softness: number,
): number {
	if (raw < min) {
		return min - rubberband(min - raw, maxOvershoot, softness);
	}

	if (raw > max) {
		return max + rubberband(raw - max, maxOvershoot, softness);
	}

	return raw;
}

export function createDrag(el: HTMLElement, config: DragConfig): DragHandle {
	const {
		getConstraints,
		maxOvershoot = 28,
		softness = 48,
		onMove,
		onRelease,
		axis = "x",
	} = config;

	let dragging = false;
	let trackOrigin = 0;

	function pointerPos(e: PointerEvent): number {
		return axis === "x" ? e.clientX : e.clientY;
	}

	function trackLeft(): number {
		const rect = el.getBoundingClientRect();
		return axis === "x" ? rect.left : rect.top;
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 && e.pointerType === "mouse") return;
		dragging = true;
		el.setPointerCapture(e.pointerId);
		trackOrigin = trackLeft();

		const raw = pointerPos(e) - trackOrigin;
		const { min, max } = getConstraints();
		const x = applyRubberband(raw, min, max, maxOvershoot, softness);
		onMove?.({ x, raw, isDragging: true });
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const raw = pointerPos(e) - trackOrigin;
		const { min, max } = getConstraints();
		const x = applyRubberband(raw, min, max, maxOvershoot, softness);
		onMove?.({ x, raw, isDragging: true });
	}

	function onPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const raw = pointerPos(e) - trackOrigin;
		onRelease?.({ raw });
	}

	el.addEventListener("pointerdown", onPointerDown);
	el.addEventListener("pointermove", onPointerMove);
	el.addEventListener("pointerup", onPointerUp);
	el.addEventListener("pointercancel", onPointerUp);

	return {
		destroy() {
			el.removeEventListener("pointerdown", onPointerDown);
			el.removeEventListener("pointermove", onPointerMove);
			el.removeEventListener("pointerup", onPointerUp);
			el.removeEventListener("pointercancel", onPointerUp);
		},
	};
}
