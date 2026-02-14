import { createSignal, onCleanup } from "solid-js";

// Physics configuration for "Liquid" feel
const SPRING_CONFIG = {
	stiffness: 120, // Tension
	damping: 14, // Friction (higher = less bounce, more syrup-like)
	mass: 1.2, // Weight
};

export function createSpring(options = { initialValue: 0 }) {
	const [value, setValue] = createSignal(options.initialValue ?? 0);
	const [velocity, setVelocity] = createSignal(0);

	// Target value we want to reach
	let target = options.initialValue ?? 0;

	// Physics state (kept mutable for the RAF loop to avoid signal overhead)
	let current = target;
	let v = 0;
	let animationFrameId: number;
	let isAnimating = false;

	function update() {
		const force = (target - current) * SPRING_CONFIG.stiffness;
		const acceleration = force / SPRING_CONFIG.mass;

		// Apply damping
		const dampingForce = -v * SPRING_CONFIG.damping;
		v += (acceleration + dampingForce / SPRING_CONFIG.mass) * 0.016; // assume ~60fps (16ms)
		current += v * 0.016;

		// Snap to target if very close
		if (Math.abs(v) < 0.01 && Math.abs(target - current) < 0.01) {
			current = target;
			v = 0;
			isAnimating = false;
		} else {
			animationFrameId = requestAnimationFrame(update);
		}

		// Batch updates to signals
		setValue(current);
		setVelocity(v);
	}

	function set(newTarget: number) {
		target = newTarget;
		if (!isAnimating) {
			isAnimating = true;
			update();
		}
	}

	// Immediate set without animation
	function snap(newTarget: number) {
		target = newTarget;
		current = newTarget;
		v = 0;
		setValue(newTarget);
		setVelocity(0);
		cancelAnimationFrame(animationFrameId);
		isAnimating = false;
	}

	onCleanup(() => cancelAnimationFrame(animationFrameId));

	return { value, velocity, set, snap };
}
