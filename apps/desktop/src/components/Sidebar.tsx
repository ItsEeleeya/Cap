import { makePersisted } from "@solid-primitives/storage";
import {
    createMemo,
    createSignal,
    type JSX,
    mergeProps,
    onCleanup,
    Show,
} from "solid-js";
import { Transition } from "solid-transition-group";
import "./Sidebar.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SidebarConstraints {
    /** Minimum expanded width in pixels. Default: 160 */
    minWidth?: number;
    /** Maximum expanded width in pixels. Default: 480 */
    maxWidth?: number;
    /** Initial width in pixels (persisted fallback). Default: 240 */
    defaultWidth?: number;
    /**
     * Width in pixels when collapsed.
     * Use 0 to fully hide. Default: 48 (icon-rail width).
     */
    collapsedWidth?: number;
}

export interface SidebarProps extends SidebarConstraints {
    /** Main scrollable content. */
    children?: JSX.Element;
    /** Rendered in the header row beside the collapse button. Fades out when collapsed. */
    header?: JSX.Element;
    /** Rendered below the body. Fades out when collapsed. */
    footer?: JSX.Element;
    /**
     * localStorage key prefix.
     *   width     → `{storageKey}:width`
     *   collapsed → `{storageKey}:collapsed`
     * Default: "sidebar"
     */
    storageKey?: string;
    /** Viewport edge the sidebar is attached to. Affects border, handle & chevron. Default: "left" */
    side?: "left" | "right";
    /** Extra classes forwarded to the root element. */
    class?: string;
    /** Called on every collapse / expand toggle. */
    onCollapse?: (collapsed: boolean) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
    minWidth: 160,
    maxWidth: 480,
    defaultWidth: 240,
    collapsedWidth: 48,
    storageKey: "sidebar",
    side: "left" as const,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar(props: SidebarProps) {
    const cfg = mergeProps(DEFAULTS, props);

    // Persisted width — localStorage overrides defaultWidth after first mount
    const [width, setWidth] = makePersisted(createSignal(cfg.defaultWidth), {
        name: `${cfg.storageKey}:width`,
    });

    const [collapsed, setCollapsed] = makePersisted(createSignal(false), {
        name: `${cfg.storageKey}:collapsed`,
    });

    const displayWidth = createMemo(() =>
        collapsed() ? cfg.collapsedWidth : width(),
    );

    // ── Resize ──────────────────────────────────────────────────────────────────
    // Pointer capture routes all move/up events to the handle element even when
    // the cursor leaves it — no global document listeners needed.

    let handleEl!: HTMLDivElement;
    let resizing = false;
    let startX = 0;
    let startW = 0;

    function onPointerDown(e: PointerEvent) {
        resizing = true;
        startX = e.clientX;
        startW = width();
        handleEl.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
        document.body.style.cursor = "col-resize";
    }

    function onPointerMove(e: PointerEvent) {
        if (!resizing) return;
        const delta = cfg.side === "left" ? e.clientX - startX : startX - e.clientX;
        setWidth(Math.min(cfg.maxWidth, Math.max(cfg.minWidth, startW + delta)));
    }

    function onPointerUp(e: PointerEvent) {
        if (!resizing) return;
        resizing = false;
        handleEl.releasePointerCapture(e.pointerId);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
    }

    // Restore body styles if the component unmounts mid-drag
    onCleanup(() => {
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
    });

    // ── Collapse ─────────────────────────────────────────────────────────────────

    function toggleCollapse() {
        const next = !collapsed();
        setCollapsed(next);
        cfg.onCollapse?.(next);
    }

    // ── Render ───────────────────────────────────────────────────────────────────

    return (
        <div
            class={[
                // Layout
                "relative flex flex-col h-full overflow-hidden",
                // Colors
                "bg-[#0c0e13] text-[#7d8899]",
                // Border on the inner edge only
                cfg.side === "left"
                    ? "border-r border-[#1c2030]"
                    : "border-l border-[#1c2030]",
                cfg.class,
            ]
                .filter(Boolean)
                .join(" ")}
            style={{
                width: `${displayWidth()}px`,
                "min-width": `${displayWidth()}px`,
                // Tailwind can't express multi-property transitions with custom easings
                // in a single utility, so this stays inline.
                transition:
                    "width 280ms cubic-bezier(0.4,0,0.2,1), min-width 280ms cubic-bezier(0.4,0,0.2,1)",
            }}
        >
            {/* ── Header ─────────────────────────────────────────────────────────── */}
            <div class="flex items-center h-11 px-3 gap-1 shrink-0">
                <Transition name="sb-fade">
                    <Show when={!collapsed()}>
                        <div class="flex-1 overflow-hidden whitespace-nowrap text-[#c0c6d4] text-[13px] font-semibold tracking-[0.015em]">
                            {cfg.header}
                        </div>
                    </Show>
                </Transition>

                <button
                    type="button"
                    aria-label={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
                    title={collapsed() ? "Expand sidebar" : "Collapse sidebar"}
                    onClick={toggleCollapse}
                    class="flex items-center justify-center w-[26px] h-[26px] ml-auto shrink-0 rounded-[5px] border-none bg-transparent text-[#7d8899] cursor-pointer outline-none transition-colors duration-[140ms] hover:bg-white/[0.045] hover:text-[#c0c6d4] focus-visible:ring-1 focus-visible:ring-[#4a7cf7]"
                >
                    <ChevronIcon collapsed={collapsed()} side={cfg.side} />
                </button>
            </div>

            {/* Hairline divider */}
            <div class="h-px shrink-0 bg-[#1c2030]" />

            {/* ── Scrollable body ─────────────────────────────────────────────────── */}
            <div class="sb-body flex-1 overflow-y-auto overflow-x-hidden">
                <Transition name="sb-fade">
                    <Show when={!collapsed()}>
                        <div class="p-1.5">{cfg.children}</div>
                    </Show>
                </Transition>
            </div>

            {/* ── Footer (optional) ───────────────────────────────────────────────── */}
            <Show when={cfg.footer !== undefined}>
                <div class="h-px shrink-0 bg-[#1c2030]" />
                <Transition name="sb-fade">
                    <Show when={!collapsed()}>
                        <div class="px-2.5 py-1.5 shrink-0 overflow-hidden">
                            {cfg.footer}
                        </div>
                    </Show>
                </Transition>
            </Show>

            {/* ── Resize handle ───────────────────────────────────────────────────── */}
            {/* Hidden when collapsed — prevents accidental expand on drag */}
            <Show when={!collapsed()}>
                <div
                    ref={handleEl}
                    class={[
                        "absolute top-0 bottom-0 w-1 z-10 cursor-col-resize",
                        "bg-transparent transition-[background-color,box-shadow] duration-[140ms]",
                        "hover:bg-[#4a7cf7] hover:shadow-[0_0_10px_rgba(74,124,247,0.3)]",
                        "active:bg-[#4a7cf7]",
                        // Center the 4px strip on the border
                        cfg.side === "left"
                            ? "right-0 translate-x-1/2"
                            : "left-0 -translate-x-1/2",
                    ].join(" ")}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                />
            </Show>
        </div>
    );
}

// ── ChevronIcon ───────────────────────────────────────────────────────────────

interface ChevronIconProps {
    collapsed: boolean;
    side: "left" | "right";
}

function ChevronIcon(props: ChevronIconProps) {
    // Left sidebar:  expanded → ←, collapsed → →
    // Right sidebar: expanded → →, collapsed → ←
    const rotation = createMemo(() => {
        if (props.side === "left") return props.collapsed ? "0deg" : "180deg";
        return props.collapsed ? "180deg" : "0deg";
    });

    return (
        <svg
            width="15"
            height="15"
            viewBox="0 0 15 15"
            fill="none"
            aria-hidden="true"
            style={{
                display: "block",
                transform: `rotate(${rotation()})`,
                transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
        >
            <path
                d="M9.5 3.5L5.5 7.5L9.5 11.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    );
}
