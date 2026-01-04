import { Slider as KSlider } from "@kobalte/core/slider";
import { createEventListener } from "@solid-primitives/event-listener";
import { cx } from "cva";
import { type ComponentProps, createRoot, createSignal } from "solid-js";
import Tooltip from "~/components/Tooltip";

export function SolariumSlider(
	props: ComponentProps<typeof KSlider> & {
		formatTooltip?: string | ((v: number) => string);
	},
) {
	const [thumbRef, setThumbRef] = createSignal<HTMLDivElement>();
	const [dragging, setDragging] = createSignal(false);

	return (
		<KSlider
			{...props}
			class={cx(
				"relative px-1 h-8 flex flex-row justify-stretch items-center",
				props.class,
			)}
			onChange={(v) => {
				props.onChange?.(v);
			}}
			onChangeEnd={(e) => {
				props.onChangeEnd?.(e);
			}}
		>
			<KSlider.Track
				class="h-2 relative mx-1 rounded-full bg-white/10 *:apple-vibrancy-fill w-full before:content-[''] before:absolute before:inset-0 before:-top-3 before:-bottom-3"
				onPointerDown={() => {
					setDragging(true);
					createRoot((dispose) => {
						createEventListener(window, "mouseup", () => {
							setDragging(false);
							dispose();
						});
					});
				}}
			>
				<KSlider.Fill class="absolute -ml-2 h-full rounded-full bg-[-apple-system-control-accen] bg-blue-8 data-disabled:bg-gray-8" />
				<Tooltip
					gutter={4}
					getAnchorRect={() => {
						const thumb = thumbRef();
						if (!thumb) return {};
						const rect = thumb.getBoundingClientRect();
						return {
							x: rect.left,
							y: rect.top,
							width: rect.width,
							height: rect.height,
						};
					}}
					content={
						props.value?.[0] !== undefined
							? typeof props.formatTooltip === "string"
								? `${props.value[0].toFixed(1)}${props.formatTooltip}`
								: props.formatTooltip
									? props.formatTooltip(props.value[0])
									: props.value[0].toFixed(1)
							: undefined
					}
				>
					<KSlider.Thumb
						ref={setThumbRef}
						onPointerDown={() => {
							setDragging(true);
						}}
						onPointerUp={() => {
							setDragging(false);
						}}
						// class={cx(
						// 	"relative w-7 h-4.5 -top-1 rounded-full outline-none data-disabled:bg-gray-9 transition-colors duration-200 ease-in-out",
						// 	dragging()
						// 		? "apple-glass-clear -top-2 w-10 h-6 before:content-[''] before:bg-white/10 before:size-full before:rounded-full before:absolute before:backdrop-brightness-150"
						// 		: " shadow-md border border-gray-6 after:content-[''] after:absolute after:inset-0 after:-m-3 bg-gray-1 dark:bg-gray-12",
						// )}
						class={cx(
							"absolute w-7 h-4.5 -translate-x-1/2 top-1/2 -translate-y-1/2 rounded-full outline-none data-disabled:bg-gray-9 transition-transform duration-200 ease-in-out",
							dragging()
								? "apple-glass-clear w-10 h-6 before:content-[''] before:bg-white/10 before:size-full before:rounded-full before:absolute before:backdrop-brightness-150"
								: "",
						)}
					/>
				</Tooltip>
			</KSlider.Track>
		</KSlider>
	);
}
