/**
 * KSolariumSlider.tsx
 *
 * A single-value slider that uses Kobalte for value state and fill,
 * but owns the visual thumb and rubber-band behavior itself.
 *
 * The key fix is that createDrag is configured in pill-centre space,
 * not raw track space, and the visible thumb is clamped to the
 * allowed edge-bleed bounds while the spring still carries the overshoot.
 */

import type { SliderRootProps } from "@kobalte/core/slider";
import { Slider } from "@kobalte/core/slider";
import {
	type Component,
	createSignal,
	onCleanup,
	onMount,
	Show,
	splitProps,
} from "solid-js";
import { createDrag } from "./drag";
import { FluidSurface } from "./FluidSurface";
import type { KineticConfig } from "./kinetic";

export type SolariumSliderSize = "xs" | "sm" | "md" | "lg" | "xl";

const SIZE_FONT_SIZE_PX: Record<SolariumSliderSize, number> = {
	xs: 12,
	sm: 14,
	md: 16,
	lg: 18,
	xl: 24,
};

const THUMB_SIZE_EM = 1.5;
const PILL_EDGE_BLEED = 4;
const STEP_KICK_VELOCITY = 500;
const RUBBER_OVERSHOOT = 5;
const RUBBER_SOFTNESS = 42;

function toT(value: number, min: number, range: number) {
	return (value - min) / range;
}

function fromRawPx(px: number, w: number, min: number, range: number) {
	return min + (px / w) * range;
}

function clampValue(v: number, min: number, max: number) {
	return Math.min(Math.max(v, min), max);
}

function clampedCentrePx(t: number, w: number, halfPill: number) {
	const min = halfPill - PILL_EDGE_BLEED;
	const max = w - halfPill + PILL_EDGE_BLEED;
	return Math.min(Math.max(t * w, min), max);
}

function restingMinCentre(halfPill: number) {
	return halfPill - PILL_EDGE_BLEED;
}

function restingMaxCentre(w: number, halfPill: number) {
	return w - halfPill + PILL_EDGE_BLEED;
}

function pillCentreFromDrag(x: number, w: number, halfPill: number) {
	const min = halfPill - PILL_EDGE_BLEED;
	const max = w - halfPill + PILL_EDGE_BLEED;
	if (x < 0) return min + x;
	if (x > w) return max + (x - w);
	return clampedCentrePx(x / w, w, halfPill);
}

function quantizeToStep(
	value: number,
	step: number | undefined,
	min: number,
	max: number,
) {
	if (!step) return value;
	const snapped = Math.round((value - min) / step) * step + min;
	return clampValue(snapped, min, max);
}

export interface KSolariumSliderProps extends SliderRootProps {
	kinetic?: KineticConfig;
	class?: string;
	size?: SolariumSliderSize;
}

function valueCount(props: KSolariumSliderProps): number {
	if (Array.isArray(props.value)) return props.value.length;
	if (Array.isArray(props.defaultValue)) return props.defaultValue.length;
	return 1;
}

export const KSolariumSlider: Component<KSolariumSliderProps> = (props) => {
	return (
		<Show
			when={valueCount(props) <= 1}
			fallback={<PlainKSolariumSlider {...props} />}
		>
			<SimpleKSolariumSlider {...props} />
		</Show>
	);
};

const PlainKSolariumSlider: Component<KSolariumSliderProps> = (rawProps) => {
	const [local, sliderProps] = splitProps(rawProps, ["kinetic", "class", "size"]);
	return (
		<Slider
			{...sliderProps}
			class={`relative w-full ${local.class ?? ""}`}
		>
			<Slider.Track class="relative flex items-center h-6 w-full">
				<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
					<Slider.Fill class="absolute inset-y-0 left-0 rounded-full bg-blue-9" />
				</div>
				<Slider.Thumb
					class="block rounded-full bg-white shadow"
					style={{
						"font-size": `${SIZE_FONT_SIZE_PX[local.size ?? "md"]}px`,
						width: `${THUMB_SIZE_EM}em`,
						height: `${THUMB_SIZE_EM}em`,
					}}
				>
					<Slider.Input />
				</Slider.Thumb>
			</Slider.Track>
		</Slider>
	);
};

