import {
	createEventListener,
	createEventListenerMap,
} from "@solid-primitives/event-listener";
import {
	children,
	createEffect,
	createSignal,
	type JSX,
	onCleanup,
	onMount,
	type ParentProps,
	splitProps,
} from "solid-js";
import { createStore } from "solid-js/store";

export function ScrollAreaRoot(props: ParentProps<{ class?: string }>) {
	const resolved = children(() => props.children);
	const [viewport, setViewport] = createSignal<HTMLElement | null>(null);
	const [state, setState] = createStore({
		hovering: false,
		scrolling: false,
		hasY: false,
		hasX: false,
		timeout: null as NodeJS.Timeout | null,
	});

	let rootRef: HTMLDivElement | undefined;

	function bindViewport(el: HTMLElement | null) {
		setViewport(el);
	}

	function updateOverflow() {
		const v = viewport();
		if (!v) return;

		const hasY = v.scrollHeight > v.clientHeight;
		const hasX = v.scrollWidth > v.clientWidth;
		setState({ hasY, hasX });
	}

	onMount(() => {
		const v = viewport();
		if (!v) return;

		createEventListener(v, "scroll", () => {
			if (state.timeout) clearTimeout(state.timeout);
			setState({
				scrolling: true,
				timeout: setTimeout(() => setState({ scrolling: false }), 120),
			});
		});

		const ro = new ResizeObserver(updateOverflow);
		ro.observe(v);

		const mo = new MutationObserver(updateOverflow);
		mo.observe(v, { childList: true, subtree: true });

		onCleanup(() => {
			ro.disconnect();
			mo.disconnect();
		});

		updateOverflow();
	});

	return (
		<div
			ref={rootRef}
			class={`relative ${props.class ?? ""}`}
			data-hovering={state.hovering}
			data-scrolling={state.scrolling}
			data-has-overflow-y={state.hasY || undefined}
			data-has-overflow-x={state.hasX || undefined}
			onMouseEnter={() => setState({ hovering: true })}
			onMouseLeave={() => setState({ hovering: false })}
		>
			{resolved()}
		</div>
	);
}

type ViewportProps = {
	children?: JSX.Element;
	class?: string;
	bind?: (el: HTMLElement | null) => void;
};

export function ScrollAreaViewport(props: ViewportProps) {
	let ref: HTMLDivElement | undefined;

	onMount(() => {
		props.bind?.(ref ?? null);
	});

	return (
		<div
			ref={ref}
			class={`relative h-full w-full overflow-auto ${props.class ?? ""}`}
			tabIndex={0}
		>
			{props.children}
		</div>
	);
}

type ContentProps = {
	children?: JSX.Element;
	class?: string;
};

export function ScrollAreaContent(props: ContentProps) {
	return <div class={`relative ${props.class ?? ""}`}>{props.children}</div>;
}

type ScrollbarProps = {
	viewport: HTMLElement | null;
	orientation?: "vertical" | "horizontal";
	class?: string;
};

export function ScrollAreaScrollbar(props: ScrollbarProps) {
	const orientation = props.orientation ?? "vertical";

	const [state, setState] = createStore({
		thumbSize: 0,
		thumbPos: 0,
	});

	let trackRef: HTMLDivElement | undefined;

	function update() {
		const v = props.viewport;
		if (!v || !trackRef) return;

		if (orientation === "vertical") {
			const ratio = v.clientHeight / v.scrollHeight;
			const size = Math.max(ratio * trackRef.clientHeight, 30);
			const pos =
				(v.scrollTop / (v.scrollHeight - v.clientHeight)) *
				(trackRef.clientHeight - size);

			setState({
				thumbSize: size,
				thumbPos: Number.isNaN(pos) ? 0 : pos,
			});
		} else {
			const ratio = v.clientWidth / v.scrollWidth;
			const size = Math.max(ratio * trackRef.clientWidth, 30);
			const pos =
				(v.scrollLeft / (v.scrollWidth - v.clientWidth)) *
				(trackRef.clientWidth - size);

			setState({
				thumbSize: size,
				thumbPos: Number.isNaN(pos) ? 0 : pos,
			});
		}
	}

	createEffect(() => {
		update();
	});

	createEffect(() => {
		const v = props.viewport;
		if (!v) return;

		const off = createEventListener(v, "scroll", update);
		return off;
	});

	return (
		<div
			ref={trackRef}
			data-orientation={orientation}
			style={{
				"--scroll-area-thumb-height": `${state.thumbSize}px`,
				"--scroll-area-thumb-width": `${state.thumbSize}px`,
			}}
			class={`absolute ${
				orientation === "vertical"
					? "right-1 top-1 bottom-1 w-1"
					: "left-1 right-1 bottom-1 h-1"
			} ${props.class ?? ""}`}
		>
			<ScrollAreaThumb
				orientation={orientation}
				size={state.thumbSize}
				pos={state.thumbPos}
				viewport={props.viewport}
				track={trackRef}
			/>
		</div>
	);
}

