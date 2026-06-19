/**
 * Private visual scrollbar overlay that mirrors native scrolling.
 *
 * It is intentionally a visual-only scrollbar: the native scroll target
 * remains the source of truth for content position, keyboard access, and
 * assistive technology. Use this component only through the `Scroller`
 * wrapper.
 */
import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { createEffect, createSignal, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";

type Orientation = "vertical" | "horizontal" | "both";

type Props = {
	target: HTMLElement | (() => HTMLElement | null) | null;
	hideDelay?: number;
	orientation?: Orientation;
	thickness?: number;
	expandedThickness?: number;
	class?: string;
	style?: string;
};

export default function VirtualScrollbarPrimitive(props: Props) {
	const [state, setState] = createStore({
		dragging: false,
		isVisible: false,
		thumbSize: 0,
		thumbOffset: 0,
		dragStartPos: 0,
		scrollStartPos: 0,
	});

	let currentTarget: HTMLElement | null = null;
	let trackRef: HTMLDivElement | undefined;
	let cleanupScroll: (() => void) | undefined;
	let cleanupResize: (() => void) | undefined;
	let cleanupObserver: (() => void) | undefined;
	let cleanupPointerEvents: (() => void) | undefined;
	let hideTimeoutId: number | undefined;
	let rafId = 0;
	let mo: MutationObserver | null = null;

	const [hover, setHover] = createSignal(false);
	const orientation = () => props.orientation ?? "vertical";
	const thickness = () => props.thickness ?? 8;
	const expandedThickness = () => props.expandedThickness ?? 14;
	const hideDelay = () => props.hideDelay ?? 1200;

	function readTarget(): HTMLElement | null {
		if (!props.target) return null;
		if (typeof props.target === "function") return props.target();
		return props.target;
	}

	function cleanupTarget() {
		cleanupScroll?.();
		cleanupResize?.();
		cleanupObserver?.();
		cleanupPointerEvents?.();
		cleanupScroll = undefined;
		cleanupResize = undefined;
		cleanupObserver = undefined;
		cleanupPointerEvents = undefined;
		mo?.disconnect();
		mo = null;
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
	}

	function scheduleUpdate() {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(updateThumb);
	}

	function installTarget(el: HTMLElement) {
		cleanupTarget();
		currentTarget = el;

		function onScroll() {
			showScrollbar();
			scheduleUpdate();
		}

		cleanupScroll = makeEventListener(el, "scroll", onScroll, {
			passive: true,
		});
		cleanupResize = makeEventListener(window, "resize", scheduleUpdate);
		const resizeObserver = makeResizeObserver(scheduleUpdate);
		resizeObserver.observe(el);
		cleanupObserver = () => resizeObserver.unobserve(el);

		mo = new MutationObserver(debounce(scheduleUpdate, 120));
		mo.observe(el, { childList: true, subtree: true, characterData: true });

		scheduleUpdate();
	}

	createEffect(() => {
		const el = readTarget();
		if (el === currentTarget) return;
		if (!el) {
			cleanupTarget();
			currentTarget = null;
			return;
		}
		installTarget(el);
	});

	onCleanup(() => {
		cleanupTarget();
		if (hideTimeoutId) clearTimeout(hideTimeoutId);
	});

	function debounce(fn: (...args: unknown[]) => void, wait: number) {
		let t: number | undefined;
		return (...args: unknown[]) => {
			if (t) clearTimeout(t);
			t = setTimeout(() => fn(...args), wait) as unknown as number;
		};
	}

	function isRtl(el: HTMLElement) {
		return getComputedStyle(el).direction === "rtl";
	}

	function getNormalizedScrollLeft(el: HTMLElement) {
		if (!isRtl(el)) return el.scrollLeft;
		const maxScroll = el.scrollWidth - el.clientWidth;
		return el.scrollLeft < 0 ? -el.scrollLeft : maxScroll - el.scrollLeft;
	}

	function setNormalizedScrollLeft(el: HTMLElement, value: number) {
		if (!isRtl(el)) {
			el.scrollLeft = value;
			return;
		}

		if (el.scrollLeft < 0) {
			el.scrollLeft = -value;
			return;
		}

		el.scrollLeft = el.scrollWidth - el.clientWidth - value;
	}

	function updateThumb() {
		const el = currentTarget;
		if (!el || !trackRef) return;

		const trackSize =
			orientation() === "horizontal"
				? trackRef.clientWidth
				: trackRef.clientHeight;
		const contentSize =
			orientation() === "horizontal" ? el.scrollWidth : el.scrollHeight;
		const viewportSize =
			orientation() === "horizontal" ? el.clientWidth : el.clientHeight;

		if (contentSize <= 0 || viewportSize <= 0) {
			setState({ thumbSize: 0, thumbOffset: 0 });
			return;
		}

		const ratio = viewportSize / contentSize;
		const minSize = 24;
		const thumbSize = Math.max(ratio * trackSize, minSize);

		const maxScroll = contentSize - viewportSize;
		const scrollPos =
			orientation() === "horizontal"
				? getNormalizedScrollLeft(el)
				: el.scrollTop;
		const percent = maxScroll > 0 ? scrollPos / maxScroll : 0;
		const thumbOffset = percent * (trackSize - thumbSize);

		setState({ thumbSize, thumbOffset });
	}

	function showScrollbar() {
		setState({ isVisible: true });
		if (hideTimeoutId) clearTimeout(hideTimeoutId);
		hideTimeoutId = setTimeout(
			() => setState({ isVisible: false }),
			hideDelay(),
		) as unknown as number;
	}

	function handleTrackClick(e: MouseEvent) {
		e.preventDefault();
		const el = currentTarget;
		if (!el || !trackRef) return;

		const rect = trackRef.getBoundingClientRect();
		const clickPos =
			orientation() === "horizontal"
				? e.clientX - rect.left
				: e.clientY - rect.top;
		const trackSize = orientation() === "horizontal" ? rect.width : rect.height;
		const contentSize =
			orientation() === "horizontal" ? el.scrollWidth : el.scrollHeight;
		const viewportSize =
			orientation() === "horizontal" ? el.clientWidth : el.clientHeight;
		const newScroll = (clickPos / trackSize) * (contentSize - viewportSize);
		if (orientation() === "horizontal") setNormalizedScrollLeft(el, newScroll);
		else el.scrollTop = newScroll;
		showScrollbar();
	}

	function handleThumbDown(e: PointerEvent) {
		e.preventDefault();
		const el = currentTarget;
		if (!el || !trackRef) return;

		setState({
			dragging: true,
			dragStartPos: orientation() === "horizontal" ? e.clientX : e.clientY,
			scrollStartPos:
				orientation() === "horizontal"
					? getNormalizedScrollLeft(el)
					: el.scrollTop,
		});

		const cleanupMove = makeEventListener(
			window,
			"pointermove",
			(ev: PointerEvent) => {
				if (!state.dragging || !trackRef) return;
				const delta =
					(orientation() === "horizontal" ? ev.clientX : ev.clientY) -
					state.dragStartPos;
				const trackSize =
					orientation() === "horizontal"
						? trackRef.clientWidth
						: trackRef.clientHeight;
				const thumbSize = state.thumbSize;
				const contentSize =
					orientation() === "horizontal" ? el.scrollWidth : el.scrollHeight;
				const viewportSize =
					orientation() === "horizontal" ? el.clientWidth : el.clientHeight;
				const maxThumbTravel = trackSize - thumbSize;
				const scrollable = contentSize - viewportSize;
				const ratio = scrollable / Math.max(maxThumbTravel, 1);
				const newScroll = state.scrollStartPos + delta * ratio;
				if (orientation() === "horizontal")
					setNormalizedScrollLeft(el, newScroll);
				else el.scrollTop = newScroll;
				showScrollbar();
			},
		);
		const cleanupUp = makeEventListener(window, "pointerup", onPointerEnd);
		const cleanupCancel = makeEventListener(
			window,
			"pointercancel",
			onPointerEnd,
		);
		cleanupPointerEvents = () => {
			cleanupMove?.();
			cleanupUp?.();
			cleanupCancel?.();
		};
	}

	function onPointerEnd() {
		setState({ dragging: false });
		cleanupPointerEvents?.();
		cleanupPointerEvents = undefined;
	}

	return (
		<div
			aria-hidden="true"
			data-visible={state.isVisible}
			class={`pointer-events-none transition-opacity duration-300 hover:opacity-100 data-[visible=true]:opacity-100 opacity-0 ${props.class ?? ""}`}
			style={`--vs-collapsed:${thickness()}px; --vs-expanded:${expandedThickness()}px; ${props.style ?? ""}`}
		>
			<div class="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
				<div
					ref={trackRef}
					data-dragging={state.dragging}
					class="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-auto"
					onClick={handleTrackClick}
				>
					<div
						class="vs-thumb bg-base-content/30 hover:bg-base-content/70 rounded-full transition-all duration-200"
						style={{
							width:
								orientation() === "horizontal"
									? `${state.thumbSize}px`
									: `${hover() ? expandedThickness() : thickness()}px`,
							height:
								orientation() === "horizontal"
									? `${hover() ? expandedThickness() : thickness()}px`
									: `${state.thumbSize}px`,
							transform:
								orientation() === "horizontal"
									? `translateX(${state.thumbOffset}px)`
									: `translateY(${state.thumbOffset}px)`,
							"transition-property": "width,height,transform,opacity",
						}}
						onPointerDown={(e) => {
							e.stopPropagation();
							handleThumbDown(e);
						}}
					/>
				</div>
			</div>
		</div>
	);

	// return (
	//     <div
	//         aria-hidden="true"
	//         data-visible={state.isVisible}
	//         class={`pointer-events-auto transition-opacity duration-300 hover:opacity-100 data-[visible=true]:opacity-100 opacity-0 ${props.class ?? ""}`}
	//         style={
	//             `--vs-collapsed:${thickness()}px; --vs-expanded:${expandedThickness()}px; ${props.style ?? ""}`
	//         }
	//         onMouseEnter={() => {
	//             setHover(true);
	//             showScrollbar();
	//         }}
	//         onMouseLeave={() => setHover(false)}
	//     >
	//         <div class="absolute inset-0 overflow-hidden rounded-full pointer-events-none">
	//             <div
	//                 ref={trackRef}
	//                 data-dragging={state.dragging}
	//                 class="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-auto"
	//                 onClick={handleTrackClick}
	//             >

	//             </div>
	//         </div>
	//     </div>
	// );
}
