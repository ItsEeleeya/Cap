export interface VelocityController {
	push: (value: number) => void;
	inject: (velocityPerSecond: number) => void;
	release: () => void;
	reset: () => void;
	destroy: () => void;
	readonly current: number;
}

export function createVelocity(
	onChange?: (v: number) => void,
): VelocityController {
	const smoothing = 0.78,
		decayHalfLife = 65,
		restThreshold = 0.15;
	const decayPerMs = 0.5 ** (1 / decayHalfLife);
	let velocity = 0,
		prevValue = 0,
		prevTime = 0,
		rafId = 0,
		lastDecayTime = 0;

	const stopDecay = () => {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
	};

	function decayTick(now: number) {
		velocity *= decayPerMs ** (now - lastDecayTime);
		lastDecayTime = now;
		onChange?.(velocity);
		rafId =
			Math.abs(velocity) > restThreshold ? requestAnimationFrame(decayTick) : 0;
		if (!rafId) {
			velocity = 0;
			onChange?.(0);
		}
	}

	return {
		push(value) {
			const now = performance.now();
			stopDecay();
			if (prevTime > 0) {
				const dt = now - prevTime;
				if (dt >= 2 && dt < 300) {
					velocity =
						smoothing * (((value - prevValue) / dt) * 1000) +
						(1 - smoothing) * velocity;
					onChange?.(velocity);
				}
			}
			prevValue = value;
			prevTime = now;
		},
		inject(v) {
			stopDecay();
			velocity = v;
			prevTime = 0;
			onChange?.(velocity);
		},
		release() {
			if (Math.abs(velocity) > restThreshold) {
				lastDecayTime = performance.now();
				stopDecay();
				rafId = requestAnimationFrame(decayTick);
			} else {
				this.reset();
			}
		},
		reset() {
			stopDecay();
			velocity = 0;
			prevTime = 0;
			onChange?.(0);
		},
		destroy() {
			stopDecay();
			velocity = 0;
			prevTime = 0;
		},
		get current() {
			return velocity;
		},
	};
}