const SimpleKSolariumSlider: Component<KSolariumSliderProps> = (rawProps) => {
	const [local, sliderProps] = splitProps(rawProps, [
		"kinetic",
		"class",
		"onChange",
		"onChangeEnd",
		"size",
]);

	const [pillPressed, setPillPressed] = createSignal(false);
	const fontSizePx = () => SIZE_FONT_SIZE_PX[local.size ?? "md"];
	const pillWidth = () => fontSizePx() * THUMB_SIZE_EM;
	const halfPill = () => pillWidth() / 2;

	const minValue = (sliderProps.minValue ?? 0) as number;
	const maxValue = (sliderProps.maxValue ?? 100) as number;
	const range = maxValue - minValue;
	const step = sliderProps.step as number | undefined;

	const [kobalteValue, setKobalteValue] = createSignal<number[]>(
		(() => {
			if (Array.isArray(sliderProps.defaultValue))
				return sliderProps.defaultValue as number[];
			if (sliderProps.value !== undefined) return sliderProps.value as number[];
			return [50];
		})(),
	);

	let currentValue = kobalteValue()[0];

	let trackEl: HTMLDivElement | undefined;
	const [trackWidth, setTrackWidth] = createSignal(0);

	onMount(() => {
		if (!trackEl) return;
		const ro = new ResizeObserver(([entry]) => {
			setTrackWidth(entry.contentRect.width);
		});
		ro.observe(trackEl);
		setTrackWidth(trackEl.clientWidth);
		onCleanup(() => ro.disconnect());
	});

	const [pillX, setPillX] = createSignal(
		clampedCentrePx(toT(currentValue, minValue, range), 0, halfPill()),
	);
	const [pillAnimate, setPillAnimate] = createSignal(false);

	onMount(() => {
		const w = trackWidth();
		if (w > 0) {
			setPillAnimate(false);
			setPillX(clampedCentrePx(toT(currentValue, minValue, range), w, halfPill()));
		}
	});

	const [stepPulseId, setStepPulseId] = createSignal(0);
	const [stepPulseVelocity, setStepPulseVelocity] = createSignal(0);

	function pulseStep(from: number, to: number) {
		const direction = Math.sign(to - from) || 1;
		setStepPulseVelocity(direction * STEP_KICK_VELOCITY);
		setStepPulseId((id) => id + 1);
	}

	let isDragging = false;
	const [isInteracting, setIsInteracting] = createSignal(false);

	onMount(() => {
		if (!trackEl) return;

		const drag = createDrag(trackEl, {
			axis: "x",
			maxOvershoot: RUBBER_OVERSHOOT,
			softness: RUBBER_SOFTNESS,
			getConstraints: () => ({
				min: 0,
				max: trackWidth(),
			}),

			onMove({ x, raw, isDragging: dragging }) {
				isDragging = dragging;
				setIsInteracting(true);
				const w = trackWidth();
				const clampedRaw = Math.min(Math.max(raw, 0), w);
				const rawValue = clampValue(
					fromRawPx(clampedRaw, w, minValue, range),
					minValue,
					maxValue,
				);
				const steppedValue = quantizeToStep(rawValue, step, minValue, maxValue);

				if (step !== undefined && steppedValue !== currentValue) {
					pulseStep(currentValue, steppedValue);
				}
				if (steppedValue !== currentValue) {
					currentValue = steppedValue;
					setKobalteValue([steppedValue]);
					local.onChange?.([steppedValue]);
				}

				setPillAnimate(false);
				setPillX(
					pillCentreFromDrag(x, w, halfPill()),
				);
			},

			onRelease() {
				isDragging = false;
				setIsInteracting(false);
				const w = trackWidth();
				const snappedValue = currentValue;

				setPillAnimate(true);
				setPillX(
					clampedCentrePx(toT(snappedValue, minValue, range), w, halfPill()),
				);
				setPillPressed(false);
				local.onChangeEnd?.([snappedValue]);
			},
		});

		onCleanup(() => drag.destroy());
	});

	onMount(() => {
		if (!trackEl) return;
		function onCaptureDown() {
			isDragging = true;
			setPillPressed(true);
		}
		trackEl.addEventListener("pointerdown", onCaptureDown, { capture: true });
		onCleanup(() =>
			trackEl?.removeEventListener("pointerdown", onCaptureDown, {
				capture: true,
			}),
		);
	});

	function handleTrackClick(e: MouseEvent) {
		if (!trackEl) return;
		const w = trackWidth();
		const rect = trackEl.getBoundingClientRect();
		const rawPx = e.clientX - rect.left;
		const rawValue = clampValue(
			fromRawPx(rawPx, w, minValue, range),
			minValue,
			maxValue,
		);
		const newValue = quantizeToStep(rawValue, step, minValue, maxValue);
		const clampedPx = clampedCentrePx(
			toT(newValue, minValue, range),
			w,
			halfPill(),
		);

		currentValue = newValue;
		setKobalteValue([newValue]);
		setPillAnimate(true);
		setPillX(clampedPx);
		setPillPressed(false);
		isDragging = false;
		setIsInteracting(false);

		local.onChange?.([newValue]);
		local.onChangeEnd?.([newValue]);
	}

	function handleKobalteChange(v: number[]) {
		if (isDragging) return;
		const next = v[0];
		currentValue = next;
		setKobalteValue(v);
		const w = trackWidth();
		setPillAnimate(false);
		setPillX(clampedCentrePx(toT(next, minValue, range), w, halfPill()));
		local.onChange?.(v);
	}

	function handleKobalteChangeEnd(v: number[]) {
		if (!isDragging) local.onChangeEnd?.(v);
	}

	return (
		<div class={`select-none w-full ${local.class ?? ""}`}>
			<Slider
				{...sliderProps}
				value={rawProps.value ?? kobalteValue()}
				onChange={handleKobalteChange}
				onChangeEnd={handleKobalteChangeEnd}
				class="relative w-full"
			>
				<div ref={trackEl} class="relative w-full" onClick={handleTrackClick}>
					<Slider.Track class="relative flex items-center h-6 w-full">
						<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-gray-7 overflow-hidden">
							<Slider.Fill class="absolute inset-y-0 left-0 rounded-full bg-blue-9" />
						</div>

						<FluidSurface
							axis="x"
							x={pillX()}
							animate={pillAnimate()}
							pressed={pillPressed() || isInteracting()}
							size={pillWidth()}
							minX={restingMinCentre(halfPill())}
							maxX={restingMaxCentre(trackWidth(), halfPill())}
							pulseId={stepPulseId()}
							pulseVelocity={stepPulseVelocity()}
						/>

						<Slider.Thumb class="sr-only">
							<Slider.Input />
						</Slider.Thumb>
					</Slider.Track>
				</div>
			</Slider>
		</div>
	);
};
