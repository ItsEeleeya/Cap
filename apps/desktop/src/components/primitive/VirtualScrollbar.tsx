import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { cx } from "cva";
import { createEffect, type JSX, onCleanup } from "solid-js";
import { createStore } from "solid-js/store";
import { isWindows, Platform } from "~/components/Platform";

type Orientation = "vertical" | "horizontal";

type Props = {
	target: HTMLElement | (() => HTMLElement | null) | null;
	hideDelay?: number;
	orientation?: Orientation;
	thickness?: number;
	expandedThickness?: number;
	align?: "start" | "end" | "center";
	alwaysShow?: boolean;
	class?: string;
	style?: JSX.CSSProperties;
};

type ScrollbarState = {
	visible: boolean;
	expanded: boolean;
	hovered: boolean;
	dragging: boolean;
	thumbSize: number;
	thumbOffset: number;
	scrollable: number;
};

const SCROLL_LINE_RATIO = 0.3;
const SCROLL_LINE_MIN = 40;

export default function VirtualScrollbarPrimitive(props: Props) {
	const [state, setState] = createStore<ScrollbarState>({
		visible: false,
		expanded: false,
		hovered: false,
		dragging: false,
		thumbSize: 0,
		thumbOffset: 0,
		scrollable: 0,
	});

	let currentTarget: HTMLElement | null = null;
	let trackRef!: HTMLDivElement;

	let rafMeasure = 0;
	let rafUpdate = 0;
	let hideTimer = 0;
	let collapseTimer = 0;
	let cleanupDrag: (() => void) | undefined;

	let trackSize = 0;
	let dragStartPos = 0;
	let scrollStartPos = 0;

	const orientation = () => props.orientation ?? "vertical";
	const isVertical = () => orientation() === "vertical";
	const collapsedThickness = () => props.thickness ?? (isWindows ? 2 : 6);
	const expandedThickness = () => props.expandedThickness ?? 12;
	const hideDelay = () => props.hideDelay ?? 1200;
	const collapseDelay = 160;
	const align = () => props.align ?? "end";
	const isExpanded = () => state.dragging || state.expanded || state.hovered;
	const trackThickness = () =>
		isExpanded() ? expandedThickness() : collapsedThickness();

	function readTarget(): HTMLElement | null {
		if (!props.target) return null;
		if (typeof props.target === "function") return props.target();
		return props.target;
	}

	function clearTimers() {
		if (hideTimer) clearTimeout(hideTimer);
		if (collapseTimer) clearTimeout(collapseTimer);
		hideTimer = 0;
		collapseTimer = 0;
	}

	function clearRafs() {
		if (rafMeasure) cancelAnimationFrame(rafMeasure);
		if (rafUpdate) cancelAnimationFrame(rafUpdate);
		rafMeasure = 0;
		rafUpdate = 0;
	}

	function scheduleMeasure() {
		if (rafMeasure) return;
		rafMeasure = requestAnimationFrame(() => {
			rafMeasure = 0;
			measure();
		});
	}

	function scheduleUpdate() {
		if (rafUpdate) return;
		rafUpdate = requestAnimationFrame(() => {
			rafUpdate = 0;
			updateThumbOffset();
		});
	}

	function showScrollbar() {
		if (!currentTarget) return;
		if (!props.alwaysShow && !state.visible) setState("visible", true);
		startHideTimer();
	}

	function startHideTimer() {
		clearTimers();
		if (state.hovered || state.dragging) return;

		if (props.alwaysShow) {
			hideTimer = window.setTimeout(() => {
				setState("expanded", false);
			}, hideDelay());
		} else {
			hideTimer = window.setTimeout(() => {
				setState("expanded", false);
				collapseTimer = window.setTimeout(() => {
					setState("visible", false);
				}, collapseDelay);
			}, hideDelay());
		}
	}

	function handlePointerEnter() {
		if (!state.visible) return;
		setState("expanded", true);
		if (!props.alwaysShow && !state.visible) setState("visible", true);
		clearTimers();
	}

	function handlePointerLeave() {
		if (!state.visible) return;
		setState("hovered", false);
		startHideTimer();
	}

	function readNormalizedScrollLeft(el: HTMLElement) {
		const dir = getComputedStyle(el).direction;
		if (dir !== "rtl") return el.scrollLeft;
		const maxScroll = el.scrollWidth - el.clientWidth;
		return el.scrollLeft < 0 ? -el.scrollLeft : maxScroll - el.scrollLeft;
	}

	function writeNormalizedScrollLeft(el: HTMLElement, value: number) {
		const dir = getComputedStyle(el).direction;
		if (dir !== "rtl") {
			el.scrollLeft = value;
			return;
		}
		if (el.scrollLeft < 0) {
			el.scrollLeft = -value;
			return;
		}
		el.scrollLeft = el.scrollWidth - el.clientWidth - value;
	}

	function readScrollPos(el: HTMLElement) {
		return isVertical() ? el.scrollTop : readNormalizedScrollLeft(el);
	}

	function writeScrollPos(el: HTMLElement, value: number) {
		if (isVertical()) {
			el.scrollTop = value;
		} else {
			writeNormalizedScrollLeft(el, value);
		}
	}

	function scrollLineIncrement(el: HTMLElement) {
		const viewport = isVertical() ? el.clientHeight : el.clientWidth;
		return Math.max(SCROLL_LINE_MIN, viewport * SCROLL_LINE_RATIO);
	}

	function measure() {
		const el = currentTarget;
		if (!el || !trackRef) return;

		const nextTrackSize = isVertical()
			? trackRef.clientHeight
			: trackRef.clientWidth;
		const nextViewportSize = isVertical() ? el.clientHeight : el.clientWidth;
		const nextContentSize = isVertical() ? el.scrollHeight : el.scrollWidth;

		trackSize = nextTrackSize;

		const nextScrollable = Math.max(nextContentSize - nextViewportSize, 0);

		if (nextScrollable <= 0 || trackSize <= 0 || nextViewportSize <= 0) {
			setState({
				scrollable: 0,
				thumbSize: 0,
				thumbOffset: 0,
				dragging: false,
				expanded: false,
				visible: false,
			});
			clearTimers();
			return;
		}

		const nextThumbSize = Math.max(
			(nextViewportSize / nextContentSize) * trackSize,
			24,
		);

		if (
			nextThumbSize !== state.thumbSize ||
			nextScrollable !== state.scrollable
		) {
			setState({ scrollable: nextScrollable, thumbSize: nextThumbSize });
		}

		updateThumbOffset();
	}

	function updateThumbOffset() {
		const el = currentTarget;
		if (!el || state.scrollable <= 0) {
			if (state.thumbOffset !== 0) setState("thumbOffset", 0);
			return;
		}
		const travel = Math.max(trackSize - state.thumbSize, 0);
		const offset = (readScrollPos(el) / state.scrollable) * travel;
		if (offset !== state.thumbOffset) setState("thumbOffset", offset);
	}

	function setScrollFromDelta(delta: number) {
		const el = currentTarget;
		if (!el) return;
		const travel = Math.max(trackSize - state.thumbSize, 1);
		const ratio = state.scrollable / travel;
		writeScrollPos(el, scrollStartPos + delta * ratio);
		showScrollbar();
		scheduleUpdate();
	}

	function scrollByButton(direction: -1 | 1) {
		const el = currentTarget;
		if (!el || state.scrollable <= 0) return;
		const next = readScrollPos(el) + scrollLineIncrement(el) * direction;
		writeScrollPos(el, Math.max(0, Math.min(next, state.scrollable)));
		showScrollbar();
		scheduleUpdate();
	}

	function endDrag() {
		setState("dragging", false);
		cleanupDrag?.();
		cleanupDrag = undefined;
		startHideTimer();
	}

	function beginDrag(e: PointerEvent) {
		const el = currentTarget;
		if (!el || !state.visible || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		setState("dragging", true);
		showScrollbar();

		dragStartPos = isVertical() ? e.clientY : e.clientX;
		scrollStartPos = readScrollPos(el);

		const onMove = (ev: PointerEvent) => {
			if (!state.dragging) return;
			const delta = (isVertical() ? ev.clientY : ev.clientX) - dragStartPos;
			setScrollFromDelta(delta);
		};

		const cleanupMove = makeEventListener(window, "pointermove", onMove, {
			passive: true,
		});
		const cleanupUp = makeEventListener(window, "pointerup", endDrag);
		const cleanupCancel = makeEventListener(window, "pointercancel", endDrag);

		cleanupDrag = () => {
			cleanupMove();
			cleanupUp();
			cleanupCancel();
		};
	}

	function handleTrackClick(e: MouseEvent) {
		e.preventDefault();
		const el = currentTarget;
		if (!el || !trackRef || state.scrollable <= 0) return;

		const rect = trackRef.getBoundingClientRect();
		const clickPos = isVertical()
			? e.clientY - rect.top
			: e.clientX - rect.left;
		const trackLen = isVertical() ? rect.height : rect.width;

		writeScrollPos(el, (clickPos / Math.max(trackLen, 1)) * state.scrollable);
		showScrollbar();
		scheduleUpdate();
	}

	createEffect(() => {
		const nextTarget = readTarget();
		if (nextTarget === currentTarget) return;

		currentTarget = nextTarget ?? null;

		clearTimers();
		clearRafs();
		cleanupDrag?.();
		cleanupDrag = undefined;

		if (!currentTarget) {
			setState({
				visible: false,
				expanded: false,
				dragging: false,
				thumbSize: 0,
				thumbOffset: 0,
				scrollable: 0,
			});
			return;
		}

		const target = currentTarget;

		const cleanupScroll = makeEventListener(
			target,
			"scroll",
			() => {
				showScrollbar();
				scheduleUpdate();
			},
			{ passive: true },
		);

		const roTarget = makeResizeObserver(scheduleMeasure);
		roTarget.observe(target);

		const observedContent = target.firstElementChild as HTMLElement | null;
		let cleanupContentObserver: (() => void) | undefined;
		if (observedContent) {
			const roContent = makeResizeObserver(scheduleMeasure);
			roContent.observe(observedContent);
			cleanupContentObserver = () => roContent.unobserve(observedContent);
		}

		scheduleMeasure();

		let cleanupTrackObserver: (() => void) | undefined;
		const trackMeasureRaf = requestAnimationFrame(() => {
			if (!trackRef) return;
			const roTrack = makeResizeObserver(scheduleMeasure);
			roTrack.observe(trackRef);
			cleanupTrackObserver = () => roTrack.unobserve(trackRef);
		});

		onCleanup(() => {
			cancelAnimationFrame(trackMeasureRaf);
			cleanupScroll();
			roTarget.unobserve(target);
			cleanupContentObserver?.();
			cleanupTrackObserver?.();
			cleanupDrag?.();
			cleanupDrag = undefined;
			clearTimers();
			clearRafs();
		});
	});

	onCleanup(() => {
		clearTimers();
		clearRafs();
		cleanupDrag?.();
		cleanupDrag = undefined;
	});

	const visible = () => {
		if (state.scrollable <= 0) return false;
		return props.alwaysShow ? true : state.visible;
	};

	// Shell: fixed in the scrollbar dimension (expandedThickness), uses flex alignment
	// to position the inner wrapper within the dead zone. align-items works identically
	// for both orientations: cross-axis for flex-col is horizontal, for flex-row vertical.
	function shellClass() {
		const a = align();
		const alignClass =
			a === "start"
				? "items-start"
				: a === "end"
					? "items-end"
					: "items-center";
		return cx(
			"pointer-events-none select-none flex",
			"opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-100",
			isVertical() ? "flex-col" : "flex-row",
			alignClass,
			props.class,
		);
	}

	// Inner wrapper: the visible scrollbar body. Its width (vertical) or height
	// (horizontal) is what actually animates — the shell just provides the hit zone.
	// Children inherit the cross-dimension via flex stretch, no explicit sizing needed.
	function chromeStyle(): JSX.CSSProperties {
		const dim = isVertical() ? "width" : "height";
		return {
			[dim]: `${trackThickness()}px`,
			"background-color": isExpanded()
				? "rgba(128,128,128,0.15)"
				: "transparent",
			transition: `${dim} 200ms ease, background-color 200ms ease`,
		};
	}

	// Thumb fills the full cross-dimension of the track (which fills the inner wrapper),
	// so no per-align positioning is needed anymore.
	function thumbStyle(): JSX.CSSProperties {
		if (isVertical()) {
			return {
				width: "100%",
				height: `${state.thumbSize}px`,
				top: `${state.thumbOffset}px`,
				left: "0",
			};
		}
		return {
			width: `${state.thumbSize}px`,
			height: "100%",
			left: `${state.thumbOffset}px`,
			top: "0",
		};
	}

	function scrollButtonClass() {
		return cx(
			"flex shrink-0 items-center justify-center",
			"text-base-content/40 hover:text-base-content/70",
			"transition-opacity duration-200",
			isExpanded() ? "opacity-100" : "opacity-0 pointer-events-none",
			isVertical() ? "h-5 w-full" : "w-5 h-full",
		);
	}

	return (
		<div
			aria-hidden="true"
			data-visible={visible()}
			style={{
				...props.style,
				[isVertical() ? "width" : "height"]: `${expandedThickness()}px`,
			}}
			class={shellClass()}
			onContextMenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
		>
			{/*
			 * Inner wrapper: the animated element. Width (vertical) or height (horizontal)
			 * transitions between collapsedThickness and expandedThickness. Children fill
			 * the cross-dimension automatically via flex stretch, so no width/height
			 * needs to be set on the track or buttons.
			 */}
			<div
				class={cx(
					"pointer-events-auto flex rounded-full",
					isVertical() ? "h-full flex-col" : "w-full flex-row",
				)}
				style={chromeStyle()}
				onPointerEnter={handlePointerEnter}
				onPointerLeave={handlePointerLeave}
			>
				<Platform.windows>
					<button
						type="button"
						class={scrollButtonClass()}
						onClick={(e) => {
							e.stopPropagation();
							scrollByButton(-1);
						}}
						tabIndex={-1}
					>
						{isVertical() ? (
							<ScrollbarArrow class="size-2.5 text-gray-11" />
						) : (
							<ScrollbarArrow class="size-2.5 text-gray-11 -rotate-90" />
						)}
					</button>
				</Platform.windows>

				<div
					ref={trackRef}
					class="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-full smoothed"
					onClick={handleTrackClick}
				>
					<div
						class="absolute rounded-full bg-white/30 smoothed"
						style={thumbStyle()}
						onPointerDown={beginDrag}
					/>
				</div>

				<Platform.windows>
					<button
						type="button"
						class={scrollButtonClass()}
						onClick={(e) => {
							e.stopPropagation();
							scrollByButton(1);
						}}
						tabIndex={-1}
					>
						{isVertical() ? (
							<ScrollbarArrow class="size-2.5 text-gray-11 rotate-180" />
						) : (
							<ScrollbarArrow class="size-2.5 text-gray-11 rotate-90" />
						)}
					</button>
				</Platform.windows>
			</div>
		</div>
	);
}

function ScrollbarArrow(props: { class: string }) {
	return (
		<svg
			class={props.class}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 48 48"
		>
			<path d="M0 0h48v48H0z" fill="none" />
			<path
				fill="currentColor"
				stroke="currentColor"
				stroke-linejoin="round"
				stroke-width="4"
				d="m12 29l12-12l12 12z"
			/>
		</svg>
	);
}
