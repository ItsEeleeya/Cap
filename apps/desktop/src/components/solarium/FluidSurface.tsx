/**
 * FluidSurface.tsx
 *
 * Supplies the physics behind SolariumSlider's thumb, and Switch's knob.
 * Not called Thumb because it isn't slider-specific.
 *
 * Deliberately EFFECTS ONLY — no owned markup, no drag ownership. Earlier
 * drafts had FluidSurface render its own pill (a white/glass div with a
 * `pressed` prop). That conflated two different concerns: "where should
 * this thing be, and how squashed" (physics, genuinely shared across
 * Slider/Switch) vs. "what does this thing look like" (a slider's pill and
 * a switch's knob want different content, different press-scale timing,
 * different crossfades — each caller's own business).
 *
 * So FluidSurface now renders nothing but a positioning wrapper, and hands
 * the caller two CSS transform strings via a render-prop `children`
 * function: `translate` (position) and `kineticScale` (squash/stretch).
 * The caller renders whatever content it wants inside, applying those
 * transforms (and its own press-scale, crossfade, whatever) itself.
 *
 * ── Contract ─────────────────────────────────────────────────────────────
 *
 *   x        — target centre position along the travel axis, in px,
 *               in whatever coordinate space the caller is using
 *               (e.g. track-local px matching createDrag's `raw`/`x`).
 *   animate  — false (default) snaps instantly, no spring travel. true
 *               animates via a spring (see `spring` prop for tuning).
 *               The caller decides per-update whether this is a live drag
 *               frame (animate=false) or a settle/commit (animate=true).
 *   spring   — optional { k, d } override (see ~/utils/springs's
 *               SpringPreset) for the position spring used when
 *               animate=true. Defaults to a critically-damped spring at
 *               springs.default's stiffness (COMMIT_SPRING below) if
 *               omitted. Pass this when a caller's commit/settle motion
 *               needs its own feel — e.g. a slower or snappier settle than
 *               the shared default — rather than forking FluidSurface
 *               itself. Takes real { k, d } values, not ms: see springs.ts's
 *               tuning guide for what k/d combinations feel like.
 *   children — (effects) => JSX.Element. Renders your own content INSIDE
 *               FluidSurface's positioning wrapper (which already applies
 *               `translate` — don't apply it yourself, or position gets
 *               applied twice). `effects.kineticScale` is the squash/
 *               stretch transform; compose it with your own press-scale
 *               (etc) into one `transform` string on your content's root,
 *               with `transform-origin: center center` so squash reads
 *               correctly. See SolariumSlider / Switch for examples.
 *
 * Kinetic velocity is sampled from the position spring's rendered output on
 * a self-managed RAF loop (not a reactive effect — see the loop below for
 * why that distinction matters). Squash/stretch happens on drag AND on
 * animated commits alike, which is correct: a spring travelling fast is
 * still fast, whether or not a human pointer is attached to it right now.
 */

import { createEffect, createMemo, type JSX, onCleanup } from "solid-js";
import { createSpring, type SpringPreset, springs } from "~/utils/springs";
import { createKinetic, type KineticConfig } from "./kinetic";

export type FluidAxis = "x" | "y";

export interface FluidEffects {
	/** CSS transform for kinetic squash/stretch (scaleX/scaleY). Compose alongside your own press-scale, etc, on your content's root. Position is handled transparently by FluidSurface's wrapper — don't apply translate yourself. */
	kineticScale: string;
}

export interface FluidSurfaceProps {
	/** Target centre position along the travel axis, in px. */
	x: number;
	/** Animate to `x` via spring (true) or snap instantly (false, default — live drag). */
	animate?: boolean;

	/**
	 * Overrides the position spring's { k, d } used when `animate` is true.
	 * Defaults to a critically-damped spring derived from springs.default's
	 * stiffness (see COMMIT_SPRING below) when omitted. Real stiffness/
	 * damping values, not a duration — see ~/utils/springs's tuning guide
	 * (e.g. { k: 380, d: 28 } for snappy-with-minimal-overshoot, { k: 500,
	 * d: 40 } for instant/no-bounce) for what a given k/d pair feels like.
	 */
	spring?: SpringPreset;

	/** Optional visible bounds for the content centre — clamps `translate` so it never exceeds these limits, e.g. for a controlled bleed window. */
	minX?: number;
	maxX?: number;
	/** Size of your content along the travel axis, in px — used ONLY to compute the centering offset (half of this). FluidSurface renders no box of its own; make sure your actual content is sized to match, or centering will be off. */
	size?: number;
	axis?: FluidAxis;

	/**
	 * Bump this (any distinct number, e.g. an incrementing counter) to inject
	 * a fixed-magnitude kinetic kick, independent of the continuous
	 * position-sampling estimate below. That estimate is derived from
	 * `x`'s actual per-frame movement, gated to a real elapsed dt (see
	 * velocity.ts's push(), which ignores samples more than 300ms apart) —
	 * fine for continuous dragging, but a caller that snaps `x` straight to a
	 * new discrete step (e.g. a slider crossing a step boundary) gets no
	 * feedback at all if the two steps happen to straddle a slow moment.
	 * `pulseId` changing is what fires the kick; `pulseVelocity`'s sign sets
	 * its direction.
	 */
	pulseId?: number;
	pulseVelocity?: number;

	kinetic?: KineticConfig;

