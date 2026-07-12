import { cx } from "cva";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import { ElasticSurface } from "~/components/ElasticSurface";

export default function GlassEffectContainer(props: ComponentProps<"div"> & { as?: ValidComponent }) {
	// const solariumEnabled = document.documentElement.hasAttribute("data-solarium");

	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<ElasticSurface {...rest} class={cx("apple-glass", local.class)}>
			{local.children}
		</ElasticSurface>
	);
}
