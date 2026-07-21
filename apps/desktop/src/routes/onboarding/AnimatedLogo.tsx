import { onCleanup, onMount } from "solid-js";
import { createSpring, type SpringController, springs } from "~/utils/springs";

// ^ adjust the import path/alias to wherever utils/springs actually lives

/**
 * Ping-pongs a spring's target between two values on a fixed interval.
 * Used for the idle "breathing" once the entrance/growth animation has settled.
 * Returns a disposer that stops the loop.
 */
function pingPong(
	spring: SpringController,
	low: number,
	high: number,
	intervalMs: number,
): () => void {
	let atHigh = false;
	const id = window.setInterval(() => {
		atHigh = !atHigh;
		spring.set(atHigh ? high : low);
	}, intervalMs);
	return () => window.clearInterval(id);
}

export function AnimatedLogo(props: { class?: string }) {
	// --- Entrance: rise + fade in from 20px below ---
	const translateY = createSpring(20, springs.fluid);
	const opacity = createSpring(0, springs.snappy); // heavily damped, negligible overshoot

	// --- Growth: outer card + the two inner rings, staggered ---
	// Tuned to settle around ~600ms; nudge k/d to taste — there's no fixed
	// "duration" with a spring, just a stiffness/damping curve.
	const squareScale = createSpring(0.72, springs.fluid);
	const middleScale = createSpring(0, { k: 220, d: 17 }); // ADC9FF ring — leads
	const innerScale = createSpring(0, { k: 190, d: 15 }); // white centre — trails, slightly slower

	const cleanupFns: Array<() => void> = [];

	onMount(() => {
		// Kick off entrance + growth together.
		translateY.set(0);
		opacity.set(1);
		squareScale.set(1);
		middleScale.set(1);

		// Small stagger so the middle ring visibly leads the centre reveal —
		// matches the reference frames (solid dot → ring → full bullseye).
		const innerDelay = window.setTimeout(() => innerScale.set(1), 90);
		cleanupFns.push(() => window.clearTimeout(innerDelay));

		// Once the pop has settled, start gentle idle breathing. Each ring
		// breathes on its own period so the two don't lock into a synced pulse.
		const breatheDelay = window.setTimeout(() => {
			cleanupFns.push(pingPong(middleScale, 1, 1.05, 1700));
			cleanupFns.push(pingPong(innerScale, 1, 1.07, 2100));
		}, 700);
		cleanupFns.push(() => window.clearTimeout(breatheDelay));
	});

	onCleanup(() => {
		cleanupFns.forEach((fn) => fn());
		translateY.destroy();
		opacity.destroy();
		squareScale.destroy();
		middleScale.destroy();
		innerScale.destroy();
	});

	return (
		<div
			class={props.class}
			style={{
				transform: `translateY(${translateY.value()}px)`,
				opacity: Math.min(1, Math.max(0, opacity.value())),
			}}
		>
			<svg
				width="80"
				height="80"
				viewBox="0 0 80 80"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
				style={{ transform: `scale(${squareScale.value()})` }}
			>
				<rect x="0.5" y="0.5" width="79" height="79" rx="15.5" fill="white" />
				<rect
					x="0.5"
					y="0.5"
					width="79"
					height="79"
					rx="15.5"
					stroke="#E7EAF0"
				/>
				<path
					d="M40 72C57.6731 72 72 57.6731 72 40C72 22.3269 57.6731 8 40 8C22.3269 8 8 22.3269 8 40C8 57.6731 22.3269 72 40 72Z"
					fill="#4785FF"
				/>
				{/* translate/scale/translate keeps the origin pinned at (40,40) without
				    relying on CSS transform-origin/transform-box on an SVG child, which
				    is inconsistent across browsers */}
				<path
					d="M40.0001 66C54.3595 66 66 54.3595 66 40.0001C66 25.6405 54.3595 14 40.0001 14C25.6405 14 14 25.6408 14 40.0001C14 54.3595 25.6408 66 40.0001 66Z"
					fill="#ADC9FF"
					transform={`translate(40 40) scale(${middleScale.value()}) translate(-40 -40)`}
				/>
				<path
					d="M39.9999 60C51.0455 60 60 51.0455 60 39.9998C60 28.9542 51.0455 20 39.9999 20C28.9542 20 20 28.9542 20 39.9998C20 51.0455 28.9542 60 39.9999 60Z"
					fill="white"
					transform={`translate(40 40) scale(${innerScale.value()}) translate(-40 -40)`}
				/>
			</svg>
		</div>
	);
}
