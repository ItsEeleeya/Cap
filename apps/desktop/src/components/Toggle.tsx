import { Switch as KSwitch } from "@kobalte/core/switch";
import { createEventListenerMap } from "@solid-primitives/event-listener";
import { type } from "@tauri-apps/plugin-os";
import { cva } from "cva";
import { type ComponentProps, createRoot, createSignal, splitProps } from "solid-js";
import { commands } from "~/utils/tauri";

const toggleControlStyles = cva("flex shrink-0 items-center rounded-full bg-gray-6 transition-[background-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] cursor-pointer group-focus-visible:ring-2 group-focus-visible:ring-blue-300 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent group-data-[disabled]:bg-gray-3 group-data-[checked]:bg-blue-500 group-data-[pressed]:bg-gray-5", {
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

const toggleThumbStyles = cva("ms-0.5 rounded-full bg-white shadow-[0px_0px_1px_0px_rgb(0_0_0_/0.3)] transition-[margin,background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] will-change-[margin,transform] group-data-[disabled]:opacity-40 group-data-[checked]:bg-white group-data-[checked]:shadow-[0px_0px_5px_0px_rgb(0_0_0_/0.02),0px_2px_10px_0px_rgb(0_0_0_/0.06),0px_0px_1px_0px_rgb(0_0_0_/0.3)] group-active:scale-x-90 group-active:scale-y-95", {
	variants: {
		size: {
			sm: "h-[0.75rem] w-[1.13125rem] group-data-[checked]:ms-[calc(100%-1.25625rem)]",
			md: "h-[1rem] w-[1.475rem] group-data-[checked]:ms-[calc(100%-1.6rem)]",
			lg: "h-[1.25rem] w-[1.81875rem] group-data-[checked]:ms-[calc(100%-1.94375rem)]",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

const DRAG_THRESHOLD = 8;
const macos = type() === "macos";
function performHaptic() {
	if (macos) commands.performHapticFeedback("alignment", "default");
}

export function Toggle(
	props: ComponentProps<typeof KSwitch> & { size?: "sm" | "md" | "lg" },
) {
	const [local, others] = splitProps(props, ["size"]);
	const [dragChecked, setDragChecked] = createSignal<boolean | undefined>(undefined);
	const effectiveChecked = () => dragChecked() ?? Boolean(others.checked);

	function onThumbPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();

		let refX = e.clientX;
		let intendedState = Boolean(others.checked);
		let didDragToggle = false;

		createRoot((cleanup) => {
			createEventListenerMap(window, {
				pointermove: (e) => {
					const deltaX = e.clientX - refX;

					if (!intendedState && deltaX > DRAG_THRESHOLD) {
						intendedState = true;
						didDragToggle = true;
						refX = e.clientX;
						setDragChecked(true);
						performHaptic();
					} else if (intendedState && deltaX < -DRAG_THRESHOLD) {
						intendedState = false;
						didDragToggle = true;
						refX = e.clientX;
						setDragChecked(false);
						performHaptic();
					}
				},
				pointerup: () => {
					if (didDragToggle) {
						props.onChange?.(intendedState);
						window.addEventListener("click", (e) => {
							e.stopPropagation();
							e.preventDefault();
						}, { capture: true, once: true });
					}
					setDragChecked(undefined);
					cleanup();
				},
			});
		});
	}

	return (

		<KSwitch class="group relative inline-flex items-center" {...others} checked={effectiveChecked()}>
			<KSwitch.Input class="peer absolute inset-0 cursor-pointer opacity-0" />
			<KSwitch.Control class={toggleControlStyles({ size: local.size })}>
				<KSwitch.Thumb
					class={toggleThumbStyles({ size: local.size })}
					onPointerDown={onThumbPointerDown}
				/>
			</KSwitch.Control>
		</KSwitch>
	);
}