type ThumbProps = {
	orientation: "vertical" | "horizontal";
	size: number;
	pos: number;
	viewport: HTMLElement | null;
	track: HTMLDivElement | undefined;
	class?: string;
};

export function ScrollAreaThumb(props: ThumbProps) {
	let ref: HTMLDivElement | undefined;

	const onDown = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const startY = e.clientY;
		const startX = e.clientX;
		const startScrollY = props.viewport?.scrollTop ?? 0;
		const startScrollX = props.viewport?.scrollLeft ?? 0;

		createEventListenerMap(window, {
			mousemove: (ev: MouseEvent) => {
				if (!props.viewport || !props.track) return;

				if (props.orientation === "vertical") {
					const delta = ev.clientY - startY;
					const trackH = props.track.clientHeight - props.size;
					const contentH =
						props.viewport.scrollHeight - props.viewport.clientHeight;

					const ratio = contentH / Math.max(trackH, 1);
					props.viewport.scrollTop = startScrollY + delta * ratio;
				} else {
					const delta = ev.clientX - startX;
					const trackW = props.track.clientWidth - props.size;
					const contentW =
						props.viewport.scrollWidth - props.viewport.clientWidth;

					const ratio = contentW / Math.max(trackW, 1);
					props.viewport.scrollLeft = startScrollX + delta * ratio;
				}
			},
			mouseup: () => {},
		});
	};

	return (
		<div
			ref={ref}
			data-orientation={props.orientation}
			class={`absolute rounded bg-base-content/40 hover:bg-base-content/70 transition-colors ${
				props.class ?? ""
			}`}
			style={
				props.orientation === "vertical"
					? {
							top: `${props.pos}px`,
							height: `${props.size}px`,
							width: "100%",
						}
					: {
							left: `${props.pos}px`,
							width: `${props.size}px`,
							height: "100%",
						}
			}
			onMouseDown={onDown}
		/>
	);
}

export function ScrollAreaCorner() {
	return (
		<div
			class="absolute right-0 bottom-0 w-2 h-2 bg-transparent"
			style={{
				width: "var(--scroll-area-corner-width, 8px)",
				height: "var(--scroll-area-corner-height, 8px)",
			}}
		/>
	);
}

type Props = {
	target: HTMLElement;
	hideDelay?: number;
	class?: string;
};

