import { Switch as KSwitch } from "@kobalte/core/switch";
import { cva, cx } from "cva";
import { type ComponentProps, createSignal, splitProps } from "solid-js";
import { motion } from "motion-solid";

const toggleControlStyles = cva(
	"rounded-full bg-gray-6 data-disabled:bg-gray-3 data-checked:bg-blue-500 transition-colors",
	{
		variants: {
			size: {
				sm: "w-10 h-5 p-0.5",
				md: "w-12 h-6 p-0.5",
				lg: "w-15 h-7 p-0.75",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

const toggleThumbStyles = cva(
	"bg-white rounded-full transition-transform data-checked:translate-x-[calc(55%)]",
	{
		variants: {
			size: {
				sm: "size-4 w-6",
				md: "size-5 w-7",
				lg: "size-6 w-8",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

export function _Toggle(
	props: ComponentProps<typeof KSwitch> & { size?: "sm" | "md" | "lg" },
) {
	const [local, others] = splitProps(props, ["size"]);

	return (
		<KSwitch class="relative" {...others}>
			<KSwitch.Input class="peer absolute inset-0 opacity-0 cursor-pointer" />
			<KSwitch.Control class={toggleControlStyles({ size: local.size })}>
				<KSwitch.Thumb class={toggleThumbStyles({ size: local.size })} />
			</KSwitch.Control>
		</KSwitch>
	);
}
export function Toggle(
	props: ComponentProps<typeof KSwitch> & { size?: "sm" | "md" | "lg" },
) {
	const [local, others] = splitProps(props, [
		"size",
		"checked",
		"onChange",
		"class",
	]);

	const [checked, setChecked] = createSignal(local.checked ?? false);

	// travel = track_width - thumb_width - ms-0.5 offset
	// sm: 32 - 16.5 - 2 ≈ 12px  md: 40 - 22 - 2 = 16px  lg: 48 - 27.5 - 2 ≈ 14px
	const travel = () =>
		local.size === "sm" ? 12 : local.size === "lg" ? 14 : 16;

	return (
		<KSwitch
			checked={checked()}
			onChange={(v) => {
				setChecked(v);
				local.onChange?.(v);
			}}
			{...others}
			class={cx("inline-flex items-center gap-3", local.class)}
		>
			<KSwitch.Input class="sr-only" />
			<KSwitch.Control
				class={cx(
					"relative flex shrink-0 items-center overflow-hidden rounded-full cursor-pointer",
					"transition-colors duration-[250ms] ease-out",
					"bg-gray-5 data-[checked]:bg-blue-9",
					local.size === "sm"
						? "h-4 w-8"
						: local.size === "lg"
							? "h-6 w-12"
							: "h-5 w-10",
				)}
			>
				<motion.div
					class={cx(
						// ms-0.5 = 2px starting offset, pill shape matching HeroUI thumb ratio
						"ms-0.5 shrink-0 rounded-full bg-white shadow-sm will-change-transform",
						"transition-[background-color] duration-200",
						local.size === "sm"
							? "h-3 w-[0.9375rem]" // ~10.5px × 15px
							: local.size === "lg"
								? "h-5 w-[1.5625rem]" // ~20px × 25px
								: "h-4 w-[1.25rem]", // 16px × 20px
					)}
					animate={{ x: checked() ? travel() : 0 }}
					transition={{
						type: "spring",
						stiffness: 500,
						damping: 35,
						mass: 0.7,
					}}
				/>
			</KSwitch.Control>
		</KSwitch>
	);
}
