import { batch, createSignal, onCleanup } from "solid-js";
import { type SpringPreset, springStep } from "~/utils/springs";
import { createVelocity } from "./velocity";

export type KineticPreset =
	| "subtle"
	| "default"
	| "bouncy"
	| "position"
	| "position-bouncy";

const PRESETS: Record<
	KineticPreset,
	{
		stretch: number;
		maxStretch: number;
		coupling: number;
		spring: SpringPreset;
	}
> = {
	// Barely-there. Confirms interaction without drawing attention.
	// Best for: dense UIs, small controls, professional / utility contexts.
	subtle: {
		stretch: 0.00014,
		maxStretch: 0.18,
		coupling: 0.5,
		spring: { k: 380, d: 28 },
	},

	// Noticeable stretch + visible vertical squash. Safe default for most controls.
	// Best for: sliders, toggles, standard nav, anything product-facing.
	default: {
		stretch: 0.00028,
		maxStretch: 0.3,
		coupling: 0.6,
		spring: { k: 240, d: 17 },
	},

	// Strong deformation, clear stop-bounce, Y squash is obvious.
	// Best for: segmented controls, tab bars, prominent interactive elements.
	bouncy: {
		stretch: 0.00048,
		maxStretch: 0.42,
		coupling: 0.7,
		spring: { k: 160, d: 10 },
	},

	// "default" feel calibrated for pixel-coordinate input via push(px).
	// Best for: draggable indicators, sliding selections, position-tracked elements.
	position: {
		stretch: 0.0012,
		maxStretch: 0.3,
		coupling: 0.6,
		spring: { k: 240, d: 17 },
	},

	// "bouncy" feel calibrated for pixel-coordinate input via push(px).
	// Best for: draggable segmented controls, thumb scrubbers.
	"position-bouncy": {
		stretch: 0.0022,
		maxStretch: 0.42,
		coupling: 0.7,
		spring: { k: 160, d: 10 },
	},
};

export interface KineticConfig {
	preset?: KineticPreset;
	stretch?: number;
	maxStretch?: number;
	/**
	 * How Y responds to X's deviation from rest.
	 * Positive = Y shrinks when X stretches (squash-and-stretch, blob feel).
	 * Negative = Y grows with X (uniform pulse feel, what you get at -0.5).
	 *   0    = Y doesn't move at all
	 *   0.5  = gentle squash
	 *   0.6  = default — clearly visible vertical squeeze
	 *   1.0  = full volume conservation
	 *   1.5+ = exaggerated cartoon blob
	 *  -0.5  = both axes grow together (breathing/pulse effect)
	 */
	coupling?: number;
	spring?: SpringPreset;
}

// ── Shared RAF loop ────────────────────────────────────────────────────────

type TickFn = (dt: number) => boolean;
const tickers = new Map<object, TickFn>();
let rafId = 0,
	lastTime = 0;

function loop(now: number) {
	const dt = Math.min((now - lastTime) / 1000, 0.064);
	lastTime = now;
	for (const [key, tick] of tickers) if (!tick(dt)) tickers.delete(key);
	rafId = tickers.size > 0 ? requestAnimationFrame(loop) : 0;
}

function schedule(key: object, tick: TickFn) {
	tickers.set(key, tick);
	if (!rafId) {
		lastTime = performance.now();
		rafId = requestAnimationFrame(loop);
	}
}

// ── API ────────────────────────────────────────────────────────────────────

