/**
 * sliderMath.ts
 *
 * Pure value <-> pixel conversions for KineticSlider. No signals, no DOM —
 * everything here is a plain function of (value, geometry) so it's cheap to
 * call from event handlers and easy to test in isolation.
 *
 * There is exactly one source of truth for "how far along the track is
 * this value": rawCentrePx / toT, mapping linearly across the full
 * [0, trackWidth] range. Fill uses that directly. The pill uses the same
 * number too, but clamped by pillEdgeClampPx so its own box doesn't clip
 * outside the track at the extremes — that clamp is a rendering-only
 * adjustment on top of the shared position, not a separate value space.
 */

export interface SliderGeometry {
	minValue: number;
	maxValue: number;
	/** Kobalte's step. Falls back to 1 if omitted, matching Kobalte's own default. */
	step: number;
	trackWidth: number;
	pillWidth: number;
}

export function toT(geometry: SliderGeometry, value: number) {
	const range = geometry.maxValue - geometry.minValue;
	return (value - geometry.minValue) / range;
}

export function clampValue(geometry: SliderGeometry, value: number) {
	return Math.min(Math.max(value, geometry.minValue), geometry.maxValue);
}

/**
 * Rounds to the nearest valid step and clamps to [min, max]. This is the
 * single source of truth for "which of the N discrete positions is this
 * closest to" — every px->value conversion should end up going through here
 * so the visual layer can never land on a value Kobalte itself wouldn't.
 */
export function nearestStep(geometry: SliderGeometry, value: number) {
	const stepped =
		Math.round((value - geometry.minValue) / geometry.step) * geometry.step +
		geometry.minValue;
	return clampValue(geometry, stepped);
}

/**
 * Raw pixel position of a normalised t along the track, [0, trackWidth].
 * This is the one number both fill width and (before edge-clamping) pill
 * centre are based on — at t=0 it's 0, at t=1 it's trackWidth, matching
 * where Kobalte itself considers min/max to be.
 */
export function rawCentrePx(geometry: SliderGeometry, t: number) {
	return t * geometry.trackWidth;
}

/**
 * Takes a raw centre px (from rawCentrePx) and nudges it inward only
 * enough to keep the pill's own box inside the track — a rendering
 * adjustment on the pill, not a different position. Near the middle of
 * the track this is a no-op; only within half a pill-width of either
 * edge does it pull the pill in from the raw position.
 */
export function pillEdgeClampPx(geometry: SliderGeometry, rawPx: number) {
	const half = geometry.pillWidth / 2;
	return Math.min(Math.max(rawPx, half), geometry.trackWidth - half);
}

/** Raw pointer px -> nearest valid stepped value, across the full [0, trackWidth] track. */
export function valueAtPx(geometry: SliderGeometry, px: number) {
	const clampedPx = Math.min(Math.max(px, 0), geometry.trackWidth);
	const t = geometry.trackWidth > 0 ? clampedPx / geometry.trackWidth : 0;
	return nearestStep(
		geometry,
		geometry.minValue + t * (geometry.maxValue - geometry.minValue),
	);
}
