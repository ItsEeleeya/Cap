import { Slider } from "@kobalte/core/slider";
import type { Component, JSX } from "solid-js";
import { createKinetic, type KineticConfig } from "./kinetic";

export interface KineticSliderProps {
	defaultValue?: number;
	value?: number;
	onChange?: (value: number[]) => void;
	onChangeEnd?: (value: number[]) => void;
	minValue?: number;
	maxValue?: number;
	step?: number;
	disabled?: boolean;
	label?: string;
	showValue?: boolean;
	kinetic?: KineticConfig;
	class?: string;
	style?: JSX.CSSProperties;
}

export const KineticSlider: Component<KineticSliderProps> = (props) => {
	const k = createKinetic(props.kinetic);

	return (
		<Slider
			class={`flex flex-col gap-3 select-none w-full ${props.class ?? ""}`}
			style={props.style}
			defaultValue={[props.defaultValue ?? 50]}
			value={props.value !== undefined ? [props.value] : undefined}
			onChange={(v) => {
				k.push(v[0]);
				props.onChange?.(v);
			}}
			onChangeEnd={(v) => {
				k.release();
				props.onChangeEnd?.(v);
			}}
			minValue={props.minValue ?? 0}
			maxValue={props.maxValue ?? 100}
			step={props.step ?? 1}
			disabled={props.disabled}
		>
			{(props.label || props.showValue) && (
				<div class="flex items-center justify-between text-sm">
					{props.label && (
						<Slider.Label class="font-medium text-white/80">
							{props.label}
						</Slider.Label>
					)}
					{props.showValue && (
						<Slider.ValueLabel class="tabular-nums text-white/50" />
					)}
				</div>
			)}

			<Slider.Track class="relative flex items-center h-6 w-full">
				<div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/15 overflow-hidden">
					<Slider.Fill class="h-full rounded-full bg-white/60" />
				</div>

				{/* Kobalte owns: left %, translateY(-50%)  ─  we own: inner scaleX/Y only */}
				<Slider.Thumb
					class="absolute top-1/2 -translate-y-1/2 outline-none"
					onPointerDown={() => k.wake()}
					onPointerUp={() => k.release()}
					onPointerCancel={() => k.release()}
				>
					<div
						style={{
							width: "30px",
							height: "20px",
							"border-radius": "999px",
							"transform-origin": "center center",
							transform: `scaleX(${k.scaleX()}) scaleY(${k.scaleY()})`,
							"will-change": "transform",
						}}
						class="flex items-center justify-center gap-[3px] active:cursor-grabbing apple-glass-clear"
					>
						{/* <div class="w-px h-2.5 rounded-full bg-black/20" />
                        <div class="w-px h-2.5 rounded-full bg-black/20" />
                        <div class="w-px h-2.5 rounded-full bg-black/20" /> */}
					</div>
					<Slider.Input />
				</Slider.Thumb>
			</Slider.Track>
		</Slider>
	);
};
