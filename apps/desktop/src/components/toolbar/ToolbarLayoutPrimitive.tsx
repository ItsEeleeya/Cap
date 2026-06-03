import { type JSX, splitProps } from "solid-js";

interface SlotProps {
    class?: string;
    children?: JSX.Element;
}

export function ToolbarLayoutPrimitive(props: SlotProps) {
    const [local, rest] = splitProps(props, ["class", "children"]);
    return (
        <div
            class={["cap-toolbar", local.class].filter(Boolean).join(" ")}
            {...rest}
        >
            {local.children}
        </div>
    );
}

// Sizing is inline so it's always correct regardless of CSS load order.
// --window-titlebar-leading-safe is available immediately once data-platform is set
// (LTR is the default in chrome.css, RTL overrides when data-dir is added).
ToolbarLayoutPrimitive.SidebarSlot = function SidebarSlot(props: SlotProps) {
    const [local, rest] = splitProps(props, ["class", "children"]);
    return (
        <div
            class={["flex-shrink-0 flex items-center h-full overflow-hidden", local.class]
                .filter(Boolean)
                .join(" ")}
            style={{
                width: "var(--sidebar-width)",
                "min-width": "var(--window-titlebar-leading-safe)",
                "padding-inline-start": "var(--window-titlebar-leading-safe)",
            }}
            {...rest}
        >
            {local.children}
        </div>
    );
};

ToolbarLayoutPrimitive.Content = function Content(props: SlotProps) {
    const [local, rest] = splitProps(props, ["class", "children"]);
    return (
        <div
            class={["cap-toolbar-content", local.class].filter(Boolean).join(" ")}
            {...rest}
        >
            {local.children}
        </div>
    );
};

ToolbarLayoutPrimitive.ItemGroup = function ItemGroup(
    props: SlotProps & { gap?: number },
) {
    const [local, rest] = splitProps(props, ["class", "gap", "children"]);
    return (
        <div
            class={["cap-toolbar-item-group", local.class].filter(Boolean).join(" ")}
            style={{ "--toolbar-group-gap": `${local.gap ?? 2}px` }}
            {...rest}
        >
            {local.children}
        </div>
    );
};

ToolbarLayoutPrimitive.Item = function Item(props: SlotProps) {
    const [local, rest] = splitProps(props, ["class", "children"]);
    return (
        <div
            class={["cap-toolbar-item", local.class].filter(Boolean).join(" ")}
            {...rest}
        >
            {local.children}
        </div>
    );
};