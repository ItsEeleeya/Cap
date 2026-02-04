import { cx } from "cva";
import { createMemo, For, type JSX } from "solid-js";

export interface ProgressiveBlurProps {
	class?: string;
	height?: string;
	position?: "top" | "bottom" | "both" | "left" | "right";
	blur?: "xs" | "sm" | "md" | "lg" | "xl" | number[];
	children?: JSX.Element;
}

const LEVELS = {
	// xs: [0.05, 0.125, 0.25, 0.5, 1, 1.5, 2],
	xs: [0.05, 0.125, 0.25, 0.5, 0.8, 1.15, 1.15],
	sm: [0.125, 0.25, 0.5, 0.8, 1.2, 1.8, 2.2],
	md: [0.25, 0.5, 1, 2, 4, 8, 16],
	lg: [0.5, 1, 2, 4, 8, 16, 32],
	xl: [0.5, 1, 2, 4, 8, 16, 32],
};

export function ProgressiveBlur(props: ProgressiveBlurProps) {
	const {
		class: className = "",
		height = "30%",
		position = "bottom",
		blur = "md",
	} = props;

	const blurLevels = Array.isArray(blur) ? blur : LEVELS[blur] || LEVELS.md;

	// array for the middle blur elements (length = blurLevels.length - 2)
	const middleCount = Math.max(0, blurLevels.length - 2);
	const divElements = Array.from({ length: middleCount });

	const containerClass = cx(
		"gradient-blur pointer-events-none absolute",
		className,
		position === "top"
			? "inset-x-0 -top-0.5"
			: position === "bottom"
				? "inset-x-0 bottom-0"
				: position === "left"
					? "inset-y-0 left-0"
					: position === "right"
						? "inset-y-0 right-0"
						: "inset-0", // both
	);

	const baseMask = createMemo(() => {
		// The center/fallback mask used when position === "both"
		return `linear-gradient(rgba(0,0,0,0) 0%, rgba(0,0,0,1) 5%, rgba(0,0,0,1) 95%, rgba(0,0,0,0) 100%)`;
	});

	const firstMask = createMemo(() => {
		if (position === "bottom") {
			return `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%)`;
		}
		if (position === "top") {
			return `linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%)`;
		}
		if (position === "right") {
			return `linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%)`;
		}
		if (position === "left") {
			return `linear-gradient(to left, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 12.5%, rgba(0,0,0,1) 25%, rgba(0,0,0,0) 37.5%)`;
		}
		return baseMask();
	});

	const lastMask = createMemo(() => {
		if (position === "bottom") {
			return `linear-gradient(to bottom, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%)`;
		}
		if (position === "top") {
			return `linear-gradient(to top, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%)`;
		}
		if (position === "right") {
			return `linear-gradient(to right, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%)`;
		}
		if (position === "left") {
			return `linear-gradient(to left, rgba(0,0,0,0) 87.5%, rgba(0,0,0,1) 100%)`;
		}
		return baseMask();
	});

	const middleMask = (index: number) => {
		const blurIndex = index + 1;
		const startPercent = blurIndex * 12.5;
		const midPercent = (blurIndex + 1) * 12.5;
		const endPercent = (blurIndex + 2) * 12.5;

		const dir =
			position === "bottom"
				? "to bottom"
				: position === "top"
					? "to top"
					: position === "right"
						? "to right"
						: position === "left"
							? "to left"
							: null;

		if (!dir) return baseMask();

		return `linear-gradient(${dir},
			rgba(0,0,0,0) ${startPercent}%,
			rgba(0,0,0,1) ${midPercent}%,
			rgba(0,0,0,1) ${endPercent}%,
			rgba(0,0,0,0) ${endPercent + 12.5}%
		)`;
	};

	return (
		<div
			class={containerClass}
			style={{
				height:
					position === "both" || position === "left" || position === "right"
						? "100%"
						: height,
				width:
					position === "left" || position === "right"
						? height // reuse "height" as thickness for sides
						: "100%",
			}}
		>
			{/* First blur layer */}
			<div
				class="absolute inset-0"
				style={{
					"z-index": 1,
					"backdrop-filter": `blur(${blurLevels[0]}px)`,
					"-webkit-backdrop-filter": `blur(${blurLevels[0]}px)`,
					"mask-image": firstMask(),
					"-webkit-mask-image": firstMask(),
				}}
			/>

			{/* Middle blur layers */}
			<For each={divElements}>
				{(_, index) => {
					const i = index();
					const blurIndex = i + 1;
					const maskGradient = middleMask(i);

					return (
						<div
							class="absolute inset-0"
							style={{
								"z-index": i + 2,
								"backdrop-filter": `blur(${blurLevels[blurIndex]}px)`,
								"-webkit-backdrop-filter": `blur(${blurLevels[blurIndex]}px)`,
								"mask-image": maskGradient,
								"-webkit-mask-image": maskGradient,
							}}
						/>
					);
				}}
			</For>

			{/* Last blur layer */}
			<div
				class="absolute inset-0"
				style={{
					"z-index": blurLevels.length,
					"backdrop-filter": `blur(${blurLevels[blurLevels.length - 1]}px)`,
					"-webkit-backdrop-filter": `blur(${blurLevels[blurLevels.length - 1]}px)`,
					"mask-image": lastMask(),
					"-webkit-mask-image": lastMask(),
				}}
			/>

			{/* children (rendered on top of blur) */}
			{props.children}
		</div>
	);
}
