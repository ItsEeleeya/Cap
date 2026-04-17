import { createMemo, type JSX, splitProps } from "solid-js";

type LensShape =
    | { type: "circle" }
    | { type: "rounded-rect"; radius?: string } // e.g. "9999px" or "0.75rem"
    | { type: "custom"; clipPath: string };

interface LensProps {
    render: () => JSX.Element;
    scale?: number;
    shape?: LensShape;
    class?: string;
    lensClass?: string;
    style?: JSX.CSSProperties;
    lensStyle?: JSX.CSSProperties;
}

export function Lens(props: LensProps) {
    const [local, rest] = splitProps(props, [
        "render",
        "scale",
        "shape",
        "class",
        "lensClass",
        "style",
        "lensStyle",
    ]);

    const scale = () => local.scale ?? 0.5;

    const clipStyle = createMemo<JSX.CSSProperties>(() => {
        const s = local.shape;
        if (!s || s.type === "circle") {
            return { "border-radius": "9999px" };
        }
        if (s.type === "rounded-rect") {
            return { "border-radius": s.radius ?? "0.75rem" };
        }
        if (s.type === "custom") {
            return { "clip-path": s.clipPath };
        }
        return {};
    });

    return (
        <div class={`relative ${local.class ?? ""}`} style={local.style} {...rest}>
            {/* Base */}
            <div class="pointer-events-none select-none">
                {local.render()}
            </div>

            {/* Lens */}
            <div
                class={`pointer-events-none absolute inset-0 overflow-hidden ${local.lensClass ?? ""}`}
                style={{
                    ...clipStyle(),
                    ...local.lensStyle,
                }}
            >
                <div
                    style={{
                        transform: `scale(${scale()})`,
                        "transform-origin": "center",
                        "will-change": "transform",
                    }}
                >
                    {local.render()}
                </div>
            </div>
        </div>
    );
}