export interface KineticApi {
	scaleX: () => number;
	scaleY: () => number;
	push: (value: number) => void;
	inject: (velocityPerSecond: number) => void;
	release: () => void;
	wake: () => void;
	watchElement: (el: Element, trigger?: Element) => () => void;
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createKinetic(config: KineticConfig = {}): KineticApi {
	const base = PRESETS[config.preset ?? "default"];

	const stretch = config.stretch ?? base.stretch;
	const maxStretch = config.maxStretch ?? base.maxStretch;
	const coupling = config.coupling ?? base.coupling;
	const preset = config.spring ?? base.spring;

	let sxPos = 1,
		sxVel = 0,
		syPos = 1,
		syVel = 0;
	const [scaleX, setScaleX] = createSignal(1);
	const [scaleY, setScaleY] = createSignal(1);

	const key = {};
	const vel = createVelocity(() => schedule(key, tick));

	function tick(dt: number): boolean {
		const speed = Math.abs(vel.current);
		const direction = Math.sign(vel.current);

		// ── X axis: velocity-driven stretch along direction of travel ──────────
		// Signed, not just magnitude — moving forward pulls X above 1 (squish
		// on Y below), moving backward pushes X below 1 (stretch on Y below),
		// symmetric in both directions. `direction` is 0 exactly at rest, which
		// correctly aims the spring back at 1 with no squash/stretch bias.
		const stretchAmt = Math.min(speed * stretch, maxStretch);
		const targetSx = 1 + direction * stretchAmt;
		[sxPos, sxVel] = springStep(sxPos, sxVel, targetSx, dt, preset.k, preset.d);

		// ── Y axis: coupled to X via volume conservation ───────────────────────
		// targetSy mirrors however far sxPos has deviated from 1, in whichever
		// direction that deviation runs:
		//
		// sxPos > 1 (moving forward, or overshooting back through 1 after a
		//   backward stop)   → targetSy < 1 (thinned / squished)
		// sxPos < 1 (moving backward, or overshooting back through 1 after a
		//   forward stop)    → targetSy > 1 (bulged / stretched)
		//
		// A sudden stop from either direction still rings: the X spring
		// overshoots past 1 on the way back to rest (underdamped), which
		// briefly pulls targetSy to the *opposite* sign of whatever direction
		// you were just moving — same mechanism as before, just no longer
		// the only way to reach sxPos < 1.
		const xDev = sxPos - 1;
		const targetSy = 1 - xDev * coupling;
		[syPos, syVel] = springStep(syPos, syVel, targetSy, dt, preset.k, preset.d);

		// Batch both signal writes into one Solid notification pass.
		// Skip the write entirely when the value hasn't moved enough to matter —
		// sub-pixel changes don't affect the rendered transform string.
		const eps = 0.0004;
		const sxChanged = Math.abs(sxPos - scaleX()) > eps;
		const syChanged = Math.abs(syPos - scaleY()) > eps;
		if (sxChanged || syChanged)
			batch(() => {
				if (sxChanged) setScaleX(sxPos);
				if (syChanged) setScaleY(syPos);
			});

		const done =
			speed < 0.15 &&
			Math.abs(sxPos - 1) < eps &&
			Math.abs(sxVel) < eps &&
			Math.abs(syPos - 1) < eps &&
			Math.abs(syVel) < eps;

		if (done) {
			sxPos = syPos = 1;
			sxVel = syVel = 0;
			batch(() => {
				setScaleX(1);
				setScaleY(1);
			});
		}
		return !done;
	}

	function watchElement(el: Element, trigger?: Element): () => void {
		const watched = trigger ?? el;
		let prevX = 0,
			prevY = 0,
			prevT = 0,
			pending = 0,
			scheduled = false;

		function sample(now: number) {
			scheduled = false;
			const r = el.getBoundingClientRect();
			if (prevT === 0) {
				prevX = r.left;
				prevY = r.top;
				prevT = now;
				return;
			}
			const dt = now - prevT;
			if (dt < 4) return;
			const dx = r.left - prevX,
				dy = r.top - prevY;
			if (Math.abs(dx) >= 0.5 || Math.abs(dy) >= 0.5) {
				vel.inject(((Math.abs(dx) >= Math.abs(dy) ? dx : dy) / dt) * 1000);
				schedule(key, tick);
			}
			prevX = r.left;
			prevY = r.top;
			prevT = now;
		}

		const observer = new ResizeObserver(() => {
			if (scheduled) return;
			scheduled = true;
			pending = requestAnimationFrame(sample);
		});
		observer.observe(watched);
		if (watched !== el) observer.observe(el);
		pending = requestAnimationFrame(sample);

		return () => {
			observer.disconnect();
			if (pending) cancelAnimationFrame(pending);
		};
	}

	onCleanup(() => {
		tickers.delete(key);
		vel.destroy();
	});

	return {
		scaleX,
		scaleY,
		push(v) {
			vel.push(v);
			schedule(key, tick);
		},
		inject(v) {
			vel.inject(v);
			schedule(key, tick);
		},
		release() {
			vel.release();
		},
		wake() {
			schedule(key, tick);
		},
		watchElement,
	};
}
