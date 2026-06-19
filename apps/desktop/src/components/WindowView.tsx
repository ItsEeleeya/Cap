import { cx } from "cva";
import {
	createSignal,
	type JSX,
	mergeProps,
	onCleanup,
	type ParentProps,
	Show,
	splitProps,
} from "solid-js";

export interface WindowViewProps extends ParentProps {
	sidebar?: JSX.Element;
	toolbar?: JSX.Element;
	sidebarCollapsible?: boolean;
	sidebarInitialSize?: number;
	sidebarMinSize?: number;
	// Expose additional sidebar controls
	resizable?: boolean;
	defaultSidebarWidth?: number;
	minSidebarWidth?: number;
	maxSidebarWidth?: number;
	persistKey?: string;
	sidebarClass?: string;
	handleClass?: string;
	class?: string;
	contentClass?: string;
}

export default function WindowView(props: WindowViewProps) {
	const merged = mergeProps(
		{
			sidebarCollapsible: false,
			sidebarInitialSize: 0.28,
			sidebarMinSize: 0.18,
			resizable: true,
			defaultSidebarWidth: 180,
			minSidebarWidth: 10,
			maxSidebarWidth: 180,
			persistKey: "settings-sidebar",
			sidebarClass: undefined,
			handleClass: undefined,
		},
		props,
	);

	const [local, other] = splitProps(merged, [
		"sidebar",
		"toolbar",
		"sidebarCollapsible",
		"sidebarInitialSize",
		"sidebarMinSize",
		"resizable",
		"defaultSidebarWidth",
		"minSidebarWidth",
		"maxSidebarWidth",
		"persistKey",
		"sidebarClass",
		"handleClass",
		"class",
		"contentClass",
		"children",
	]);

	return (
		<div
			class={cx(
				"flex h-full min-h-0 flex-col overflow-hidden pt-[52px]",
				local.class,
			)}
		>
			<SidebarSplitView
				persistKey={local.persistKey}
				sidebar={local.sidebar}
				resizable={local.resizable}
				defaultSidebarWidth={local.defaultSidebarWidth}
				minSidebarWidth={local.minSidebarWidth}
				maxSidebarWidth={local.maxSidebarWidth}
				class={local.class}
				sidebarClass={local.sidebarClass}
				contentClass={local.contentClass}
				handleClass={local.handleClass}
			>
				{props.children}
			</SidebarSplitView>
		</div>
	);
}

function SidebarSplitView(
	props: ParentProps<{
		persistKey?: string;
		sidebar?: JSX.Element;
		resizable?: boolean;
		defaultSidebarWidth?: number;
		minSidebarWidth?: number;
		maxSidebarWidth?: number;
		class?: string;
		sidebarClass?: string;
		contentClass?: string;
		handleClass?: string;
	}>,
) {
	const [local] = splitProps(
		mergeProps(props, {
			resizable: true,
			defaultSidebarWidth: 280,
			minSidebarWidth: 180,
			maxSidebarWidth: 560,
		}),
		[
			"sidebar",
			"resizable",
			"defaultSidebarWidth",
			"minSidebarWidth",
			"maxSidebarWidth",
			"persistKey",
			"class",
			"sidebarClass",
			"contentClass",
			"handleClass",
			"children",
		],
	);

	const storageKey = local.persistKey ?? "sidebar-width";

	const initialWidth = (() => {
		try {
			const v = localStorage.getItem(storageKey);
			return v !== null ? Number(v) : local.defaultSidebarWidth;
		} catch {
			return local.defaultSidebarWidth;
		}
	})();

	const [sidebarWidthSignal, _setSidebarWidth] = createSignal(initialWidth);
	const setSidebarWidth = (v: number) => {
		_setSidebarWidth(v);
		try {
			localStorage.setItem(storageKey, String(v));
		} catch {}
	};

	let dragging = false;
	let startX = 0;
	let startWidth = 0;

	const stopDragging = () => {
		if (!dragging) return;
		dragging = false;
		document.body.style.cursor = "";
		document.body.style.userSelect = "";
		window.removeEventListener("pointermove", onPointerMove);
		window.removeEventListener("pointerup", stopDragging);
	};

	const onPointerMove = (event: PointerEvent) => {
		if (!dragging) return;
		const next = clamp(
			startWidth + (event.clientX - startX),
			local.minSidebarWidth,
			local.maxSidebarWidth,
		);
		setSidebarWidth(next);
	};

	onCleanup(() => {
		stopDragging();
	});

	const startResize = (event: PointerEvent) => {
		if (!local.resizable) return;
		dragging = true;
		startX = event.clientX;
		startWidth = sidebarWidthSignal();

		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", stopDragging);
	};

	return (
		<div class={cx("flex h-full min-h-0 w-full overflow-hidden", local.class)}>
			<Show when={local.sidebar}>
				<aside
					class={cx("min-w-0 min-h-0 overflow-hidden", local.sidebarClass)}
					style={{ width: `${sidebarWidthSignal()}px` }}
				>
					{local.sidebar}
				</aside>

				<Show when={local.resizable}>
					<div
						role="separator"
						aria-orientation="vertical"
						onPointerDown={startResize}
						class={cx(
							"group relative z-10 h-full w-px cursor-col-resize bg-transparent",
							local.handleClass,
						)}
					>
						<div class="h-full w-px bg-gray-5 transition-colors group-hover:bg-gray-7 group-active:bg-gray-8" />
					</div>
				</Show>
			</Show>

			<main
				class={cx("min-w-0 min-h-0 overflow-hidden flex-1", local.contentClass)}
			>
				{local.children}
			</main>
		</div>
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}