	/** Render-prop: receives the computed transforms, renders your own content. */
	children: (effects: FluidEffects) => JSX.Element;
}

function criticallyDamped(k: number): SpringPreset {
	return { k, d: 2 * Math.sqrt(k) };
}
const COMMIT_SPRING = criticallyDamped(springs.default.k);

export function FluidSurface(props: FluidSurfaceProps) {
	function axis() {
		return props.axis ?? "x";
	}
	function size() {
		return props.size ?? 24;
	}
	function half() {
		return size() / 2;
	}

	// props.spring is read once here, at creation — the position spring is
	// constructed a single time (createSpring isn't reactive to its preset
	// argument, only its initial value), matching how COMMIT_SPRING itself
	// was always a fixed module-level constant rather than something that
	// could vary per-set(). A caller that needs a genuinely different k/d
	// per distinct animation phase should mount a new FluidSurface (e.g. via
	// a `key`/Show toggle) rather than expect this prop to hot-swap mid-life.
	const posSpring = createSpring(props.x, props.spring ?? COMMIT_SPRING);
	// x is always px (screen space), so the position-calibrated preset is
	// the sane default — see kinetic.ts presets: `default`/`subtle`/`bouncy`
	// assume roughly-0-to-100-scale input and will under-stretch at
	// realistic pixel distances.
	const k = createKinetic({ preset: "position", ...props.kinetic });

	// ── Velocity sampling ────────────────────────────────────────────────────
	//
	// IMPORTANT: k.push() unconditionally cancels any in-progress kinetic
	// decay (see createVelocity.push in kinetic.ts — stopDecay() runs before
	// anything else, every call). It's designed to be called from discrete
	// external events (pointer moves), not from something that fires every
	// animation frame.
	//
	// The position spring's own value() signal updates every RAF frame while
	// it's animating. An earlier version of this effect called k.push() as a
	// reaction to that signal — which meant push() (and its unconditional
	// stopDecay()) fired on nearly every frame, including frames where the
	// spring had already come to rest and a decay-to-rest animation was
	// trying to run. Each new push() cancelled the previous decay before it
	// could finish, so the pill would visibly get stuck mid-squash instead
	// of relaxing back to scale 1.
	//
	// Fix: run our own small RAF loop that samples posSpring.value() at a
	// steady cadence, matching what push()'s internal dt gate (2-300ms)
	// expects, and — critically — STOP SAMPLING once the position has
	// settled, calling k.release() exactly once so decay gets to run to
	// completion without anything re-cancelling it on the next frame.
	let sampleRaf = 0;
	let lastSampled: number | undefined;
	let settleFrames = 0;

	function sampleVelocity() {
		const pos = posSpring.value();
		if (lastSampled !== undefined && Math.abs(pos - lastSampled) < 0.05) {
			// Position hasn't moved meaningfully this frame — count toward
			// "settled". A couple of still frames in a row (not just one,
			// since spring output can sit still for a frame between RAF
			// ticks even mid-motion) means it's actually done moving.
			settleFrames++;
			if (settleFrames === 2) {
				k.release();
				sampleRaf = 0;
				lastSampled = undefined;
				return; // stop the loop — release() owns decay from here
			}
		} else {
			settleFrames = 0;
			k.push(pos);
		}
		lastSampled = pos;
		sampleRaf = requestAnimationFrame(sampleVelocity);
	}

	function ensureSampling() {
		if (!sampleRaf) {
			lastSampled = posSpring.value();
			settleFrames = 0;
			sampleRaf = requestAnimationFrame(sampleVelocity);
		}
	}

	createEffect(() => {
		const target = props.x;
		if (props.animate) posSpring.set(target);
		else posSpring.snap(target);
		ensureSampling();
	});

	// Discrete step feedback — see the `pulseId` doc comment above. Skips the
	// initial value so mounting with a non-zero starting pulseId doesn't fire
	// a spurious kick.
	let lastPulseId: number | undefined;
	createEffect(() => {
		const id = props.pulseId;
		if (id === undefined) return;
		if (lastPulseId !== undefined && id !== lastPulseId) {
			k.inject(props.pulseVelocity ?? 0);
			k.release();
		}
		lastPulseId = id;
	});

	onCleanup(() => {
		if (sampleRaf) cancelAnimationFrame(sampleRaf);
	});

	onCleanup(() => {
		posSpring.destroy();
	});

	function clamp(n: number, min: number, max: number) {
		return Math.min(Math.max(n, min), max);
	}

	const translate = createMemo(() => {
		const raw = posSpring.value();
		const clamped = clamp(raw, props.minX ?? raw, props.maxX ?? raw);
		const px = clamped - half();
		return axis() === "x"
			? `translate(${px}px, -50%)`
			: `translate(-50%, ${px}px)`;
	});

	const kineticScale = createMemo(() => {
		// Squash/stretch runs along the travel axis; the cross-axis takes the
		// coupled (inverse) scale from createKinetic's volume-conservation math.
		return axis() === "x"
			? `scaleX(${k.scaleX()}) scaleY(${k.scaleY()})`
			: `scaleX(${k.scaleY()}) scaleY(${k.scaleX()})`;
	});

	return (
		<div
			class={`absolute pointer-events-none ${axis() === "x" ? "top-1/2 left-0" : "top-0 left-1/2"}`}
			style={{ transform: translate() }}
		>
			{props.children?.({
				get kineticScale() {
					return kineticScale();
				},
			})}
		</div>
	);
}
