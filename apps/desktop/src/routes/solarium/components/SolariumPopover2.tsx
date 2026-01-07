import { cx } from "cva";
import type { Transition, Variants } from "motion-solid";
import { AnimatePresence, MotionConfig, motion } from "motion-solid";
import {
	createContext,
	createEffect,
	createSignal,
	createUniqueId,
	type JSX,
	onCleanup,
	type ParentProps,
	splitProps,
	useContext,
} from "solid-js";

const TRANSITION: Transition = {
	type: "spring",
	bounce: 0.1,
	duration: 0.4,
};

type SolariumPopoverContextValue = {
	isOpen: () => boolean;
	open: () => void;
	close: () => void;
	uniqueId: string;
	variants?: Variants;
};

const SolariumPopoverContext = createContext<SolariumPopoverContextValue>();

type UsePopoverLogicProps = {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

function usePopoverLogic(props: UsePopoverLogicProps = {}) {
	const uniqueId = createUniqueId();
	const [uncontrolledOpen, setUncontrolledOpen] = createSignal(
		props.defaultOpen ?? false,
	);

	const isOpen = () => props.open ?? uncontrolledOpen();

	function open() {
		if (props.open === undefined) {
			setUncontrolledOpen(true);
		}
		props.onOpenChange?.(true);
	}

	function close() {
		if (props.open === undefined) {
			setUncontrolledOpen(false);
		}
		props.onOpenChange?.(false);
	}

	return { isOpen, open, close, uniqueId };
}

export type SolariumPopoverProps = ParentProps<{
	transition?: Transition;
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	variants?: Variants;
	class?: string;
}> &
	JSX.HTMLAttributes<HTMLDivElement>;

export function SolariumPopover(props: SolariumPopoverProps) {
	const [local, others] = splitProps(props, [
		"children",
		"transition",
		"defaultOpen",
		"open",
		"onOpenChange",
		"variants",
		"class",
	]);

	const popoverLogic = usePopoverLogic({
		defaultOpen: local.defaultOpen,
		open: local.open,
		onOpenChange: local.onOpenChange,
	});

	return (
		<SolariumPopoverContext.Provider
			value={{ ...popoverLogic, variants: local.variants }}
		>
			<MotionConfig transition={local.transition ?? TRANSITION}>
				<div
					class={cx("relative flex items-center justify-center", local.class)}
					{...others}
				>
					{local.children}
				</div>
			</MotionConfig>
		</SolariumPopoverContext.Provider>
	);
}

export type SolariumPopoverTriggerProps = ParentProps<{
	class?: string;
}> &
	JSX.HTMLAttributes<HTMLButtonElement>;

export function SolariumPopoverTrigger(props: SolariumPopoverTriggerProps) {
	const [local, others] = splitProps(props, ["children", "class"]);
	const context = useContext(SolariumPopoverContext);

	if (!context) {
		throw new Error(
			"SolariumPopoverTrigger must be used within SolariumPopover",
		);
	}

	return (
		<motion.div layoutId={`popover-trigger-${context.uniqueId}`}>
			<motion.button
				{...others}
				layoutId={`popover-label-${context.uniqueId}`}
				class={local.class}
				onClick={context.open}
				aria-expanded={context.isOpen()}
				aria-controls={`popover-content-${context.uniqueId}`}
			>
				{local.children}
			</motion.button>
		</motion.div>
	);
}

export type SolariumPopoverContentProps = ParentProps<{
	class?: string;
}> &
	JSX.HTMLAttributes<HTMLDivElement>;

export function SolariumPopoverContent(props: SolariumPopoverContentProps) {
	const [local, others] = splitProps(props, ["children", "class"]);
	const context = useContext(SolariumPopoverContext);

	if (!context) {
		throw new Error(
			"SolariumPopoverContent must be used within SolariumPopover",
		);
	}

	let ref: HTMLDivElement | undefined;
	// useClickOutside(() => ref, context.close);

	createEffect(() => {
		if (!context.isOpen()) return;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				context?.close();
			}
		}

		document.addEventListener("keydown", handleKeyDown);
		onCleanup(() => document.removeEventListener("keydown", handleKeyDown));
	});

	return (
		<AnimatePresence>
			{context.isOpen() && (
				<motion.div
					{...others}
					ref={ref}
					layoutId={`popover-trigger-${context.uniqueId}`}
					id={`popover-content-${context.uniqueId}`}
					role="dialog"
					aria-modal="true"
					class={cx("absolute overflow-hidden mb-50", local.class)}
					initial="initial"
					animate="animate"
					exit="exit"
					variants={context.variants}
				>
					{local.children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
