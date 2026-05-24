/**
 * smoothed-global.ts
 *
 * Applies iOS-style squircle smoothing to every element carrying the
 * `smoothed` class, on macOS only.
 *
 * Import this as the very first line of main.tsx so the MutationObserver
 * is live before SolidJS adds anything to the DOM. MutationObserver callbacks
 * are microtasks — they run before the next paint — so elements are smoothed
 * before they are ever seen, eliminating the FOUC.
 */

import {
	type GeoOpts,
	type SmoothedHandle,
	smoothedObserver,
} from "~/components/smoothed";

type Radii = {
	tl: number;
	tr: number;
	br: number;
	bl: number;
};

/**
 * Reads computed border-radius for all four corners.
 * Returns null when all corners are zero — nothing to do.
 *
 * getComputedStyle is safe inside a MutationObserver callback; the browser
 * has already applied styles before the microtask fires.
 * Percentage values are resolved against the element's own dimensions via a
 * single getBoundingClientRect call, paid only when actually needed.
 */
function readRadii(el: HTMLElement): Radii | null {
	const s = getComputedStyle(el);

	let w = 0;
	const resolve = (raw: string): number => {
		const horizontal = raw.split("/")[0].trim();
		if (horizontal.endsWith("%")) {
			if (w === 0) w = el.getBoundingClientRect().width;
			return (parseFloat(horizontal) / 100) * w;
		}
		return parseFloat(horizontal) || 0;
	};

	const tl = resolve(s.borderTopLeftRadius);
	const tr = resolve(s.borderTopRightRadius);
	const br = resolve(s.borderBottomRightRadius);
	const bl = resolve(s.borderBottomLeftRadius);

	if (tl === 0 && tr === 0 && br === 0 && bl === 0) return null;
	return { tl, tr, br, bl };
}

function toGeo(r: Radii): GeoOpts {
	const uniform = r.tl === r.tr && r.tr === r.br && r.br === r.bl;
	return {
		radius: uniform ? r.tl : Math.max(r.tl, r.tr, r.br, r.bl),
		topLeftRadius: uniform ? undefined : r.tl || undefined,
		topRightRadius: uniform ? undefined : r.tr || undefined,
		bottomRightRadius: uniform ? undefined : r.br || undefined,
		bottomLeftRadius: uniform ? undefined : r.bl || undefined,
		smoothing: 0.6,
		borderWidth: 0,
	};
}

// Element lifecycle

// WeakMap — entries are GC'd automatically when elements are collected.
// We still call disconnect() explicitly on removal to release the ResizeObserver
// slot; without it the shared RO accumulates stale observed elements.
const handles = new WeakMap<HTMLElement, SmoothedHandle>();

function attach(el: HTMLElement): void {
	if (handles.has(el)) return;
	const radii = readRadii(el);
	if (!radii) return;
	handles.set(el, smoothedObserver(el, toGeo(radii), "transparent"));
}

function detach(el: HTMLElement): void {
	handles.get(el)?.disconnect();
	handles.delete(el);
}

function sync(el: HTMLElement): void {
	const radii = readRadii(el);
	if (!radii) {
		detach(el);
		return;
	}
	const existing = handles.get(el);
	if (existing) {
		existing.sync(toGeo(radii), "transparent");
	} else {
		attach(el);
	}
}

// MutationObserver
//
// Observing `document` (not `document.body`) means we catch elements added
// before <body> exists — important when this module is imported before render().
// attributeFilter is scoped to ["class"] only: smoothedObserver writes
// border-radius back as an inline style, so watching "style" would loop.

function processAdded(node: Node): void {
	if (!(node instanceof HTMLElement)) return;
	if (node.classList.contains("smoothed")) attach(node);
	// Also catch `smoothed` descendants of a newly-inserted subtree.
	for (const el of node.querySelectorAll<HTMLElement>(".smoothed")) {
		attach(el);
	}
}

function processRemoved(node: Node): void {
	if (!(node instanceof HTMLElement)) return;
	if (node.classList.contains("smoothed")) detach(node);
	for (const el of node.querySelectorAll<HTMLElement>(".smoothed")) {
		detach(el);
	}
}

new MutationObserver((mutations) => {
	for (const mutation of mutations) {
		if (mutation.type === "childList") {
			for (const node of mutation.addedNodes) processAdded(node);
			for (const node of mutation.removedNodes) processRemoved(node);
		} else if (
			mutation.type === "attributes" &&
			mutation.target instanceof HTMLElement
		) {
			// Fired when a class attribute changes on any element in the document.
			// Re-evaluate: the element may have just gained or lost `smoothed`,
			// or its border-radius class may have changed while `smoothed` was already set.
			const el = mutation.target;
			if (el.classList.contains("smoothed")) {
				sync(el);
			} else {
				detach(el);
			}
		}
	}
}).observe(document, {
	childList: true,
	subtree: true,
	attributes: true,
	attributeFilter: ["class"],
});
