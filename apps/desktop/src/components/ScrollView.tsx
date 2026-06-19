import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { cx } from "cva";
import {
	createContext,
	createEffect,
	createSignal,
	type JSX,
	onCleanup,
	type ParentProps,
	Show,
	useContext,
} from "solid-js";
import { ProgressiveBlur } from "~/components/primitive/ProgressiveBlur";
import VirtualScrollbarPrimitive from "~/components/primitive/VirtualScrollbar";

type ScrollOrientation = "vertical" | "horizontal" | "both";
type EdgeDirection = "top" | "bottom" | "left" | "right";
type EdgeEffectMode = "soft" | "hard";

export type ScrollState = {
	scrollTop: number;
	scrollLeft: number;
	clientWidth: number;
	clientHeight: number;
	scrollWidth: number;
	scrollHeight: number;
};

type ScrollerContextValue = {
	scroll: () => ScrollState;
	canScrollY: () => boolean;
	canScrollX: () => boolean;
	atTop: () => boolean;
	atBottom: () => boolean;
	atStart: () => boolean;
	atEnd: () => boolean;
	isRtl: () => boolean;
	viewportEl: () => HTMLElement | null;
};

type _ScrollerContextValueWithSetter = ScrollerContextValue & {
	_setViewportEl: (el: HTMLElement | null) => void;
};

const ScrollerContext = createContext<_ScrollerContextValueWithSetter>();

