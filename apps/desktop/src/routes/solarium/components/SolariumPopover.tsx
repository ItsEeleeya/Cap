import type { PopoverRootProps } from "@kobalte/core/popover";
import { Popover } from "@kobalte/core/popover";
import { animate, spring } from "@motionone/dom";
import { createContextProvider } from "@solid-primitives/context";
import {
	type Component,
	createEffect,
	createMemo,
	createSignal,
	createUniqueId,
	type JSX,
	mergeProps,
	onCleanup,
	Show,
	splitProps,
} from "solid-js";

const TRANSITION = {
	type: "spring" as const,
	bounce: 0.1,
	duration: 0.4,
};

const [MorphingPopoverContextProvider, useMorphingPopoverContext] =
	createContextProvider(
		(props: {
			defaultOpen?: boolean;
			open?: boolean;
			onOpenChange?: (open: boolean) => void;
		}) => {
			const uniqueId = createUniqueId();
			const [uncontrolledOpen, setUncontrolledOpen] = createSignal(
				props.defaultOpen ?? false,
			);
			const [triggerRef, setTriggerRef] = createSignal<HTMLElement | null>(
				null,
			);
			const [contentRef, setContentRef] = createSignal<HTMLElement | null>(
				null,
			);

			const isOpen = createMemo(() => props.open ?? uncontrolledOpen());

			const open = () => {
				if (props.open === undefined) {
					setUncontrolledOpen(true);
				}
				props.onOpenChange?.(true);
			};

			const close = () => {
				if (props.open === undefined) {
					setUncontrolledOpen(false);
				}
				props.onOpenChange?.(false);
			};

			return {
				isOpen,
				open,
				close,
				uniqueId,
				triggerRef,
				setTriggerRef,
				contentRef,
				setContentRef,
			};
		},
	);

export type SolariumPopoverProps = Omit<PopoverRootProps, "children"> & {
	children: JSX.Element;
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	class?: string;
};

export const SolariumPopover: Component<SolariumPopoverProps> = (props) => {
	const [local, rest] = splitProps(props, [
		"children",
		"defaultOpen",
		"open",
		"onOpenChange",
		"class",
	]);

	return (
		<MorphingPopoverContextProvider
			defaultOpen={local.defaultOpen}
			open={local.open}
			onOpenChange={local.onOpenChange}
		>
			<PopoverWrapper {...rest} class={local.class}>
				{local.children}
			</PopoverWrapper>
		</MorphingPopoverContextProvider>
	);
};

const PopoverWrapper: Component<
	Omit<PopoverRootProps, "children" | "open" | "onOpenChange"> & {
		children: JSX.Element;
		class?: string;
	}
> = (props) => {
	const context = useMorphingPopoverContext();
	const [local, rest] = splitProps(props, ["children", "class"]);

	if (!context) {
		throw new Error(
			"PopoverWrapper must be used within MorphingPopoverContext",
		);
	}

	const merged = mergeProps(
		{
			placement: "bottom" as const,
		},
		rest,
	);

	return (
		<Popover
			{...merged}
			open={context.isOpen()}
			onOpenChange={(open) => {
				if (open) {
					context.open();
				} else {
					context.close();
				}
			}}
			forceMount
		>
			<div class={local.class}>{local.children}</div>
		</Popover>
	);
};

export type SolariumPopoverTriggerProps = {
	children: JSX.Element;
	asChild?: boolean;
	class?: string;
	style?: JSX.CSSProperties;
} & JSX.ButtonHTMLAttributes<HTMLButtonElement>;

export const SolariumPopoverTrigger: Component<SolariumPopoverTriggerProps> = (
	props,
) => {
	const context = useMorphingPopoverContext();
	if (!context) {
		throw new Error(
			"SolariumPopoverTrigger must be used within SolariumPopover",
		);
	}

	const [local, rest] = splitProps(props, [
		"children",
		"asChild",
		"class",
		"style",
	]);

	return (
		<Popover.Trigger
			ref={context.setTriggerRef}
			class={local.class}
			style={local.style}
			{...rest}
		>
			{local.children}
		</Popover.Trigger>
	);
};

export type SolariumPopoverContentProps = {
	children: JSX.Element;
	class?: string;
	style?: JSX.CSSProperties;
} & JSX.HTMLAttributes<HTMLDivElement>;

