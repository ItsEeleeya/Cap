import { cx } from "cva";
import type { ComponentProps } from "solid-js";
import { ElasticSurface } from "~/components/ElasticSurface";

export default function GlassEffectContainer(props: ComponentProps<"div">) {
	return (
		<ElasticSurface
			{...props}
			class={cx("apple-glass", props.class)}
		></ElasticSurface>
	);
}
