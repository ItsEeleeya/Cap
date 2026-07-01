import { createDerivedSpring } from "@solid-primitives/spring";
import { createTween } from "@solid-primitives/tween";
import type { ComponentProps } from "solid-js";
import { createSignal, onCleanup, splitProps } from "solid-js";

/**
 * Elastic Surface
 *
 * Pointer-driven elasticity for any element. Three independent effects,
 * all driven off one signal and springed together:
 *
 *  - translate: moves a small amount toward the drag direction, PLUS an
 *               edge-anchoring compensation so the stretch reads as
 *               "pulled from this side" rather than growing symmetrically.
 *  - stretch:   elongates along the drag axis, growing with distance,
 *               with NO stretch at all for a stationary click.
 *  - press:     a small flat scale bump while held, independent of stretch.
 *
 * Movement velocity (see `notifyVelocity`/`notifyMoved`) drives a SEPARATE
 * squash/stretch effect through its own, bouncier spring — see the
 * "Movement elasticity" section below. Pass `autoVelocity: true` in
 * `ElasticSurfaceOptions` to have this measured automatically whenever a
 * layout reflow (e.g. a flex-container resize) moves the element, with no
 * manual position tracking required — see "Auto velocity" below.
 *
 * Axis can also be restricted to "x" or "y" so this same engine can later
 * be reused for elastic sliders.
 */

interface ElasticTarget {
	[key: string]: number;
	tx: number;
	ty: number;
	sx: number;
	sy: number;
}

const REST: ElasticTarget = { tx: 0, ty: 0, sx: 1, sy: 1 };

interface SquashTarget {
	[key: string]: number;
	sx: number;
	sy: number;
}

const SQUASH_REST: SquashTarget = { sx: 1, sy: 1 };

/** easeOutCubic: quick rise, smooth landing, no overshoot. */
function easeOutCubic(t: number): number {
	const inv = 1 - t;
	return 1 - inv * inv * inv;
}

/** Small helper to avoid depending on Math.tanh lib support. */
function tanh(x: number): number {
	if (x === Number.POSITIVE_INFINITY) return 1;
	if (x === Number.NEGATIVE_INFINITY) return -1;
	const ex = Math.exp(x);
	const emx = Math.exp(-x);
	return (ex - emx) / (ex + emx);
}

export type ElasticityAxis = "both" | "x" | "y";

/**
 * Every tunable knob for one input mode (cursor or touch). Pass a full
 * profile, or a partial one merged over a default (see
 * `cursorProfile`/`touchProfile`/`resolveProfile` below).
 */
export interface ElasticProfile {
	/** Max translation in px at saturating distance, BEFORE edge-anchor compensation is added. */
	maxTranslate: number;
	/** Max additional stretch as a fraction (0.12 = up to +12% elongation along the pull axis). */
	maxStretch: number;
	/** How much the cross-axis squeezes per unit of "along" stretch. 0 = no squeeze, 1 = fully reciprocal. */
	squeezeRatio: number;
	/** Distance in px at which stretch/translate reach ~63% of max (tanh saturation curve). Larger = needs a longer drag before it maxes out, i.e. feels stiffer/subtler near the start. */
	falloffDistance: number;
	/** Flat scale multiplier applied while pressed/held, on top of any directional stretch. 1.0 = no press effect. */
	pressScale: number;
	/** Duration in ms for the press-scale to ease IN on pointerdown. Independent of the spring — see `createTween`. */
	pressInMs: number;
	/** Duration in ms for the press-scale to ease back OUT on release. */
	pressOutMs: number;
	/** Which axis the drag-pull elasticity (translate + stretch above) reacts on. */
	elasticityAxis: ElasticityAxis;

	// --- Movement elasticity (velocity-driven squash/stretch) ---
	/** Master toggle for velocity-driven elasticity. When false, `notifyVelocity`/`notifyMoved` are no-ops. */
	velocityEnabled: boolean;
	/**
	 * Max squash/stretch fraction at saturating speed (0.3 = the slow axis
	 * shrinks to 0.7x while the fast axis grows to 1.3x). Mirrors the
	 * "0.7 floor" shape of a squash-by-speed effect: linear ramp from 0 up
	 * to this cap, then clamped flat — speed past the saturation point
	 * doesn't squash further.
	 */
	movementMaxSquash: number;
	/** Speed in px/s at which the squash/stretch ramp fully saturates (hits `movementMaxSquash`). Below this it's a linear ramp. */
	movementSaturationSpeed: number;
	/**
	 * Spring stiffness for the movement squash/stretch, in
	 * @solid-primitives/spring per-frame units. Deliberately separate
	 * from `springStiffness` (the drag-pull spring) — movement is meant
	 * to feel bouncier/livelier than the calmer drag-pull settle.
	 */
	movementSpringStiffness: number;
	/** Spring damping for the movement squash/stretch. Lower relative to stiffness = more bounce. */
	movementSpringDamping: number;

