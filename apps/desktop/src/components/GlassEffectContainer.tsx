import { cx } from "cva";
import type { ComponentProps, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";
import { ElasticSurface } from "~/components/ElasticSurface";

export default function GlassEffectContainer(
	props: ComponentProps<"div"> & { as?: ValidComponent; clear?: boolean },
) {
	// const solariumEnabled = document.documentElement.hasAttribute("data-solarium");

	const [local, rest] = splitProps(props, ["class", "children"]);

	return (
		<ElasticSurface
			{...rest}
			class={cx(
				"apple-glass",
				// !props.clear &&
				// `before:content-[''] before:smoothed before:bg-white/5 before:backdrop-blur-[2px] before:size-full before:fixed before:rounded-full`,
				local.class,
			)}
		>
			{local.children}
		</ElasticSurface>
	);
}