function useScrollerContext(): ScrollerContextValue {
	const ctx = useContext(ScrollerContext);
	if (!ctx) throw new Error("<Scroller.*> must be used inside <Scroller.Root>");
	return ctx;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

type RootProps = ParentProps<{
	class?: string;
	style?: JSX.CSSProperties | string;
}>;

function Root(props: RootProps) {
	const [viewportEl, setViewportEl] = createSignal<HTMLElement | null>(null);
	const [scroll, setScroll] = createSignal<ScrollState>({
		scrollTop: 0,
		scrollLeft: 0,
		clientWidth: 0,
		clientHeight: 0,
		scrollWidth: 0,
		scrollHeight: 0,
	});

	const isRtl = () =>
		typeof document !== "undefined" && document.documentElement.dir === "rtl";

	const updateScrollState = () => {
		const el = viewportEl();
		if (!el) return;
		setScroll({
			scrollTop: el.scrollTop,
			scrollLeft: el.scrollLeft,
			clientWidth: el.clientWidth,
			clientHeight: el.clientHeight,
			scrollWidth: el.scrollWidth,
			scrollHeight: el.scrollHeight,
		});
	};

	createEffect(() => {
		const el = viewportEl();
		if (!el) return;

		const cleanupScroll = makeEventListener(el, "scroll", updateScrollState, {
			passive: true,
		});
		const ro = makeResizeObserver(updateScrollState);
		ro.observe(el);
		updateScrollState();

		onCleanup(() => {
			cleanupScroll();
			ro.unobserve(el);
		});
	});

	const canScrollY = () => scroll().scrollHeight > scroll().clientHeight + 1;
	const canScrollX = () => scroll().scrollWidth > scroll().clientWidth + 1;
	const atTop = () => scroll().scrollTop <= 0;
	const atBottom = () =>
		scroll().scrollTop + scroll().clientHeight >= scroll().scrollHeight - 1;

	const normaliseScrollStart = () => {
		const { scrollLeft, scrollWidth, clientWidth } = scroll();
		if (!isRtl()) return scrollLeft;
		if (scrollLeft <= 0) return -scrollLeft;
		return scrollWidth - clientWidth - scrollLeft;
	};

	const atStart = () => normaliseScrollStart() <= 0;
	const atEnd = () =>
		normaliseScrollStart() + scroll().clientWidth >= scroll().scrollWidth - 1;

	const ctx: _ScrollerContextValueWithSetter = {
		scroll,
		canScrollY,
		canScrollX,
		atTop,
		atBottom,
		atStart,
		atEnd,
		isRtl,
		viewportEl,
		_setViewportEl: setViewportEl,
	};

	return (
		<ScrollerContext.Provider value={ctx}>
			<div
				class={cx(
					"relative h-full min-h-0 min-w-0 overflow-hidden",
					props.class,
				)}
				style={props.style}
			>
				{props.children}
			</div>
		</ScrollerContext.Provider>
	);
}

// ─── Viewport ─────────────────────────────────────────────────────────────────

type ViewportProps = ParentProps<{
	orientation?: ScrollOrientation;
	edges?: Partial<Record<EdgeDirection, number>>;
	overscroll?: "contain" | "auto" | "none";
	class?: string;
	contentClass?: string;
	style?: JSX.CSSProperties;
	fade?: boolean;
	"aria-label"?: string;
	"aria-labelledby"?: string;
	"aria-describedby"?: string;
}>;

function Viewport(props: ViewportProps) {
	const { _setViewportEl } =
		useScrollerContext() as _ScrollerContextValueWithSetter;
	if (!_setViewportEl)
		throw new Error("<Scroller.Viewport> must be inside <Scroller.Root>");

	const orientation = () => props.orientation ?? "vertical";
	const edge = () => ({
		top: props.edges?.top ?? 0,
		bottom: props.edges?.bottom ?? 0,
		left: props.edges?.left ?? 0,
		right: props.edges?.right ?? 0,
	});

	const overflowStyle = (): JSX.CSSProperties => {
		switch (orientation()) {
			case "vertical":
				return { "overflow-x": "hidden", "overflow-y": "auto" };
			case "horizontal":
				return { "overflow-x": "auto", "overflow-y": "hidden" };
			case "both":
				return { overflow: "auto" };
		}
	};

	const contentPaddingStyle = (): JSX.CSSProperties => ({
		"padding-top": edge().top ? `${edge().top}px` : undefined,
		"padding-bottom": edge().bottom ? `${edge().bottom}px` : undefined,
		"padding-left": edge().left ? `${edge().left}px` : undefined,
		"padding-right": edge().right ? `${edge().right}px` : undefined,
	});

	return (
		<div
			ref={_setViewportEl}
			role="region"
			tabIndex={0}
			aria-label={props["aria-label"]}
			aria-labelledby={props["aria-labelledby"]}
			aria-describedby={props["aria-describedby"]}
			class={cx("absolute inset-0 scrollbar-none", props.class)}
			classList={{ "cap-fade-mask": props.fade }}
			style={{
				// Top edge
				"--fade-top-length": `${edge().top}px`,
				"--fade-top-start": `${edge().top * 0.7}px`,
				"--fade-top-intensity": "0.85",
				// Bottom edge
				"--fade-bottom-length": `${edge().bottom}px`,
				"--fade-bottom-start": `${edge().bottom * 0.7}px`,
				"--fade-bottom-intensity": "0.8",
				// Horizontal edges
				"--fade-left-length": `${edge().left}px`,
				"--fade-right-length": `${edge().right}px`,
				"overscroll-behavior": props.overscroll,
				...overflowStyle(),
				...props.style,
			}}
		>
			<div
				class={`relative min-h-full min-w-full ${props.contentClass ?? ""}`}
				style={contentPaddingStyle()}
			>
				{props.children}
			</div>
		</div>
	);
}

// ─── Scrollbar ────────────────────────────────────────────────────────────────

type ScrollbarProps = {
	orientation?: "vertical" | "horizontal";
	edges?: Partial<Record<EdgeDirection, number>>;
	hideDelay?: number;
	thickness?: number;
	expandedThickness?: number;
	class?: string;
	style?: JSX.CSSProperties;
};

function Scrollbar(props: ScrollbarProps) {
	const { viewportEl, isRtl } = useScrollerContext();
	const orientation = () => props.orientation ?? "vertical";
	const edge = () => ({
		top: props.edges?.top ?? 0,
		bottom: props.edges?.bottom ?? 0,
		left: props.edges?.left ?? 0,
		right: props.edges?.right ?? 0,
	});

	const positionStyle = (): JSX.CSSProperties => {
		if (orientation() === "vertical") {
			return {
				top: `${edge().top}px`,
				bottom: `${edge().bottom}px`,
				...(isRtl() ? { left: "2px" } : { right: "2px" }),
			};
		}
		return {
			bottom: "2px",
			left: `${edge().left}px`,
			right: `${edge().right}px`,
		};
	};

	return (
		<VirtualScrollbarPrimitive
			target={viewportEl}
			orientation={orientation()}
			hideDelay={props.hideDelay}
			thickness={props.thickness}
			expandedThickness={props.expandedThickness}
			class={`absolute z-30 ${props.class ?? ""}`}
			style={{ ...positionStyle(), ...props.style }}
		/>
	);
}

// ─── EdgeEffect ───────────────────────────────────────────────────────────────

type EdgeEffectProps = {
	to: EdgeDirection;
	mode?: EdgeEffectMode;
	size: number;
	// soft
	blurIntensity?: number;
	blurLayers?: number;
	// hard
	hardBlur?: number;
	class?: string;
	style?: JSX.CSSProperties;
};

function edgePositionStyle(
	direction: EdgeDirection,
	size: number,
): JSX.CSSProperties {
	switch (direction) {
		case "top":
			return { top: "0", left: "0", right: "0", height: `${size}px` };
		case "bottom":
			return { bottom: "0", left: "0", right: "0", height: `${size}px` };
		case "left":
			return { left: "0", top: "0", bottom: "0", width: `${size}px` };
		case "right":
			return { right: "0", top: "0", bottom: "0", width: `${size}px` };
	}
}

function EdgeEffect(props: EdgeEffectProps) {
	const mode = () => props.mode ?? "soft";

	const baseStyle = (): JSX.CSSProperties => ({
		position: "absolute",
		"pointer-events": "none",
		...edgePositionStyle(props.to, props.size),
		...props.style,
	});

	return (
		<>
			<Show when={mode() === "soft"}>
				<ProgressiveBlur
					direction={props.to}
					blurIntensity={props.blurIntensity}
					blurLayers={props.blurLayers}
					class={props.class}
					style={baseStyle()}
				/>
			</Show>
			<Show when={mode() === "hard"}>
				<div
					class={cx("apple-blur", props.class)}
					style={{
						...baseStyle(),
						"backdrop-filter": `blur(${props.hardBlur ?? 12}px)`,
					}}
				/>
			</Show>
		</>
	);
}

export const Scroller = {
	Root,
	Viewport,
	Scrollbar,
	EdgeEffect,
};

function useEdgeVisible(direction: EdgeDirection) {
	const { canScrollY, canScrollX, atTop, atBottom, atStart, atEnd } =
		useScrollerContext();
	switch (direction) {
		case "top":
			return () => canScrollY() && !atTop();
		case "bottom":
			return () => canScrollY() && !atBottom();
		case "left":
			return () => canScrollX() && !atStart();
		case "right":
			return () => canScrollX() && !atEnd();
	}
}