export const SolariumPopoverContent: Component<SolariumPopoverContentProps> = (
	props,
) => {
	const context = useMorphingPopoverContext();
	if (!context) {
		throw new Error(
			"SolariumPopoverContent must be used within SolariumPopover",
		);
	}

	const [local, rest] = splitProps(props, ["children", "class", "style"]);

	const [isReady, setIsReady] = createSignal(false);
	let animationCleanup: (() => void) | null = null;

	createEffect(() => {
		if (!context.isOpen()) {
			const cleanup = animationCleanup;
			if (cleanup) {
				cleanup();
				animationCleanup = null;
			}
			setIsReady(false);
			return;
		}

		const trigger = context.triggerRef();
		const content = context.contentRef();

		if (!trigger || !content) return;

		const performAnimation = () => {
			const triggerRect = trigger.getBoundingClientRect();
			const contentRect = content.getBoundingClientRect();

			if (contentRect.width === 0 || contentRect.height === 0) {
				requestAnimationFrame(performAnimation);
				return;
			}

			const triggerCenterX = triggerRect.left + triggerRect.width / 2;
			const triggerCenterY = triggerRect.top + triggerRect.height / 2;
			const contentCenterX = contentRect.left + contentRect.width / 2;
			const contentCenterY = contentRect.top + contentRect.height / 2;

			const dx = triggerCenterX - contentCenterX;
			const dy = triggerCenterY - contentCenterY;
			const scaleX = Math.max(0.1, triggerRect.width / contentRect.width);
			const scaleY = Math.max(0.1, triggerRect.height / contentRect.height);

			const triggerBorderRadius =
				parseFloat(getComputedStyle(trigger).borderRadius) || 0;
			const contentBorderRadius =
				parseFloat(getComputedStyle(content).borderRadius) || 0;

			content.style.transformOrigin = "center center";
			content.style.opacity = "0";
			content.style.filter = "blur(8px)";
			content.style.borderRadius = `${triggerBorderRadius}px`;
			content.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
			content.style.pointerEvents = "none";
			content.style.visibility = "visible";

			trigger.style.filter = "blur(4px)";
			trigger.style.transition = "filter 200ms ease-out";
			trigger.style.opacity = "0";
			trigger.style.pointerEvents = "none";

			setIsReady(true);

			requestAnimationFrame(() => {
				const controls = animate(
					content,
					{
						opacity: [0, 1],
						filter: ["blur(8px)", "blur(0px)"],
						borderRadius: [
							`${triggerBorderRadius}px`,
							`${contentBorderRadius}px`,
						],
						transform: [
							`translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
							"translate(0px, 0px) scale(1, 1)",
						],
					},
					{
						duration: TRANSITION.duration,
						easing: spring({
							stiffness: 400,
							damping: 30,
							mass: 0.5,
						}),
					},
				);

				controls.finished.then(() => {
					content.style.pointerEvents = "";
					content.style.transform = "";
					trigger.style.opacity = "";
					trigger.style.pointerEvents = "";
				});

				animationCleanup = () => {
					controls.stop();
					trigger.style.filter = "";
					trigger.style.transition = "";
					trigger.style.opacity = "";
					trigger.style.pointerEvents = "";
					content.style.transform = "";
					content.style.opacity = "";
					content.style.filter = "";
					content.style.borderRadius = "";
					content.style.pointerEvents = "";
					content.style.visibility = "";
				};

				onCleanup(animationCleanup);
			});
		};

		content.style.visibility = "hidden";
		requestAnimationFrame(() => {
			requestAnimationFrame(performAnimation);
		});
	});

	createEffect(() => {
		if (!context.isOpen()) {
			const cleanup = animationCleanup;
			if (cleanup) {
				cleanup();
				animationCleanup = null;
			}

			const trigger = context.triggerRef();
			if (trigger) {
				trigger.style.filter = "";
				trigger.style.transition = "";
				trigger.style.opacity = "";
				trigger.style.pointerEvents = "";
			}

			const content = context.contentRef();

			if (content && trigger) {
				const triggerRect = trigger.getBoundingClientRect();
				const contentRect = content.getBoundingClientRect();

				if (
					triggerRect &&
					contentRect &&
					contentRect.width > 0 &&
					contentRect.height > 0
				) {
					const triggerCenterX = triggerRect.left + triggerRect.width / 2;
					const triggerCenterY = triggerRect.top + triggerRect.height / 2;
					const contentCenterX = contentRect.left + contentRect.width / 2;
					const contentCenterY = contentRect.top + contentRect.height / 2;

					const dx = triggerCenterX - contentCenterX;
					const dy = triggerCenterY - contentCenterY;
					const scaleX = Math.max(0.1, triggerRect.width / contentRect.width);
					const scaleY = Math.max(0.1, triggerRect.height / contentRect.height);

					content.style.pointerEvents = "none";

					animate(
						content,
						{
							opacity: [1, 0],
							filter: ["blur(0px)", "blur(4px)"],
							transform: [
								"translate(0px, 0px) scale(1, 1)",
								`translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
							],
						},
						{
							duration: 0.2,
							easing: "ease-in",
						},
					).finished.then(() => {
						if (content) {
							content.style.transform = "";
							content.style.opacity = "";
							content.style.filter = "";
							content.style.pointerEvents = "";
							content.style.visibility = "";
						}
					});
				}
			}

			if (trigger) {
				animate(
					trigger,
					{ filter: ["blur(4px)", "blur(0px)"] },
					{ duration: 0.2, easing: "ease-out" },
				).finished.then(() => {
					if (trigger) {
						trigger.style.filter = "";
						trigger.style.transition = "";
					}
				});
			}
		}
	});

	return (
		<Popover.Portal>
			<Show when={context.isOpen()}>
				<Popover.Content
					ref={context.setContentRef}
					class={local.class}
					style={{
						...(local.style || {}),
						visibility: isReady() ? "visible" : "hidden",
					}}
					{...rest}
				>
					{local.children}
				</Popover.Content>
			</Show>
		</Popover.Portal>
	);
};