	/**
	 * Spring stiffness, in @solid-primitives/spring per-frame units.
	 * Higher = snaps back faster.
	 */
	springStiffness: number;
	/**
	 * Spring damping, same units. This is the main "how stiff/dampened
	 * does it feel" knob: as damping rises relative to stiffness, bounce
	 * shrinks toward a smooth dead-glide with no overshoot at all. Above
	 * roughly `damping > 2*sqrt(stiffness)` there's no oscillation left.
	 */
	springDamping: number;
}

/**
 * Cursor default: tight and quick drag-pull with a very gentle settle
 * (no real bounce), but a snappy, mildly bouncy movement squash/stretch.
 */
export const cursorProfile: ElasticProfile = {
	maxTranslate: 1.5,
	maxStretch: 0.02,
	squeezeRatio: 0.9,
	falloffDistance: 300,
	pressScale: 1.025,
	pressInMs: 150,
	pressOutMs: 250,
	elasticityAxis: "both",

	velocityEnabled: true,
	movementMaxSquash: 0.22,
	movementSaturationSpeed: 1800,
	movementSpringStiffness: 0.26,
	movementSpringDamping: 0.55,

	springStiffness: 0.1,
	springDamping: 0.3,
};

/**
 * Touch default: looser drag-pull, and a touch more give + bounce on
 * movement than cursor — still controlled, not floppy.
 */
export const touchProfile: ElasticProfile = {
	maxTranslate: 10,
	maxStretch: 0.08,
	squeezeRatio: 0.55,
	falloffDistance: 200,
	pressScale: 1.04,
	pressInMs: 90,
	pressOutMs: 250,
	elasticityAxis: "both",

	velocityEnabled: true,
	movementMaxSquash: 0.3,
	movementSaturationSpeed: 1500,
	movementSpringStiffness: 0.22,
	movementSpringDamping: 0.46,

	springStiffness: 0.08,
	springDamping: 0.3,
};

/** Merge a partial profile over one of the named defaults. */
export function resolveProfile(
	base: ElasticProfile,
	overrides?: Partial<ElasticProfile>,
): ElasticProfile {
	if (!overrides) return base;
	return { ...base, ...overrides };
}

export interface ElasticSurfaceOptions {
	/** Which named default to start from. Default "cursor". Ignored if `profile` is provided. */
	mode?: "cursor" | "touch";
	/** A full profile, or a partial one merged over `mode`'s default. */
	profile?: Partial<ElasticProfile>;
	/**
	 * Opt-in: automatically measure this element's own layout position via
	 * a ResizeObserver on its parent (catches flex/grid reflows, container
	 * resizes, sibling insertions — anything that moves the element
	 * without the element's own size changing) and feed the resulting
	 * velocity into the same path as `notifyVelocity`. Off by default —
	 * explicit opt-in, since it adds a ResizeObserver per instance.
	 * `notifyVelocity`/`notifyMoved` remain available regardless, for
	 * manual control (e.g. driving velocity from your own drag-reorder
	 * logic) — both modes can coexist; whichever calls last wins for that
	 * frame, same as pointer-drag vs movement already do.
	 */
	autoVelocity?: boolean;
}

function pickBase(mode: "cursor" | "touch" | undefined): ElasticProfile {
	return mode === "touch" ? touchProfile : cursorProfile;
}

