import { Slider } from "@kobalte/core/slider";
import { animate, spring } from "@motionone/dom";
import { cx } from "cva";
import {
	type Component,
	createEffect,
	createSignal,
	type JSX,
	mergeProps,
	onCleanup,
	Show,
} from "solid-js";

// --- Helpers ---

function decay(value: number, max: number): number {
	if (max === 0) return 0;
	const entry = value / max;
	const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);
	return sigmoid * max;
}

const MAX_OVERFLOW = 20;

interface ElasticSliderProps {
	defaultValue?: number;
	minValue?: number;
	maxValue?: number;
	step?: number;
	class?: string;
	leftIcon?: JSX.Element;
	rightIcon?: JSX.Element;
	onChange?: (value: number) => void;
}

export const ElasticSlider: Component<ElasticSliderProps> = (props) => {
	const merged = mergeProps(
		{
			defaultValue: 50,
			minValue: 0,
			maxValue: 100,
			step: 1,
			class: "",
		},
		props,
	);

	// --- State ---
	// We track value locally to calculate the Thumb position interpolation
	const [value, setValue] = createSignal(merged.defaultValue);

	const [trackWrapper, setTrackWrapper] = createSignal<HTMLDivElement | null>(
		null,
	);
	const [leftIconEl, setLeftIconEl] = createSignal<HTMLDivElement | null>(null);
	const [rightIconEl, setRightIconEl] = createSignal<HTMLDivElement | null>(
		null,
	);
	const [thumbEl, setThumbEl] = createSignal<HTMLSpanElement | null>(null);

	const [region, setRegion] = createSignal<"left" | "middle" | "right">(
		"middle",
	);
	const [isDragging, setIsDragging] = createSignal(false);

	// --- Physics Logic (Global Listener Pattern) ---

	const handlePointerDown = (e: PointerEvent) => {
		const wrapper = trackWrapper();
		if (!wrapper) return;

		setIsDragging(true);

		const rect = wrapper.getBoundingClientRect();
		const { left, width, right } = rect;

		const onPointerMove = (moveEvent: PointerEvent) => {
			const clientX = moveEvent.clientX;
			let overflow = 0;

			// Determine Elastic Region
			if (clientX < left) {
				setRegion("left");
				overflow = left - clientX;
			} else if (clientX > right) {
				setRegion("right");
				overflow = clientX - right;
			} else {
				setRegion("middle");
				overflow = 0;
			}

			// Apply Physics to Wrapper
			const dampenedOverflow = decay(overflow, MAX_OVERFLOW);

			if (dampenedOverflow > 0) {
				const scaleX = 1 + dampenedOverflow / width;
				const scaleY = 1 - dampenedOverflow / MAX_OVERFLOW / 5;
				const transformOrigin = clientX < left + width / 2 ? "right" : "left";

				wrapper.style.transformOrigin = transformOrigin;
				wrapper.style.transform = `scale(${scaleX}, ${scaleY})`;
			} else {
				wrapper.style.transform = `scale(1, 1)`;
			}

			// Apply Physics to Icons
			const lIcon = leftIconEl();
			const rIcon = rightIconEl();
			const currentRegion = region();

			if (lIcon && rIcon) {
				if (currentRegion === "left") {
					lIcon.style.transform = `translateX(${-dampenedOverflow}px)`;
				} else if (currentRegion === "right") {
					rIcon.style.transform = `translateX(${dampenedOverflow}px)`;
				} else {
					lIcon.style.transform = `translateX(0px)`;
					rIcon.style.transform = `translateX(0px)`;
				}
			}
		};

		const onPointerUp = () => {
			setIsDragging(false);
			setRegion("middle");

			// Spring Reset
			animate(
				wrapper,
				{ transform: "scale(1, 1)" },
				{ easing: spring({ stiffness: 500, damping: 25 }) },
			);

			const lIcon = leftIconEl();
			const rIcon = rightIconEl();
			if (lIcon)
				animate(lIcon, { transform: "translateX(0px)" }, { duration: 0.2 });
			if (rIcon)
				animate(rIcon, { transform: "translateX(0px)" }, { duration: 0.2 });

			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerUp);
			window.removeEventListener("pointercancel", onPointerUp);
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);
		window.addEventListener("pointercancel", onPointerUp);
	};

	// --- Thumb Animation Effect ---
	// createEffect(() => {
	// 	const thumb = thumbEl();
	// 	if (!thumb) return;

	// 	// Bouncy Scale on Drag
	// 	if (isDragging()) {
	// 		animate(
	// 			thumb,
	// 			{ scale: 1.5 },
	// 			{ easing: spring({ stiffness: 400, damping: 20 }) },
	// 		);
	// 	} else {
	// 		animate(
	// 			thumb,
	// 			{ scale: 1 },
	// 			{ easing: spring({ stiffness: 400, damping: 20 }) },
	// 		);
	// 	}
	// });

	// --- Icon Pop Effect ---
	createEffect(() => {
		const r = region();
		const lIcon = leftIconEl();
		const rIcon = rightIconEl();

		if (r === "left" && lIcon) {
			animate(lIcon, { scale: [1, 1.4, 1] }, { duration: 0.25 });
		}
		if (r === "right" && rIcon) {
			animate(rIcon, { scale: [1, 1.4, 1] }, { duration: 0.25 });
		}
	});

	// Calculate percentage for transform logic
	const _getPercentage = () => {
		const range = merged.maxValue - merged.minValue;
		const v = ((value() - merged.minValue) / range) * 100;
		console.log(v);
		return v;
	};

	const getPercentage = () => {
		const range = merged.maxValue - merged.minValue;
		const p = ((value() - merged.minValue) / range) * 100;

		// The size of the edge zones (2.5% on left + 2.5% on right = 95% middle)
		const threshold = 30;

		if (p < threshold) {
			// Zone 1 (Start): 0% -> 2.5%
			// We map this small progress to 0 -> 50 for the transform
			const t = p / threshold; // Normalized 0-1

			// Cubic Ease Out: Starts fast, slows down gently into the center
			const ease = 1 - (1 - t) ** 3;
			return ease * 50;
		}

		if (p > 100 - threshold) {
			// Zone 3 (End): 97.5% -> 100%
			// We map this small progress to 50 -> 100
			const t = (p - (100 - threshold)) / threshold; // Normalized 0-1

			// Cubic Ease In: Starts slow from center, speeds up into the edge
			const ease = t ** 3;
			return 50 + ease * 50;
		}

		// Zone 2 (Middle): The Plateau
		// For 95% of the slider, the thumb is perfectly centered
		return 50;
	};

	return (
		<Slider
			class={`flex touch-none select-none items-center justify-center gap-4 ${merged.class}`}
			value={[value()]}
			minValue={merged.minValue}
			maxValue={merged.maxValue}
			step={merged.step}
			onChange={(val) => {
				setValue(val[0]);
				props.onChange?.(val[0]);
			}}
		>
			<div class="contents">
				<Show when={props.leftIcon}>
					<div
						ref={setLeftIconEl}
						class="flex items-center justify-center text-gray-400"
					>
						{props.leftIcon}
					</div>
				</Show>

				{/*
                    ELASTIC WRAPPER
                    Handles the stretch transform and pointer events.
                */}
				<div
					ref={setTrackWrapper}
					onPointerDown={handlePointerDown}
					class="relative flex grow items-center h-[16px] py-[3px]" // Padding Y adds hit area
				>
					<Slider.Track class="relative h-[10px] w-full cursor-pointer touch-none">
						{/*
                           LAYER 1: MASKED VISUALS
                           This div clips the fill so we don't have ugly corners at small widths.
                        */}
						<div class="absolute inset-0 rounded-full overflow-hidden bg-gray-300/50">
							<Slider.Fill class="absolute h-full rounded-full bg-[-apple-system-control-accent]" />
						</div>

						{/*
                           LAYER 2: THUMB
                           Sits outside the overflow-hidden div so it can glow/shadow freely.
                        */}
						<Slider.Thumb
							onPointerDown={handlePointerDown}
							ref={setThumbEl}
							class={cx(
								"block h-5 w-8 -top-[5px] rounded-full focus:outline-none cursor-grab active:cursor-grabbing border-white/20",
								isDragging()
									? "bg-white/5 scale-110 shadow-md shadow-white/10 border border-white/20 backdrop-brightness-150"
									: "shadow-sm border bg-white border-gray-2",
							)}
							// Style Logic for "Stay Inside" + "Apple Glass"
							style={{
								// 1. Position Interpolation:
								//    At 0%, translate 0%. At 100%, translate -100%.
								//    This keeps the capsule perfectly inside the track bounds.
								// transform: `translateX(-${50}%)`,
								transform: `translateX(-${getPercentage()}%)`,

								// "background-color": "rgba(255, 255, 255, 0.2)",
								// "backdrop-filter": "blur(1px) saturate(180%)",
								// "-webkit-backdrop-filter": "blur(8px) saturate(180%)", // Safari support
							}}
						>
							<Slider.Input />
						</Slider.Thumb>
					</Slider.Track>
				</div>

				<Show when={props.rightIcon}>
					<div
						ref={setRightIconEl}
						class="flex items-center justify-center text-gray-400"
					>
						{props.rightIcon}
					</div>
				</Show>
			</div>
		</Slider>
	);
};

export default ElasticSlider;
