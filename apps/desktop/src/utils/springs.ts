import { createSignal, onCleanup } from "solid-js";
/**
 * springStep — analytic spring solver for a single axis.
 *
 * Uses the closed-form solution to the damped harmonic oscillator ODE.
 * This means it's unconditionally stable at any frame rate (unlike Euler/RK4)
 * and handles tab-switch gaps (64ms+) without exploding.
 *
 * @param x   Current position
 * @param v   Current velocity (units/second)
 * @param t   Target position
 * @param dt  Delta time in SECONDS
 * @param k   Stiffness — how strong the pull toward target is. ~100–500.
 * @param d   Damping — how much to resist motion. ~10–40.
 * @returns   [newX, newV]
 *
 * Tuning guide:
 *   k=260, d=18  → mild bounce (default)
 *   k=380, d=28  → snappy, minimal overshoot
 *   k=160, d=12  → slow, wobbly, fluid
 *   k=500, d=40  → instant, no bounce
 */
export function springStep(
	x: number,
	v: number,
	t: number,
	dt: number,
	k: number,
	d: number,
): [x: number, v: number] {
	dt = Math.min(dt, 0.064); // cap at 64ms

	const x0 = x - t;
	const w = Math.sqrt(k); // natural frequency
	const z = d / (2 * w); // damping ratio

	if (z < 1) {
		// Under-damped: oscillates around target (produces bounce)
		const wd = w * Math.sqrt(1 - z * z);
		const e = Math.exp(-z * w * dt);
		const c = Math.cos(wd * dt);
		const s = Math.sin(wd * dt);
		const c1 = x0;
		const c2 = (v + z * w * x0) / wd;
		const nx = e * (c1 * c + c2 * s) + t;
		const nv = e * ((c2 * wd - c1 * z * w) * c - (c1 * wd + c2 * z * w) * s);
		return [nx, nv];
	} else {
		// Over/critically-damped: no oscillation
		const e = Math.exp(-w * dt);
		const nx = (x0 + (v + w * x0) * dt) * e + t;
		const nv = (v - (v + w * x0) * w * dt) * e;
		return [nx, nv];
	}
}

export type SpringPreset = { k: number; d: number };

export const springs = {
	snappy: { k: 380, d: 28 } satisfies SpringPreset,
	default: { k: 260, d: 18 } satisfies SpringPreset,
	fluid: { k: 160, d: 12 } satisfies SpringPreset,
	instant: { k: 500, d: 40 } satisfies SpringPreset,
} as const;

export interface SpringController {
	/** Reactive signal — use in JSX / computeds. */
	value: () => number;
	/** Animate to a new target. */
	set: (target: number) => void;
	/** Teleport to a value with no animation. */
	snap: (v: number) => void;
	/** Cancel any in-progress animation and release the RAF slot. */
	destroy: () => void;
}

const EPS = 0.0005;

/** *
 * createSpring
 * A self-driving reactive spring. Call `.set(target)` to animate toward a
 * new value; read `.value()` as a SolidJS signal in any reactive context.
 * The RAF loop sleeps automatically when the spring is at rest.
 *
 * Usage:
 *   const opacity = createSpring(0, { k: 200, d: 18 });
 *   opacity.set(1);           // animate to 1
 *   <div style={{ opacity: opacity.value() }} />
 *   onCleanup(() => opacity.destroy());
 */
export function createSpring(
	initial: number,
	preset: SpringPreset = { k: 240, d: 17 },
): SpringController {
	let pos = initial;
	let vel = 0;
	let target = initial;
	let rafId = 0;
	let lastTime = 0;

	const [value, setValue] = createSignal(initial);

	function tick(now: number) {
		const dt = Math.min((now - lastTime) / 1000, 0.064);
		lastTime = now;

		[pos, vel] = springStep(pos, vel, target, dt, preset.k, preset.d);

		const done = Math.abs(pos - target) < EPS && Math.abs(vel) < EPS;

		if (done) {
			pos = target;
			vel = 0;
			setValue(pos);
			rafId = 0;
			return;
		}

		setValue(pos);
		rafId = requestAnimationFrame(tick);
	}

	function wake() {
		if (!rafId) {
			lastTime = performance.now();
			rafId = requestAnimationFrame(tick);
		}
	}

	onCleanup(() => {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	});

	return {
		value,
		set(t) {
			target = t;
			wake();
		},
		snap(v) {
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
			pos = v;
			vel = 0;
			target = v;
			setValue(v);
		},
		destroy() {
			if (rafId) {
				cancelAnimationFrame(rafId);
				rafId = 0;
			}
		},
	};
}