export function createElasticSurface(options: ElasticSurfaceOptions = {}) {
	const profile = resolveProfile(pickBase(options.mode), options.profile);
	// const profile = touchProfile;

	const [target, setTarget] = createSignal<ElasticTarget>(REST);
	const spring = createDerivedSpring(target, {
		stiffness: profile.springStiffness,
		damping: profile.springDamping,
	});

	// Movement squash/stretch gets its OWN spring, deliberately separate
	// and bouncier than the drag-pull spring above — see
	// `movementSpringStiffness`/`movementSpringDamping`.
	const [movementTarget, setMovementTarget] =
		createSignal<SquashTarget>(SQUASH_REST);
	const movementSpring = createDerivedSpring(movementTarget, {
		stiffness: profile.movementSpringStiffness,
		damping: profile.movementSpringDamping,
	});

	// Press scale is intentionally NOT part of either spring target above —
	// a physical spring can't be reshaped into an arbitrary "ease out"
	// curve, so press gets its own small RAF tween with a real easing
	// function. It still composes multiplicatively with stretch in
	// `transform()` below.
	const [pressScaleTarget, setPressScaleTarget] = createSignal(1);
	const pressTween = createTween(pressScaleTarget, {
		ease: easeOutCubic,
		duration: profile.pressInMs,
	});

	let el: HTMLElement | null = null;
	let activePointerId: number | null = null;
	let downX = 0;
	let downY = 0;
	// Measured once per gesture (on pointerdown), not in the frame loop.
	let halfWidth = 0;
	let halfHeight = 0;

	let velocityEnabled = profile.velocityEnabled;
	let elasticityAxis: ElasticityAxis = profile.elasticityAxis;

	function applyAxis(dx: number, dy: number): { dx: number; dy: number } {
		if (elasticityAxis === "x") return { dx, dy: 0 };
		if (elasticityAxis === "y") return { dx: 0, dy };
		return { dx, dy };
	}

	function computeTarget(rawDx: number, rawDy: number): ElasticTarget {
		const { dx, dy } = applyAxis(rawDx, rawDy);
		const dist = Math.sqrt(dx * dx + dy * dy);

		// direction unit vector (zero when stationary)
		const nx = dist > 0.001 ? dx / dist : 0;
		const ny = dist > 0.001 ? dy / dist : 0;

		// stretch: zero at dist=0 (so a plain click never stretches), grows
		// with distance via tanh saturation, unbounded by element size.
		const stretchFactor = tanh(dist / profile.falloffDistance);
		const stretchAmount = stretchFactor * profile.maxStretch;
		// elongate along the drag axis, squeeze the perpendicular axis —
		// decomposed onto screen X/Y the same way a directional stretch
		// tensor projects onto its axes.
		const along = 1 + stretchAmount;
		const across = 1 - stretchAmount * profile.squeezeRatio;
		const sxStretch = across + (along - across) * nx * nx;
		const syStretch = across + (along - across) * ny * ny;

		// translate: small fraction of the raw delta toward the pull...
		const translateFactor = tanh(dist / (profile.falloffDistance * 1.6));
		const translateMag = translateFactor * profile.maxTranslate;
		const baseTx = nx * translateMag;
		const baseTy = ny * translateMag;

		// ...PLUS the edge-anchor compensation: half of the extra length
		// the scale added, in the pull direction. This is what makes the
		// far edge stay roughly put while the near (pulled) edge extends —
		// without it, scale() alone grows symmetrically from the center
		// and never visually reads as "pulled from this side."
		const anchorTx = nx * halfWidth * (sxStretch - 1);
		const anchorTy = ny * halfHeight * (syStretch - 1);

		return {
			tx: baseTx + anchorTx,
			ty: baseTy + anchorTy,
			sx: sxStretch,
			sy: syStretch,
		};
	}

	function localDelta(
		clientX: number,
		clientY: number,
	): { dx: number; dy: number } {
		return { dx: clientX - downX, dy: clientY - downY };
	}

	let lastZIndex = "";
	function onPointerDown(e: PointerEvent): void {
		if (!el) return;
		activePointerId = e.pointerId;
		downX = e.clientX;
		downY = e.clientY;
		// One layout read per gesture, not per frame.
		const rect = el.getBoundingClientRect();
		halfWidth = rect.width / 2;
		halfHeight = rect.height / 2;
		el.setPointerCapture?.(e.pointerId);
		// Zero delta at the instant of press: stretch/translate target is
		// untouched, only the press tween kicks in.
		setTarget(computeTarget(0, 0));
		setPressScaleTarget(profile.pressScale);
		lastZIndex = el.style.zIndex;
		el.style.zIndex = "999";
	}

	function onPointerMove(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		const { dx, dy } = localDelta(e.clientX, e.clientY);
		setTarget(computeTarget(dx, dy));
	}

	function onPointerUp(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		activePointerId = null;
		setTarget(computeTarget(0, 0));
		setPressScaleTarget(1);
		if (el) el.style.zIndex = lastZIndex;
	}

	function onPointerCancel(e: PointerEvent): void {
		if (activePointerId !== e.pointerId) return;
		activePointerId = null;
		setTarget(computeTarget(0, 0));
		setPressScaleTarget(1);
	}

	function bind(node: HTMLElement): void {
		el = node;
		node.addEventListener("pointerdown", onPointerDown);
		node.addEventListener("pointermove", onPointerMove);
		node.addEventListener("pointerup", onPointerUp);
		node.addEventListener("pointercancel", onPointerCancel);
		if (options.autoVelocity) startAutoVelocity(node);
	}

	function unbind(): void {
		stopAutoVelocity();
		if (!el) return;
		el.removeEventListener("pointerdown", onPointerDown);
		el.removeEventListener("pointermove", onPointerMove);
		el.removeEventListener("pointerup", onPointerUp);
		el.removeEventListener("pointercancel", onPointerCancel);
		el = null;
	}

	// --- Auto velocity ---------------------------------------------------
	//
	// Opt-in (see `ElasticSurfaceOptions.autoVelocity`). Observes the
	// element's PARENT for size changes — that's what actually fires when
	// a flex/grid container reflows — and on each callback re-measures
	// the element's own layout position via `offsetLeft`/`offsetTop`.
	// Those two are deliberately used instead of `getBoundingClientRect()`:
	// `transform` (which is what we use for all our own animation) does
	// NOT affect layout, only paint, so offsetLeft/offsetTop stay
	// unaffected by our own translate/scale — getBoundingClientRect()
	// would instead measure our own animated offset and corrupt the
	// velocity signal with feedback from itself.
	//
	// Cost: one ResizeObserver per instance, only when opted in; the
	// callback only fires on actual layout-affecting size changes, not
	// every frame, so this stays idle (zero work) the rest of the time.
	let resizeObserver: ResizeObserver | null = null;
	let autoLastX: number | null = null;
	let autoLastY: number | null = null;
	let autoLastTime = 0;
	let autoIdleTimer = 0;

	function measureOffset(node: HTMLElement): { x: number; y: number } {
		return { x: node.offsetLeft, y: node.offsetTop };
	}

	function startAutoVelocity(node: HTMLElement): void {
		const parent = node.parentElement;
		if (!parent || typeof ResizeObserver === "undefined") return;

		resizeObserver = new ResizeObserver(() => {
			const now = performance.now();
			const { x, y } = measureOffset(node);

			// Resize observer fires once per layout-affecting change; if no
			// further callback arrives within this window, treat movement
			// as stopped and relax velocity back to zero — otherwise the
			// last computed velocity (and its squash/stretch) would stay
			// frozen forever once a resize sequence ends.
			window.clearTimeout(autoIdleTimer);
			autoIdleTimer = window.setTimeout(() => {
				autoLastX = null;
				autoLastY = null;
				notifyVelocity(0, 0);
			}, 120);

			if (autoLastX === null || autoLastY === null) {
				autoLastX = x;
				autoLastY = y;
				autoLastTime = now;
				return;
			}

			const dt = (now - autoLastTime) / 1000;
			if (dt <= 0) {
				autoLastX = x;
				autoLastY = y;
				autoLastTime = now;
				return;
			}

			const vx = (x - autoLastX) / dt;
			const vy = (y - autoLastY) / dt;
			autoLastX = x;
			autoLastY = y;
			autoLastTime = now;
			notifyVelocity(vx, vy);
		});

		resizeObserver.observe(parent);
	}

	function stopAutoVelocity(): void {
		window.clearTimeout(autoIdleTimer);
		resizeObserver?.disconnect();
		resizeObserver = null;
		autoLastX = null;
		autoLastY = null;
	}

	// --- Movement elasticity -------------------------------------------
	//
	// This is intentionally a DIFFERENT mechanism from the drag-pull
	// stretch above. Drag-pull measures distance from a fixed down-point
	// and points away from it. Movement instead measures instantaneous
	// SPEED and points along the direction of travel: the axis aligned
	// with motion stretches, the perpendicular axis squashes — like a
	// ball compressing as it flies, not like dough being pulled from one
	// side. It's a linear ramp from 0 up to `movementMaxSquash`,
	// saturating (clamping flat) at `movementSaturationSpeed` px/s,
	// fed through its own bouncier spring.

	function computeMovementTarget(vx: number, vy: number): SquashTarget {
		if (!velocityEnabled) return SQUASH_REST;
		const { dx: avx, dy: avy } = applyAxis(vx, vy);
		const speed = Math.sqrt(avx * avx + avy * avy);
		if (speed < 0.001) return SQUASH_REST;

		const nx = avx / speed;
		const ny = avy / speed;
		const t = Math.min(1, speed / profile.movementSaturationSpeed);
		const squash = 1 - t * profile.movementMaxSquash;
		const stretch = 1 + t * profile.movementMaxSquash;
		const sx = squash + (stretch - squash) * nx * nx;
		const sy = squash + (stretch - squash) * ny * ny;
		return { sx, sy };
	}

	/**
	 * Report the element's current movement velocity (px/s), so a
	 * programmatic move (drag-reorder, layout spring, snapping into
	 * place, etc) — or the pointer drag itself — gets a speed-based
	 * squash/stretch. Call this from whatever loop already knows the
	 * element's velocity. Pass (0, 0) once movement stops to relax back
	 * to neutral.
	 */
	function notifyVelocity(vx: number, vy: number): void {
		setMovementTarget(computeMovementTarget(vx, vy));
	}

	// For callers who'd rather report raw position than compute their
	// own velocity: feed (x, y, timestampMs) each frame and this derives
	// velocity from the delta since the last call, then forwards to
	// notifyVelocity. Timestamp should be a performance.now()-style
	// monotonic clock, not Date.now(), to avoid clock-adjustment jumps.
	let lastMoveX: number | null = null;
	let lastMoveY: number | null = null;
	let lastMoveTime = 0;

	function notifyMoved(x: number, y: number, timestampMs: number): void {
		if (lastMoveX === null || lastMoveY === null) {
			lastMoveX = x;
			lastMoveY = y;
			lastMoveTime = timestampMs;
			return;
		}
		const dt = (timestampMs - lastMoveTime) / 1000;
		if (dt <= 0) return;
		const vx = (x - lastMoveX) / dt;
		const vy = (y - lastMoveY) / dt;
		lastMoveX = x;
		lastMoveY = y;
		lastMoveTime = timestampMs;
		notifyVelocity(vx, vy);
	}

	/** Reset the internal velocity tracker, e.g. after a teleport/reset that shouldn't register as movement. */
	function resetMovementTracking(): void {
		lastMoveX = null;
		lastMoveY = null;
		setMovementTarget(SQUASH_REST);
	}

	function setVelocityEnabled(next: boolean): void {
		velocityEnabled = next;
		if (!next) setMovementTarget(SQUASH_REST);
	}

	function setElasticityAxis(next: ElasticityAxis): void {
		elasticityAxis = next;
	}

	function transform(): string {
		const s = spring();
		const m = movementSpring();
		const press = pressTween();
		const sx = s.sx * m.sx * press;
		const sy = s.sy * m.sy * press;
		return `translate(${s.tx}px, ${s.ty}px) scale(${sx}, ${sy})`;
	}

	return {
		bind,
		unbind,
		notifyVelocity,
		notifyMoved,
		resetMovementTracking,
		setVelocityEnabled,
		setElasticityAxis,
		spring,
		movementSpring,
		pressTween,
		transform,
		profile,
	};
}

/**
 * Ready-to-use Solid component wrapping createElasticSurface.
 *
 * Pass either `mode="touch"` to start from the touch default, or a full
 * `profile` object, or a `profile` partial to override individual knobs
 * on top of `mode`'s default — e.g.
 * `mode="touch" profile={{ movementMaxSquash: 0.4 }}`.
 */
export function ElasticSurface(
	props: ComponentProps<"div"> & ElasticSurfaceOptions,
) {
	const [local, options, rest] = splitProps(
		props,
		["children", "class", "style"],
		["mode", "profile", "autoVelocity"],
	);

	const surface = createElasticSurface(options);
	onCleanup(surface.unbind);

	return (
		<div
			{...rest}
			class={local.class}
			ref={surface.bind}
			style={{
				...(typeof local.style === "object" ? local.style : {}),
				"will-change": "transform",
				transform: surface.transform(),
			}}
		>
			{local.children}
		</div>
	);
}

/**
 * NOTE: keep `transform: surface.transform()` written inline in the JSX
 * style object as shown — Solid's compiler wraps each dynamic style
 * property in its own effect, so this re-runs every spring tick. Don't
 * hoist `surface.transform()` into a variable above the JSX first, since
 * that would read it once outside Solid's tracking.
 */
