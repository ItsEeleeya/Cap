import { createEventListener } from "@solid-primitives/event-listener";
import { type Accessor, createSignal } from "solid-js";

const FORCE_TOUCH_SUPPORTED =
	typeof window !== "undefined" && "onwebkitmouseforcewillbegin" in window;

const POINTER_SUPPORTED =
	typeof window !== "undefined" && "onpointerdown" in window;

// webkitForce is roughly on a 1-3 scale, not 0-1: 1 == a normal full click,
// 2 == the "deep press" threshold. Below 1 it reports fractional values
// while pressing lightly. Remap the whole reporting range to 0-1.
const WEBKIT_FORCE_MIN = 0;
const WEBKIT_FORCE_MAX = 3;

// A press has to clear this before any haptic can fire at all, regardless
// of levels - the initial contact overlaps with the OS's own click feel,
// so a haptic right at first touch reads as interference, not signal.
const MIN_PRESSURE_FOR_HAPTICS = 0.15;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizeWebkitForce(force: number) {
	const t = (force - WEBKIT_FORCE_MIN) / (WEBKIT_FORCE_MAX - WEBKIT_FORCE_MIN);
	const clamped = clamp(t, 0, 1);
	// values essentially at the ceiling read as a clean 1 rather than
	// something like 0.997
	return clamped > 0.995 ? 1 : clamped;
}

interface ForceTouchOptions {
	/**
	 * Pressure thresholds (0-1) to fire a haptic tick when crossed, e.g.
	 * [0.3, 0.6, 1.0]. Omit entirely to only get a single haptic at max
	 * pressure (1.0) - there's no step-ladder default, since a default
	 * step size is exactly the "distracting on every level" behavior this
	 * is meant to avoid. Crossing never fires below MIN_PRESSURE_FOR_HAPTICS,
	 * regardless of levels given, so the very first contact stays silent.
	 */
	levels?: number[];
	/** Fires when a level (or, with no levels given, max pressure) is crossed while increasing. */
	onLevelCrossed?: (level: number) => void;
}

interface ForceTouch {
	/** 0-1 while actively pressing, null when inactive or unsupported. */
	amount: Accessor<number | null>;
	/** True if this device/platform can report continuous pressure at all. */
	isSupported: Accessor<boolean>;
	/** Attach to the element that should receive the gesture. No-op if unsupported. */
	ref: (el: HTMLElement) => void;
}

/**
 * Reports continuous 0-1 press pressure where the platform actually
 * provides it. Two tiers, strongest first:
 *   1. Force Touch trackpad (macOS/WebKit) - webkitForce, remapped from
 *      its ~1-3 scale to 0-1.
 *   2. Pointer Events with real pressure (Windows precision touchpads,
 *      touchscreens, styluses) - event.pressure.
 *
 * Devices with neither (plain mice/trackpads) report isSupported() as
 * false and amount() stays null forever - this primitive does not invent
 * a substitute gesture (e.g. double-click) for that case. Callers that
 * want a fallback interaction own that decision themselves, driven off
 * isSupported().
 *
 * Release is never trusted to a single event: both tiers also treat the
 * pointer/mouse leaving or lifting as a release, since a "force detected"
 * event isn't guaranteed to be followed by a clean "force ended" event
 * (mirrors pressure.js's adapters, which register mouseup/mouseleave as
 * real release signals rather than edge cases).
 */
export function createForceTouch(options: ForceTouchOptions = {}): ForceTouch {
	const [amount, setAmount] = createSignal<number | null>(null);
	const isSupported = () => FORCE_TOUCH_SUPPORTED || POINTER_SUPPORTED;

	// levels to actually watch for crossing: either what was given, or just
	// the ceiling if nothing was given
	const watchLevels = [...(options.levels ?? [1])].sort((a, b) => a - b);
	let highestCrossed = -1; // index into watchLevels, -1 = none yet

	function updateAmount(value: number) {
		setAmount(value);

		if (value < MIN_PRESSURE_FOR_HAPTICS) return;
		for (let i = highestCrossed + 1; i < watchLevels.length; i++) {
			if (value < watchLevels[i]) break;
			highestCrossed = i;
			options.onLevelCrossed?.(watchLevels[i]);
		}
	}

	function release() {
		highestCrossed = -1;
		setAmount(null);
	}

	function attachForceTouchListeners(el: HTMLElement) {
		createEventListener(el, "webkitmouseforcewillbegin", (e: Event) => {
			e.preventDefault();
		});

		createEventListener(el, "webkitmouseforcechanged", (e: Event) => {
			const raw = (e as unknown as { webkitForce: number }).webkitForce ?? 0;
			updateAmount(normalizeWebkitForce(raw));
		});

		// webkitmouseforceup is the "clean" end, but isn't guaranteed to
		// fire on its own (e.g. cursor drags off the element while
		// pressing) - mouseup/mouseleave are backup release signals.
		createEventListener(el, "webkitmouseforceup", release);
		createEventListener(el, "mouseup", release);
		createEventListener(el, "mouseleave", release);
	}

	function attachPointerListeners(el: HTMLElement) {
		function handlePressureEvent(e: PointerEvent) {
			// pressure 0.5 is what most non-pressure-sensitive mice/trackpads
			// report as a constant "pressed" value, not a real reading - if
			// that's all this device ever reports, treat it as unsupported
			// rather than faking a boost off a constant.
			if (e.pressure > 0 && e.pressure !== 0.5) {
				updateAmount(clamp(e.pressure, 0, 1));
			}
		}

		createEventListener(el, "pointerdown", handlePressureEvent);
		createEventListener(el, "pointermove", (e: PointerEvent) => {
			if (amount() === null) return;
			handlePressureEvent(e);
		});
		createEventListener(el, "pointerup", release);
		createEventListener(el, "pointerleave", release);
		createEventListener(el, "pointercancel", release);
	}

	function ref(el: HTMLElement) {
		if (FORCE_TOUCH_SUPPORTED) {
			attachForceTouchListeners(el);
		} else if (POINTER_SUPPORTED) {
			attachPointerListeners(el);
		}
	}

	return { amount, isSupported, ref };
}
