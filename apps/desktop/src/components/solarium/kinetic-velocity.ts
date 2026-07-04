import { createSpring } from "@solid-primitives/spring";
import { type Accessor, createEffect, createSignal, onCleanup } from "solid-js";

export type KineticPreset =
	| "subtle"
	| "default"
	| "bouncy"
	| "position"
	| "position-bouncy";

interface KineticPresetConfig {
	stretch: number;
	maxStretch: number;
	coupling: number;
	stiffness: number;
	damping: number;
}

const KINETIC_PRESETS: Record<KineticPreset, KineticPresetConfig> = {
	subtle: {
		stretch: 0.00014,
		maxStretch: 0.18,
		coupling: 0.5,
		stiffness: 0.28,
		damping: 0.72,
	},
	default: {
		stretch: 0.00028,
		maxStretch: 0.3,
		coupling: 0.6,
		stiffness: 0.24,
		damping: 0.62,
	},
	bouncy: {
		stretch: 0.00048,
		maxStretch: 0.42,
		coupling: 0.7,
		stiffness: 0.2,
		damping: 0.42,
	},
	position: {
		stretch: 0.0012,
		maxStretch: 0.3,
		coupling: 0.6,
		stiffness: 0.24,
		damping: 0.62,
	},
	"position-bouncy": {
		stretch: 0.0022,
		maxStretch: 0.42,
		coupling: 0.7,
		stiffness: 0.2,
		damping: 0.42,
	},
};

export interface VelocityTrackerConfig {
	smoothing?: number;
	decayHalfLifeMs?: number;
	restThreshold?: number;
}

export interface VelocityTracker {
	velocity: Accessor<number>;
	push: (value: number) => void;
	inject: (velocityPerSecond: number) => void;
	release: () => void;
	reset: () => void;
}

export interface KineticScaleConfig {
	preset?: KineticPreset;
	stretch?: number;
	maxStretch?: number;
	coupling?: number;
	stiffness?: number;
	damping?: number;
}

export interface KineticVelocityConfig extends KineticScaleConfig {
	velocity?: VelocityTrackerConfig;
}

export interface KineticVelocity {
	scaleX: Accessor<number>;
	scaleY: Accessor<number>;
	velocity: Accessor<number>;
	push: (value: number) => void;
	inject: (velocityPerSecond: number) => void;
	release: () => void;
	reset: () => void;
}

export function createVelocityTracker(
	config: VelocityTrackerConfig = {},
): VelocityTracker {
	const smoothing = config.smoothing ?? 0.78;
	const decayHalfLifeMs = config.decayHalfLifeMs ?? 65;
	const restThreshold = config.restThreshold ?? 0.15;
	const decayPerMs = 0.5 ** (1 / decayHalfLifeMs);
	const [velocity, setVelocity] = createSignal(0);
	let previousValue = 0;
	let previousTime = 0;
	let lastDecayTime = 0;
	let rafId = 0;

	function stopDecay() {
		if (!rafId) return;
		cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function decayTick(now: number) {
		const nextVelocity = velocity() * decayPerMs ** (now - lastDecayTime);
		lastDecayTime = now;

		if (Math.abs(nextVelocity) <= restThreshold) {
			rafId = 0;
			setVelocity(0);
			return;
		}

		setVelocity(nextVelocity);
		rafId = requestAnimationFrame(decayTick);
	}

	function reset() {
		stopDecay();
		previousTime = 0;
		setVelocity(0);
	}

	onCleanup(() => {
		stopDecay();
	});

	return {
		velocity,
		push(value) {
			const now = performance.now();
			stopDecay();

			if (previousTime > 0) {
				const dt = now - previousTime;
				if (dt >= 2 && dt < 300) {
					const sampled = ((value - previousValue) / dt) * 1000;
					setVelocity(smoothing * sampled + (1 - smoothing) * velocity());
				}
			}

			previousValue = value;
			previousTime = now;
		},
		inject(velocityPerSecond) {
			stopDecay();
			previousTime = 0;
			setVelocity(velocityPerSecond);
		},
		release() {
			if (Math.abs(velocity()) <= restThreshold) {
				reset();
				return;
			}

			stopDecay();
			lastDecayTime = performance.now();
			rafId = requestAnimationFrame(decayTick);
		},
		reset,
	};
}

export function createKineticScale(
	velocity: Accessor<number>,
	config: KineticScaleConfig = {},
) {
	const base = KINETIC_PRESETS[config.preset ?? "default"];
	const stretch = config.stretch ?? base.stretch;
	const maxStretch = config.maxStretch ?? base.maxStretch;
	const coupling = config.coupling ?? base.coupling;
	const [scale, setScale] = createSpring(
		{ x: 1, y: 1 },
		{
			stiffness: config.stiffness ?? base.stiffness,
			damping: config.damping ?? base.damping,
			precision: 0.0004,
		},
	);

	createEffect(() => {
		const currentVelocity = velocity();
		const stretchAmount = Math.min(
			Math.abs(currentVelocity) * stretch,
			maxStretch,
		);
		const x = 1 + Math.sign(currentVelocity) * stretchAmount;
		void setScale({ x, y: 1 - (x - 1) * coupling });
	});

	return {
		scaleX: () => scale().x,
		scaleY: () => scale().y,
	};
}

export function createKineticVelocity(
	config: KineticVelocityConfig = {},
): KineticVelocity {
	const tracker = createVelocityTracker(config.velocity);
	const scale = createKineticScale(tracker.velocity, config);

	return {
		...scale,
		velocity: tracker.velocity,
		push: tracker.push,
		inject: tracker.inject,
		release: tracker.release,
		reset: tracker.reset,
	};
}
;
