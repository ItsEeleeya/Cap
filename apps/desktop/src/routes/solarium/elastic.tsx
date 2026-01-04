import { animate, spring } from "@motionone/dom";
import { type Accessor, onCleanup } from "solid-js";

// Types for our directive options
interface ElasticOptions {
	value: Accessor<number>;
	min: number;
	max: number;
	orientation?: "horizontal" | "vertical";
	maxScale?: number; // Default 1.25
}

// Extend JSX namespace for TypeScript support
declare module "solid-js" {
	namespace JSX {
		interface Directives {
			elastic: ElasticOptions;
		}
	}
}

export function elastic(el: HTMLElement, accessor: Accessor<ElasticOptions>) {
	const getOptions = accessor;

	// State
	let startX = 0;
	let startY = 0;
	let isDragging = false;

	const handlePointerDown = (e: PointerEvent) => {
		// Only capture if we are interacting with the thumb/slider
		isDragging = true;
		startX = e.clientX;
		startY = e.clientY;

		// Optional: capture pointer to keep tracking even if mouse leaves window
		el.setPointerCapture(e.pointerId);

		// Stop any ongoing release animations
		animate(el, { scale: 1 }, { duration: 0 });
	};

	const handlePointerMove = (e: PointerEvent) => {
		if (!isDragging) return;

		const {
			value,
			min,
			max,
			orientation = "horizontal",
			maxScale = 1.25,
		} = getOptions();
		const currValue = value();

		// 1. Calculate how far we have moved in pixels
		const deltaX = e.clientX - startX;
		const deltaY = e.clientY - startY;
		const delta = orientation === "horizontal" ? deltaX : deltaY;

		// 2. Determine if we are "overscrolling"
		// We only stretch if we are at the min limit and pulling left/up
		// OR at the max limit and pulling right/down.
		const isAtMin = currValue <= min;
		const isAtMax = currValue >= max;

		let overscroll = 0;

		if (isAtMin && delta < 0) {
			overscroll = Math.abs(delta);
		} else if (isAtMax && delta > 0) {
			overscroll = delta;
		}

		// 3. Apply the Elastic Math
		// If there is overscroll, calculate scale. Otherwise scale is 1.
		if (overscroll > 0) {
			// Formula: scale = 1 + (max_increase * (overscroll / (overscroll + constant)))
			// This ensures we approach but never exceed maxScale.
			// 'constant' determines how much resistance there is (higher = harder to stretch).
			const constant = 500;
			const maxIncrease = maxScale - 1;
			const scaleIncrease =
				maxIncrease * (overscroll / (overscroll + constant));

			const newScale = 1 + scaleIncrease;

			// Apply transform directly for 60fps performance (no Reactivity overhead needed here)
			// We use the center as origin so it stretches from the middle
			el.style.transformOrigin = "center";
			el.style.transform = `scale(${newScale})`;
		} else {
			el.style.transform = `scale(1)`;
		}
	};

	const handlePointerUp = (e: PointerEvent) => {
		if (!isDragging) return;
		isDragging = false;
		el.releasePointerCapture(e.pointerId);

		// 4. Spring back to normal
		animate(
			el,
			{ transform: "scale(1)" },
			{
				easing: spring({ stiffness: 400, damping: 25 }),
			},
		);
	};

	// Bind events
	el.addEventListener("pointerdown", handlePointerDown);
	window.addEventListener("pointermove", handlePointerMove); // window ensures smoother dragging
	window.addEventListener("pointerup", handlePointerUp);

	onCleanup(() => {
		el.removeEventListener("pointerdown", handlePointerDown);
		window.removeEventListener("pointermove", handlePointerMove);
		window.removeEventListener("pointerup", handlePointerUp);
	});
}
