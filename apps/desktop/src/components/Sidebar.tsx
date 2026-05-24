import { createEventListenerMap, makeEventListener } from "@solid-primitives/event-listener";
import { makePersisted } from "@solid-primitives/storage";
import { type CursorIcon, getCurrentWindow } from "@tauri-apps/api/window";
import { cx } from "cva";
import {
    children,
    createContext,
    createEffect,
    createMemo,
    createRoot,
    createSignal,
    type JSX,
    on,
    onCleanup,
    type ParentProps,
    Show,
    useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
import { commands } from "~/utils/tauri";

const COLLAPSE_OVERSHOOT = 48;
const ANIMATION_DURATION = 200;
const ANIMATION_DURATION_INNER = 250;

type Side = "left" | "right";

const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

interface SidebarContextValue {
    side: () => Side;
    width: () => number;
    visualWidth: () => number;
    currentWidth: () => number;
    minWidth: () => number;
    maxWidth: () => number;
    collapsed: () => boolean;
    collapsible: () => boolean;
    resizable: () => boolean;
    autoCollapsed: () => boolean;
    overlayOpen: () => boolean;
    toggle: () => void;
    openOverlay: () => void;
    closeOverlay: () => void;
    isDragging: () => boolean;
    onHandleMouseDown: (e: MouseEvent) => void;
    onHandleMouseEnter: () => void;
    onHandleMouseLeave: () => void;
}

const SidebarContext = createContext<SidebarContextValue>();

export function useSidebar() {
    const ctx = useContext(SidebarContext);
    if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
    return ctx;
}

interface SidebarProviderProps extends ParentProps {
    side?: Side;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    collapsible?: boolean;
    resizable?: boolean;
    storageKey?: string;
}

function createWidth(defaultVal: number, persist: boolean, key: string) {
    const signal = createSignal(defaultVal);
    if (!persist) return signal;
    return makePersisted(signal, { name: key });
}

function createCollapsed(persist: boolean, key: string) {
    const signal = createSignal(false);
    if (!persist) return signal;
    return makePersisted(signal, { name: key });
}

export function SidebarProvider(props: SidebarProviderProps) {
    const side = () => props.side ?? "left";
    const minWidth = () => props.minWidth ?? 240;
    const maxWidth = () => props.maxWidth ?? 480;
    const defaultWidth = () => props.defaultWidth ?? 240;
    const collapsible = () => props.collapsible ?? false;
    const resizable = () => props.resizable ?? false;
    const storageKey = () => props.storageKey ?? "sidebar";

    const persistWidth = () => resizable();
    const persistCollapsed = () => collapsible();

    const currentWindow = getCurrentWindow();

    const [width, setWidth] = createWidth(
        clamp(defaultWidth(), minWidth(), maxWidth()),
        persistWidth(),
        `${storageKey()}-width`,
    );
    const [collapsed, setCollapsed] = createCollapsed(
        persistCollapsed(),
        `${storageKey()}-collapsed`,
    );

    const [state, setState] = createStore({
        isDragging: false,
        dragStartX: 0,
        dragStartWidth: 0,
        autoCollapsed: false,
        overlayOpen: false,
    });

    const [windowWidth, setWindowWidth] = createSignal(window.innerWidth);

    const effectiveMax = createMemo(() =>
        Math.min(maxWidth(), Math.floor(windowWidth() / 2)),
    );

    const visualWidth = createMemo(() =>
        clamp(width(), minWidth(), effectiveMax()),
    );

    const currentWidth = createMemo(() => {
        if (collapsed() || state.overlayOpen) return 0;
        return visualWidth();
    });

    createEffect(() => {
        const max = effectiveMax();
        if (!collapsed()) {
            if (max < minWidth()) {
                setState({ autoCollapsed: true, overlayOpen: false });
                setCollapsed(true);
            }
        } else if (state.autoCollapsed && max >= minWidth()) {
            setState({ autoCollapsed: false, overlayOpen: false });
            setCollapsed(false);
        }
    });

    function getResizeCursor(w: number): CursorIcon {
        const max = effectiveMax();
        if (side() === "left") {
            if (w <= minWidth()) return "eResize";
            if (w >= max) return "wResize";
        } else {
            if (w <= minWidth()) return "wResize";
            if (w >= max) return "eResize";
        }
        return "colResize";
    }

    const openOverlay = () => {
        if (collapsed() && state.autoCollapsed) setState("overlayOpen", true);
    };

    const closeOverlay = () => setState("overlayOpen", false);

    const toggle = () => {
        if (!collapsible()) return;
        if (collapsed()) {
            if (state.autoCollapsed) {
                setState("overlayOpen", (v) => !v);
            } else {
                setCollapsed(false);
            }
        } else {
            setState({ autoCollapsed: false, overlayOpen: false });
            setCollapsed(true);
        }
    };

    function onHandleMouseEnter() {
        if (!resizable() || state.isDragging) return;
        currentWindow.setCursorIcon(
            collapsed()
                ? side() === "left"
                    ? "eResize"
                    : "wResize"
                : getResizeCursor(visualWidth()),
        );
    }

    function onHandleMouseLeave() {
        if (!resizable() || state.isDragging) return;
        currentWindow.setCursorIcon("default");
    }

    function onHandleMouseDown(e: MouseEvent) {
        if (!resizable() || e.button !== 0) return;
        e.preventDefault();

        if (collapsed()) {
            setState({ autoCollapsed: false, overlayOpen: false });
            setCollapsed(false);
            setWidth(minWidth());
            setState({
                isDragging: true,
                dragStartX: e.clientX,
                dragStartWidth: minWidth(),
            });
            currentWindow.setCursorIcon(getResizeCursor(minWidth()));
            return;
        }

        setState({
            isDragging: true,
            dragStartX: e.clientX,
            dragStartWidth: visualWidth(),
        });
        currentWindow.setCursorIcon(getResizeCursor(visualWidth()));

        createRoot((dispose) =>
            createEventListenerMap(window, {
                pointermove: onPointerMove,
                pointerup: () => cancelMove(dispose),
                blur: () => cancelMove(dispose),
            })
        );
    }

    function cancelMove(dispose: () => void) {
        if (!state.isDragging) return;
        setState("isDragging", false);
        currentWindow.setCursorIcon("default");
        dispose();
    }

    function onPointerMove(e: PointerEvent) {
        if (!resizable() || !state.isDragging) return;

        const delta =
            side() === "left"
                ? e.clientX - state.dragStartX
                : state.dragStartX - e.clientX;

        const rawWidth = state.dragStartWidth + delta;

        if (collapsible() && rawWidth < minWidth() - COLLAPSE_OVERSHOOT) {
            if (!collapsed()) {
                setState("autoCollapsed", false);
                setCollapsed(true);
            }
            currentWindow.setCursorIcon("default");
            return;
        }

        if (collapsed()) setCollapsed(false);

        const next = clamp(rawWidth, minWidth(), effectiveMax());
        setWidth(next);
        commands.log("resize");
        currentWindow.setCursorIcon(getResizeCursor(next));
    }

    makeEventListener(window, "resize", () => setWindowWidth(window.innerWidth));
    onCleanup(() => currentWindow.setCursorIcon("default"));

    return (
        <SidebarContext.Provider
            value={{
                side,
                width,
                visualWidth,
                currentWidth,
                minWidth,
                maxWidth,
                collapsed,
                collapsible,
                resizable,
                autoCollapsed: () => state.autoCollapsed,
                overlayOpen: () => state.overlayOpen,
                toggle,
                openOverlay,
                closeOverlay,
                isDragging: () => state.isDragging,
                onHandleMouseDown,
                onHandleMouseEnter,
                onHandleMouseLeave,
            }}
        >
            {props.children}
        </SidebarContext.Provider>
    );
}

interface SidebarProps {
    class?: string;
    children?: JSX.Element;
}

export function Sidebar(props: SidebarProps) {
    const {
        side,
        visualWidth,
        currentWidth,
        collapsed,
        overlayOpen,
        autoCollapsed,
        resizable,
        closeOverlay,
        isDragging,
        onHandleMouseDown,
        onHandleMouseEnter,
        onHandleMouseLeave,
    } = useSidebar();

    const resolvedChildren = children(() => props.children);
    const isLeft = () => side() === "left";
    const isOverlay = () => autoCollapsed() && overlayOpen();
    const shouldBeOpen = () => !collapsed() || overlayOpen();

    const [open, setOpen] = createSignal(shouldBeOpen());
    const [mounted, setMounted] = createSignal(shouldBeOpen());

    createEffect(
        on(
            shouldBeOpen,
            (isOpen) => {
                if (isOpen) {
                    setMounted(true);
                    requestAnimationFrame(() => setOpen(true));
                } else {
                    setOpen(false);
                    const t = setTimeout(() => setMounted(false), ANIMATION_DURATION_INNER);
                    onCleanup(() => clearTimeout(t));
                }
            },
            { defer: true },
        ),
    );

    const translateOffset = () => {
        if (open()) return "0px";
        return isLeft() ? `-${visualWidth()}px` : `${visualWidth()}px`;
    };

    let panelRef!: HTMLDivElement;

    makeEventListener(document, "mousedown", (e: MouseEvent) => {
        if (!isOverlay()) return;
        if (!panelRef.contains(e.target as Node)) closeOverlay();
    });

    return (
        <>
            <div
                class="relative shrink-0 h-full"
                style={{
                    width: `${currentWidth()}px`,
                    transition: isDragging()
                        ? "none"
                        : `width ${ANIMATION_DURATION}ms ease-out`,
                }}
            >
                <Show when={resizable()}>
                    <div
                        class="absolute top-0 bottom-0 w-1.5"
                        style={{
                            [isLeft() ? "right" : "left"]: "-6px",
                            cursor: isDragging() ? undefined : "col-resize",
                        }}
                        onMouseDown={onHandleMouseDown}
                        onMouseEnter={onHandleMouseEnter}
                        onMouseLeave={onHandleMouseLeave}
                    />
                </Show>
            </div>

            <Show when={mounted()}>
                <Portal mount={document.body}>
                    <div
                        ref={panelRef}
                        class={`sidebar ${props.class}`}
                        style={{
                            position: "fixed",
                            top: "0",
                            bottom: "0",
                            [isLeft() ? "left" : "right"]: "0",
                            width: `${visualWidth()}px`,
                            transform: `translateX(${translateOffset()})`,
                            transition: isDragging()
                                ? "none"
                                : `transform ${ANIMATION_DURATION_INNER}ms ease-out`,
                        }}
                        onMouseLeave={() => {
                            if (isOverlay()) closeOverlay();
                        }}
                    >
                        <div class="sidebar_inner">
                            {resolvedChildren()}
                        </div>
                    </div>
                </Portal>
            </Show>
        </>
    );
}

interface SidebarTriggerProps {
    class?: string;
    children?: JSX.Element;
}

export function SidebarTrigger(props: SidebarTriggerProps) {
    const { toggle, openOverlay, collapsed, autoCollapsed, side, collapsible } =
        useSidebar();

    let hoverTimer: ReturnType<typeof setTimeout> | undefined;

    function onMouseEnter() {
        if (!collapsed() || !autoCollapsed()) return;
        hoverTimer = setTimeout(openOverlay, 100);
    }

    function onMouseLeave() {
        clearTimeout(hoverTimer);
    }

    const defaultLabel = () => {
        if (collapsed()) return side() === "left" ? "→" : "←";
        return side() === "left" ? "←" : "→";
    };

    return (
        <Show when={collapsible()}>
            <button
                type="button"
                onClick={toggle}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                aria-label={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
                class={props.class}
            >
                {props.children ?? defaultLabel()}
            </button>
        </Show>
    );
}