export default function VirtualScrollbar(props: Props) {
	const [state, setState] = createStore({
		dragging: false,
		isVisible: false,
		hideTimeoutId: 0 as number | NodeJS.Timeout,
		thumbHeight: 0,
		thumbTop: 0,
		dragStartY: 0,
		scrollStartTop: 0,
	});

	const [target, setTarget] = createSignal<HTMLElement | null>(null);
	let containerRef: HTMLDivElement | undefined;
	let trackRef: HTMLDivElement | undefined;
	let thumbRef: HTMLDivElement | undefined;

	onMount(() => {
		setTarget(props.target);
		const targetElement = target();
		if (!targetElement) return;

		updateThumb();

		createEventListener(targetElement, "scroll", handleScroll);
		createEventListener(window, "resize", updateThumb);

		const resizeObserver = new ResizeObserver(updateThumb);
		resizeObserver.observe(targetElement);

		const mutationObserver = new MutationObserver(updateThumb);
		mutationObserver.observe(targetElement, {
			childList: true,
			subtree: true,
			characterData: true,
		});

		onCleanup(() => {
			clearTimeout(state.hideTimeoutId as NodeJS.Timeout);
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		});
	});

	createEffect(() => {
		if (target()) updateThumb();
	});

	function updateThumb() {
		const targetElement = target();
		if (!targetElement || !trackRef || !containerRef) return;

		// Calculate the thumb height proportional to visible content
		const contentHeight = targetElement.scrollHeight;
		const viewportHeight = targetElement.clientHeight;
		const trackHeight = trackRef.clientHeight;

		const scrollPercentage = viewportHeight / contentHeight;
		const thumbHeight = Math.max(scrollPercentage * trackHeight, 30); // Minimum 30px thumb height

		// Calculate the thumb position based on scroll position
		const scrollTop = targetElement.scrollTop;
		const maxScroll = contentHeight - viewportHeight;

		// Allow overscroll effects by not clamping the percentage
		const scrollPercentageTop = scrollTop / maxScroll;

		const thumbTop = scrollPercentageTop * (trackHeight - thumbHeight);

		setState({
			thumbHeight,
			thumbTop: Number.isNaN(thumbTop) ? 0 : thumbTop,
		});
	}

	function handleScroll() {
		showScrollbar();
		updateThumb();
	}

	function showScrollbar() {
		setState({ isVisible: true });
		clearTimeout(state.hideTimeoutId as NodeJS.Timeout);

		const timeout = setTimeout(() => {
			setState({ isVisible: false });
		}, props.hideDelay || 1500);

		setState({ hideTimeoutId: timeout });
	}

	function handleTrackClick(e: MouseEvent) {
		const targetElement = target();
		if (!targetElement || !trackRef || state.dragging) return;

		const trackRect = trackRef.getBoundingClientRect();
		const clickY = e.clientY - trackRect.top;
		const trackHeight = trackRect.height;
		const contentHeight = targetElement.scrollHeight;
		const viewportHeight = targetElement.clientHeight;

		const scrollPercentage = clickY / trackHeight;
		const newScrollTop = scrollPercentage * (contentHeight - viewportHeight);

		targetElement.scrollTop = newScrollTop;
		showScrollbar();
	}

	const handleThumbMouseDown = (e: MouseEvent) =>
		createRoot((dispose) => {
			e.preventDefault();
			const targetElement = target();
			if (!targetElement) return;

			setState({
				dragging: true,
				dragStartY: e.clientY,
				scrollStartTop: targetElement.scrollTop,
			});

			showScrollbar();
			createEventListenerMap(window, {
				mousemove: (e) => {
					const targetElement = target();
					if (!targetElement || !trackRef || !state.dragging) return;

					const deltaY = e.clientY - state.dragStartY;
					const trackHeight = trackRef.clientHeight;
					const thumbHeight = state.thumbHeight;
					const scrollableTrackHeight = trackHeight - thumbHeight;

					const contentHeight = targetElement.scrollHeight;
					const viewportHeight = targetElement.clientHeight;
					const scrollableContentHeight = contentHeight - viewportHeight;

					const moveRatio = scrollableContentHeight / scrollableTrackHeight;
					const newScrollTop = state.scrollStartTop + deltaY * moveRatio;

					targetElement.scrollTop = newScrollTop;
					showScrollbar();
				},
				mouseup: () => {
					setState({ dragging: false });
					dispose();
				},
			});
		});

	function handleMouseEnter() {
		showScrollbar();
	}

	return (
		<div
			ref={containerRef}
			data-dragging={state.dragging}
			data-visible={state.isVisible}
			class={`fixed pointer-events-auto transition-opacity duration-300 hover:opacity-100 data-[visible=true]:opacity-100 opacity-0 ${
				props.class || ""
			}`}
			onMouseEnter={handleMouseEnter}
			aria-hidden="true"
		>
			{/* Track container - This is a visual-only scrollbar, the native scrollbar remains functional for keyboard and screen reader users */}
			<div class="absolute inset-0 overflow-hidden rounded-full *:transition-all *:duration-300">
				{/* Track background */}
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: 
            webview should handle keyboard as we're only hiding the scrollbar, not disabling it
        */}
				<div
					ref={trackRef}
					data-dragging={state.dragging}
					class="absolute inset-0 w-full bg-transparent rounded-full hover:bg-base-content/10 data-[dragging=true]:bg-base-content/10 transition-all duration-300 "
					onClick={handleTrackClick}
				>
					{/* Thumb */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: 
            webview should handle keyboard as we're only hiding the scrollbar, not disabling it
          */}
					<div
						ref={thumbRef}
						data-dragging={state.dragging}
						class="absolute w-full rounded-full bg-base-content/30 hover:bg-base-content/70 data-[dragging=true]:bg-base-content/70 apple-blur transition-colors duration-300"
						style={{
							top: `${state.thumbTop}px`,
							height: `${state.thumbHeight}px`,
						}}
						onMouseDown={(e) => {
							e.stopPropagation();
							handleThumbMouseDown(e);
						}}
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			</div>
		</div>
	);
}
