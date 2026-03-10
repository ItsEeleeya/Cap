import { children, ParentProps } from "solid-js";
import { cx } from "cva";
import { createWindowFocus } from "~/routes/debug-library";

export function MaterialLayer(props: ParentProps<{
    class: string,
}>) {
    const resolved = children(() => props.children);
    const focused = createWindowFocus();
    return (
        <div
            data-tauri-drag-region
            class={cx(props.class, focused() ? "apple-glass-adaptive" : "apple-glass-subdued")}>
            {resolved()}
        </div>
    );
}