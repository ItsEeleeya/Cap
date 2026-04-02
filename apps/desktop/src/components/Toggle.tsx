import { Switch as KSwitch } from "@kobalte/core/switch";
import { cva, cx } from "cva";
import { type ComponentProps, Show, splitProps } from "solid-js";
import { useSolarium } from "~/utils/solarium";

const toggleControlStyles = cva("flex shrink-0 items-center overflow-hidden rounded-full bg-gray-6 transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer group-focus-visible:ring-2 group-focus-visible:ring-blue-300 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent group-data-[disabled]:bg-gray-3 group-data-[checked]:bg-blue-500 group-data-[checked]:hover:bg-blue-600 group-data-[pressed]:bg-gray-5", {
	variants: {
		size: {
			sm: "h-[1rem] w-[2rem]",
			md: "h-[1.25rem] w-[2.5rem]",
			lg: "h-[1.5rem] w-[3rem]",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const toggleThumbStyles = cva("ms-0.5 rounded-full bg-white shadow-[0px_0px_1px_0px_rgb(0_0_0_/0.3)] transition-[margin,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-[margin,transform] group-data-[disabled]:opacity-40 group-data-[checked]:bg-white group-data-[checked]:shadow-[0px_0px_5px_0px_rgb(0_0_0_/0.02),0px_2px_10px_0px_rgb(0_0_0_/0.06),0px_0px_1px_0px_rgb(0_0_0_/0.3)] group-data-[pressed]:scale-x-105 group-data-[pressed]:scale-y-95", {
	variants: {
		size: {
			sm: "h-[0.75rem] w-[1.03125rem] group-data-[checked]:ms-[calc(100%-1.15625rem)]",
			md: "h-[1rem] w-[1.375rem] group-data-[checked]:ms-[calc(100%-1.5rem)]",
			lg: "h-[1.25rem] w-[1.71875rem] group-data-[checked]:ms-[calc(100%-1.84375rem)]",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const SOLARIUM_TOGGLE_SIZE_MAP = {
	sm: "min-w-[2rem] w-[2rem] h-[1rem]",
	md: "min-w-[2.5rem] min-h-[1.5rem]",
	lg: "min-w-[3rem] min-h-[2.5rem]",
};

export function Toggle(
	props: ComponentProps<typeof KSwitch> & { size?: "sm" | "md" | "lg" },
) {
	const [local, others] = splitProps(props, ["size"]);
	const solarium = useSolarium();

	return (
		<Show when={solarium?.()} fallback={
			<KSwitch class="group relative inline-flex items-center" {...others}>
				<KSwitch.Input class="peer absolute inset-0 cursor-pointer opacity-0" />
				<KSwitch.Control class={toggleControlStyles({ size: local.size })}>
					<KSwitch.Thumb class={toggleThumbStyles({ size: local.size })} />
				</KSwitch.Control>
			</KSwitch>
		}>
			<input
				ref={(el) => el.setAttribute("switch", "")}
				type="checkbox"
				role="switch"
				checked={Boolean(others.checked)}
				onInput={(e) => props?.onChange?.(e.currentTarget.checked)}
				onFocus={others.onFocus}
				onBlur={others.onBlur}
				class={cx(
					"accent-blue-500",
					SOLARIUM_TOGGLE_SIZE_MAP[local.size || "md"]
				)}
			/>
		</Show>
	);
}