import { cx } from "cva";
import type { ComponentProps, JSX } from "solid-js";
import { For, splitProps } from "solid-js";

export const GRADIENT_ANGLES = {
	top: 0,
	right: 90,
	bottom: 180,
	left: 270,
} as const;

export type ProgressiveBlurProps = {
	direction?: keyof typeof GRADIENT_ANGLES;
	blurLayers?: number;
	blurIntensity?: number;
} & ComponentProps<"div">;

export function ProgressiveBlur(props: ProgressiveBlurProps) {
	const [local] = splitProps(props, [
		"direction",
		"blurLayers",
		"blurIntensity",
		"class",
		"style",
	]);

	const direction = () => local.direction ?? "bottom";
	const blurLayers = () => Math.max(local.blurLayers ?? 8, 2);
	const blurIntensity = () => local.blurIntensity ?? 0.25;
	const segmentSize = () => 1 / (blurLayers() + 1);
	const layers = () => Array.from({ length: blurLayers() }, (_, i) => i);

	return (
		<div
			class={cx("relative overflow-hidden", local.class)}
			style={local.style}
		>
			<For each={layers()}>
				{(layerIndex) => {
					const angle = GRADIENT_ANGLES[direction()];
					const ss = segmentSize();

					const gradientStops = [
						layerIndex * ss,
						(layerIndex + 1) * ss,
						(layerIndex + 2) * ss,
						(layerIndex + 3) * ss,
					].map(
						(pos, posIndex) =>
							`rgba(255,255,255,${posIndex === 1 || posIndex === 2 ? 1 : 0}) ${pos * 100}%`,
					);

					const gradient = `linear-gradient(${angle}deg, ${gradientStops.join(", ")})`;

					return (
						<div
							class="pointer-events-none absolute inset-0"
							style={{
								"mask-image": gradient,
								"backdrop-filter": `blur(${layerIndex * blurIntensity()}px)`,
							}}
						/>
					);
				}}
			</For>
		</div>
	);
}
