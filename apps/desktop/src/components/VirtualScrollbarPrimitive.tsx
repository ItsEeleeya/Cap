import { makeEventListener } from "@solid-primitives/event-listener";
import { makeResizeObserver } from "@solid-primitives/resize-observer";
import { createEffect, createSignal, onCleanup } from "solid-js";

type Orientation = "vertical" | "horizontal";

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
    const [visible, setVisible] = createSignal(false);
    const [expanded, setExpanded] = createSignal(false);
    const [dragging, setDragging] = createSignal(false);
    const [thumbSize, setThumbSize] = createSignal(0);
    const [thumbOffset, setThumbOffset] = createSignal(0);

    let currentTarget: HTMLElement | null = null;
    let trackRef!: HTMLDivElement;
    let thumbRef!: HTMLDivElement;

    let rafMeasure = 0;
    let rafUpdate = 0;
    let hideTimer = 0;
    let collapseTimer = 0;

    let cleanupDrag: (() => void) | undefined;

    let trackSize = 0;
    let viewportSize = 0;
    let contentSize = 0;
    let scrollable = 0;

    let dragStartPos = 0;
    let scrollStartPos = 0;

    const orientation = () => props.orientation ?? "vertical";
    const collapsedThickness = () => props.thickness ?? 8;
    const expandedThickness = () => props.expandedThickness ?? 14;
    const hideDelay = () => props.hideDelay ?? 1200;
    const collapseDelay = 160;

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
            updateThumb();
        });
    }

    function showScrollbar() {
        if (!currentTarget) return;

        setVisible(true);
        clearTimers();

        hideTimer = window.setTimeout(() => {
            setExpanded(false);
            collapseTimer = window.setTimeout(() => {
                setVisible(false);
            }, collapseDelay);
        }, hideDelay());
    }

    function measure() {
        const el = currentTarget;
        if (!el || !trackRef) return;

        const nextTrackSize =
            orientation() === "horizontal"
                ? trackRef.clientWidth
                : trackRef.clientHeight;

        const nextViewportSize =
            orientation() === "horizontal" ? el.clientWidth : el.clientHeight;

        const nextContentSize =
            orientation() === "horizontal" ? el.scrollWidth : el.scrollHeight;

        trackSize = nextTrackSize;
        viewportSize = nextViewportSize;
        contentSize = nextContentSize;
        scrollable = Math.max(contentSize - viewportSize, 0);

        if (scrollable <= 0 || trackSize <= 0 || viewportSize <= 0) {
            setThumbSize(0);
            setThumbOffset(0);
            setDragging(false);
            setExpanded(false);
            setVisible(false);
            clearTimers();
            return;
        }

        const nextThumbSize = Math.max((viewportSize / contentSize) * trackSize, 24);
        setThumbSize(nextThumbSize);
        updateThumb();
    }

    function updateThumb() {
        const el = currentTarget;
        if (!el || !trackRef) return;

        if (scrollable <= 0) {
            setThumbOffset(0);
            return;
        }

        const scrollPos =
            orientation() === "horizontal" ? el.scrollLeft : el.scrollTop;

        const travel = Math.max(trackSize - thumbSize(), 0);
        const offset = (scrollPos / scrollable) * travel;

        setThumbOffset(offset);
    }

    function setScrollFromDelta(delta: number) {
        const el = currentTarget;
        if (!el) return;

        const travel = Math.max(trackSize - thumbSize(), 1);
        const ratio = scrollable / travel;
        const nextScroll = scrollStartPos + delta * ratio;

        if (orientation() === "horizontal") {
            el.scrollLeft = nextScroll;
        } else {
            el.scrollTop = nextScroll;
        }

        showScrollbar();
        scheduleUpdate();
    }

    function endDrag() {
        setDragging(false);
        cleanupDrag?.();
        cleanupDrag = undefined;
    }

    function beginDrag(e: PointerEvent) {
        const el = currentTarget;
        if (!el) return;

        e.preventDefault();
        e.stopPropagation();

        setDragging(true);
        showScrollbar();

        dragStartPos = orientation() === "horizontal" ? e.clientX : e.clientY;
        scrollStartPos =
            orientation() === "horizontal" ? el.scrollLeft : el.scrollTop;

        const onMove = (ev: PointerEvent) => {
            const delta =
                (orientation() === "horizontal" ? ev.clientX : ev.clientY) -
                dragStartPos;
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

    function handleTrackClick(e: MouseEvent) {
        e.preventDefault();

        const el = currentTarget;
        if (!el || !trackRef || scrollable <= 0) return;

        const rect = trackRef.getBoundingClientRect();
        const clickPos =
            orientation() === "horizontal"
                ? e.clientX - rect.left
                : e.clientY - rect.top;

        const trackLen =
            orientation() === "horizontal" ? rect.width : rect.height;

        const nextScroll = (clickPos / Math.max(trackLen, 1)) * scrollable;

        if (orientation() === "horizontal") {
            writeNormalizedScrollLeft(el, nextScroll);
        } else {
            el.scrollTop = nextScroll;
        }

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
            setVisible(false);
            setExpanded(false);
            setDragging(false);
            setThumbSize(0);
            setThumbOffset(0);
            return;
        }

        const cleanupScroll = makeEventListener(
            currentTarget,
            "scroll",
            () => {
                showScrollbar();
                scheduleUpdate();
            },
            { passive: true },
        );

        const roTarget = makeResizeObserver(scheduleMeasure);
        roTarget.observe(currentTarget);

        const observedContent = currentTarget.firstElementChild as HTMLElement | null;
        let cleanupContentObserver: (() => void) | undefined;

        if (observedContent) {
            const roContent = makeResizeObserver(scheduleMeasure);
            roContent.observe(observedContent);
            cleanupContentObserver = () => roContent.unobserve(observedContent);
        }

        scheduleMeasure();

        onCleanup(() => {
            cleanupScroll();
            roTarget.unobserve(currentTarget!);
            cleanupContentObserver?.();
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

    return (
        <div
            aria-hidden="true"
            data-visible={visible()}
            class={`pointer-events-none select-none opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-100 ${props.class ?? ""
                }`}
            style={props.style}
            onPointerEnter={() => setExpanded(true)}
        >
            <div
                ref={trackRef}
                class="absolute inset-0 pointer-events-auto"
                onMouseEnter={showScrollbar}
                onClick={handleTrackClick}
            >
                <div
                    ref={thumbRef}
                    class="absolute rounded-full bg-base-content/30 hover:bg-base-content/70"
                    style={{
                        width:
                            orientation() === "vertical"
                                ? `${dragging() || expanded()
                                    ? expandedThickness()
                                    : collapsedThickness()
                                }px`
                                : `${thumbSize()}px`,
                        height:
                            orientation() === "horizontal"
                                ? `${dragging() || expanded()
                                    ? expandedThickness()
                                    : collapsedThickness()
                                }px`
                                : `${thumbSize()}px`,
                        left: orientation() === "vertical" ? "50%" : undefined,
                        top: orientation() === "horizontal" ? "50%" : undefined,
                        transform:
                            orientation() === "vertical"
                                ? `translateX(-50%) translateY(${thumbOffset()}px)`
                                : `translateY(-50%) translateX(${thumbOffset()}px)`,
                        "transition-property":
                            "width,height,opacity,background-color",
                        "transition-duration": "150ms",
                    }}
                    onPointerDown={beginDrag}
                />
            </div>
        </div>
    );
}