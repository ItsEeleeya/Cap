
import { cx } from "cva";
import { children, ParentProps } from "solid-js";

export function SolariumToolbarButtonContainer(props: ParentProps<{ class?: string }>) {
    const resolved = children(() => props.children)
    return <div data-tauri-drag-region class={cx("apple-glass bg-gray-2/70 flex gap-2 rounded-full px-1 py-0.5", props.class)}>{resolved()}</div>;
}