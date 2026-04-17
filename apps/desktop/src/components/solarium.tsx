import { motion } from "motion-solid";
import {
    createEffect,
    createSignal,
    onCleanup,
    onMount,
    splitProps,
    type JSX,
} from "solid-js";

function clamp(min: number, max: number, value: number) {
    return Math.max(min, Math.min(max, value));
}

function mapCheckedColor(hue: number, complete: number) {
    const s = 8 + (complete / 100) * 92;
    const l = 81 - (complete / 100) * 38;
    return `hsl(${hue} ${s}% ${l}%)`;
}

export interface LiquidToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    hue?: number;
    bounce?: boolean;
    "aria-label"?: string;
    class?: string;
}

export function LiquidToggle(props: LiquidToggleProps) {
    const [local, rest] = splitProps(props, [
        "checked",
        "onChange",
        "hue",
        "bounce",
        "aria-label",
        "class",
    ]);

    let buttonRef!: HTMLButtonElement;
    let resizeObserver: ResizeObserver | undefined;

    const [active, setActive] = createSignal(false);
    const [pressed, setPressed] = createSignal(false);

    let complete = local.checked ? 100 : 0;
    let pressTime = 0;
    let startX = 0;
    let didDrag = false;
    let snapTimeout: ReturnType<typeof setTimeout> | undefined;

    function writeComplete(value: number) {
        complete = value;
        if (!buttonRef) return;
        buttonRef.style.setProperty("--complete", String(value));
        buttonRef.style.setProperty(
            "--checked",
            mapCheckedColor(local.hue ?? 144, value),
        );
    }

    function syncGeometry() {
        if (!buttonRef) return;

        const rect = buttonRef.getBoundingClientRect();
        const w = rect.width || 40;
        const h = rect.height || 20;

        const border = clamp(2, Math.round(h * 0.16), 8);
        const knobH = clamp(8, Math.round(h - border * 2), h);
        const knobW = clamp(
            Math.round(knobH * 1.2),
            Math.round(w * 0.36),
            Math.max(12, Math.round(w - border * 2)),
        );

        buttonRef.style.setProperty("--border", `${border}px`);
        buttonRef.style.setProperty("--knob-w", `${knobW}px`);
        buttonRef.style.setProperty("--knob-h", `${knobH}px`);
        buttonRef.style.setProperty("--cutout-scale", active() ? "1.65" : "1");
    }

    createEffect(() => {
        writeComplete(local.checked ? 100 : 0);
        syncGeometry();
    });

    createEffect(() => {
        if (!buttonRef) return;
        buttonRef.style.setProperty("--cutout-scale", active() ? "1.65" : "1");
    });

    onMount(() => {
        resizeObserver = new ResizeObserver(() => syncGeometry());
        resizeObserver.observe(buttonRef);
        syncGeometry();
    });

    onCleanup(() => {
        clearTimeout(snapTimeout);
        resizeObserver?.disconnect();
    });

    function finish(nextChecked: boolean) {
        writeComplete(nextChecked ? 100 : 0);
        clearTimeout(snapTimeout);

        setTimeout(() => {
            setActive(false);
            setPressed(false);
            props.onChange(nextChecked);
        }, 0);
    }

    function onPointerDown(e: PointerEvent) {
        if (e.button !== 0) return;
        e.preventDefault();

        clearTimeout(snapTimeout);
        pressTime = performance.now();
        startX = e.clientX;
        didDrag = false;

        setActive(true);
        setPressed(true);

        buttonRef.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
        if (!pressed()) return;
        if (Math.abs(e.clientX - startX) > 4) didDrag = true;
    }

    function onPointerUp(e: PointerEvent) {
        if (!pressed()) return;

        try {
            buttonRef.releasePointerCapture(e.pointerId);
        } catch { }

        const elapsed = performance.now() - pressTime;
        const delta = e.clientX - startX;
        const moved = Math.abs(delta);

        if (!didDrag || moved <= 4 || elapsed <= 180) {
            finish(!local.checked);
            return;
        }

        finish(delta > 0);
    }

    function onPointerCancel(e: PointerEvent) {
        try {
            buttonRef.releasePointerCapture(e.pointerId);
        } catch { }

        setActive(false);
        setPressed(false);
        syncGeometry();
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === " ") e.preventDefault();
        if (e.key === "Enter") {
            setActive(true);
            setPressed(true);
            finish(!local.checked);
        }
    }

    function onKeyUp(e: KeyboardEvent) {
        if (e.key === " ") {
            setActive(true);
            setPressed(true);
            finish(!local.checked);
        }
    }

    const knobLeft = () =>
        local.checked
            ? "calc(100% - var(--border) - var(--knob-w))"
            : "var(--border)";

    const knobCenter = () =>
        local.checked
            ? "calc(100% - var(--border) - var(--knob-w) / 2)"
            : "calc(var(--border) + var(--knob-w) / 2)";

    const cutoutMaskStyle: () => JSX.CSSProperties = () =>
    ({
        "-webkit-mask-image": `radial-gradient(circle at ${knobCenter()} 50%, transparent 0 calc((var(--knob-w) / 2) * var(--cutout-scale) + var(--border)), black calc((var(--knob-w) / 2) * var(--cutout-scale) + var(--border) + 1px))`,
        "mask-image": `radial-gradient(circle at ${knobLeft()} 50%, transparent 0 calc((var(--knob-w) / 2) * var(--cutout-scale) + var(--border)), black calc((var(--knob-w) / 2) * var(--cutout-scale) + var(--border) + 1px))`,
        "-webkit-mask-repeat": "no-repeat",
        "mask-repeat": "no-repeat",
        "-webkit-mask-size": "100% 100%",
        "mask-size": "100% 100%",
        "mask-composite": "exclude",
    });

    return (
        <button
            ref={buttonRef}
            type="button"
            role="switch"
            aria-checked={local.checked}
            aria-label={local["aria-label"] ?? "Toggle"}
            data-checked={local.checked}
            data-active={active()}
            data-pressed={pressed()}
            data-bounce={local.bounce ?? true}
            class={`relative isolate overflow-visible border-0 bg-transparent p-0 select-none touch-none outline-none ${local.class ?? "h-5 w-10"}`}
            style={{
                "--hue": String(local.hue ?? 144),
                "--complete": String(complete),
                "--checked": mapCheckedColor(local.hue ?? 144, complete),
            } as JSX.CSSProperties}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
        >
            <div class="pointer-events-none absolute inset-0 rounded-full bg-[var(--checked)]/35" />

            <div
                class="pointer-events-none absolute inset-0 rounded-full bg-[var(--checked)]"
                style={cutoutMaskStyle()}
            />

            <div
                class="pointer-events-none absolute top-1/2 rounded-full bg-[var(--checked)]/70"
                style={{
                    left: "var(--border)",
                    width: "calc(60% - 2 * var(--border))",
                    height: "calc(100% - 2 * var(--border))",
                    translate: "0 -50%",
                } as JSX.CSSProperties}
            />

            <motion.div
                class="pointer-events-none absolute top-1/2 rounded-full bg-transparent"
                style={{
                    left: knobLeft(),
                    width: "var(--knob-w)",
                    height: "var(--knob-h)",
                    translate: "0 -50%",
                } as JSX.CSSProperties}
                animate={{ scale: active() ? 1.65 : 1 }}
                transition={{ duration: 0.18, ease: "easeInOut" }}
            >
                <motion.div
                    class="absolute inset-0 rounded-full opacity-0 shadow-[1px_-1px_2px_hsl(0_0%_100%_/_0.5)_inset,0_-1px_2px_hsl(0_0%_100%_/_0.5)_inset,-1px_-1px_2px_hsl(0_0%_100%_/_0.5)_inset,1px_1px_2px_hsl(0_0%_30%_/_0.5)_inset,-8px_4px_10px_-6px_hsl(0_0%_30%_/_0.25)_inset,-1px_1px_6px_hsl(0_0%_30%_/_0.25)_inset,-1px_-1px_8px_hsl(0_0%_60%_/_0.15),1px_1px_2px_hsl(0_0%_30%_/_0.15),2px_2px_6px_hsl(0_0%_30%_/_0.15),-2px_-1px_2px_hsl(0_0%_100%_/_0.25)_inset,3px_6px_16px_-6px_hsl(0_0%_30%_/_0.5)]"
                    animate={{ opacity: active() ? 1 : 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                />
                <motion.div
                    class="absolute inset-0 rounded-full bg-white"
                    animate={{ opacity: active() ? 0 : 1 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                />
            </motion.div>
        </button>
    );
}