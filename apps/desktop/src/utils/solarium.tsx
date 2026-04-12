import { createContextProvider } from "@solid-primitives/context";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { type } from "@tauri-apps/plugin-os";
import { Component, createEffect, createSignal, onCleanup, onMount, ParentProps } from "solid-js";
import { generalSettingsStore } from "~/store";
import { commands, GlassEffectVariant } from "./tauri";

export const [SolariumContext, useSolarium] = createContextProvider(() => {
	const generalSettings = generalSettingsStore.createQuery();
	const [enabled, setEnabled] = createSignal(
		document.documentElement.hasAttribute("solarium"),
	);
	if (type() === "macos") {
		createEffect(() =>
			setEnabled(!!generalSettings.data?.experimentalSolarium),
		);
	}
	return enabled;
});

// 0–23, maps 1:1 to GlassMaterialVariant
export type GlassVariant = number;

// export const _GlassEffectVariant = {
// 	regular: 0,
// 	clear: 1,
// 	dock: 2,
// 	appIcons: 3,
// 	widgets: 4,
// 	text: 5,
// 	avplayer: 6,
// 	facetime: 7,
// 	controlCenter: 8,
// 	notificationCenter: 9,
// 	monogram: 10,
// 	bubbles: 11,
// 	identity: 12,
// 	focusBorder: 13,
// 	focusPlatter: 14,
// 	keyboard: 15,
// 	sidebar: 16,
// 	abuttedSidebar: 17,
// 	inspector: 18,
// 	control: 19,
// 	loupe: 20,
// 	slider: 21,
// 	camera: 22,
// 	cartouchePopover: 23,
// };

export interface OverlayOptions {
	cornerRadius?: number;
	variant?: GlassEffectVariant;
	tintColor?: [number, number, number]; // RGB values 0-255
	scale?: number; // Scale factor for the layer
	animation?: {
		duration?: number;
		easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
	};
}

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

function rectsEqual(a: Rect, b: Rect): boolean {
	return (
		a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
	);
}

function getRect(el: Element): Rect {
	const { left, top, width, height } = el.getBoundingClientRect();
	return { x: left, y: top, width, height };
}

export class OverlayTracker {
	private lastRect: Rect | null = null;
	private rafId: number | null = null;
	private resizeObserver: ResizeObserver;
	private mutationObserver: MutationObserver;
	private abort = new AbortController();
	private active = false;
	private creating = false;

	constructor(
		private readonly id: string,
		private readonly element: Element,
		private readonly options: OverlayOptions = {},
	) {
		this.resizeObserver = new ResizeObserver(this.schedule);
		this.mutationObserver = new MutationObserver(this.schedule);
	}

	async start(): Promise<void> {
		if (this.active || this.creating) {
			return;
		}

		this.creating = true;
		const rect = getRect(this.element);

		try {
			// await invoke("create_solarium_overlay", {
			// 	id: this.id,
			// 	window_label: "main",
			// 	rect,
			// 	corner_radius: this.options.cornerRadius ?? 12,
			// 	variant: this.options.variant ?? 0,
			// });
			await commands.createSolariumOverlay(
				this.id,
				{
					rect,
					corner_radius: this.options.cornerRadius ?? 12,
					variant: this.options.variant ?? "regular"
				},
			);
			this.active = true;
			this.lastRect = rect;
			this.attach();
		} finally {
			this.creating = false;
		}
	}

	async stop(): Promise<void> {
		if (!this.active) {
			return;
		}

		this.active = false;

		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		this.resizeObserver.disconnect();
		this.mutationObserver.disconnect();
		this.abort.abort();

		// await invoke("destroy_solarium_overlay", { id: this.id });
		await commands.destroySolariumOverlay(this.id);
	}

	private attach(): void {
		this.resizeObserver.observe(this.element);
		this.resizeObserver.observe(document.documentElement);

		this.mutationObserver.observe(this.element, {
			attributes: true,
			attributeFilter: ["style", "class"],
		});

		const opts = { passive: true, signal: this.abort.signal } as const;

		let node: Element | null = this.element.parentElement;
		while (node !== null) {
			node.addEventListener("scroll", this.schedule, opts);
			node = node.parentElement;
		}
		window.addEventListener("scroll", this.schedule, opts);
		window.addEventListener("resize", this.schedule, {
			signal: this.abort.signal,
		});
	}

	private schedule = (): void => {
		if (this.rafId !== null) return;
		this.rafId = requestAnimationFrame(() => {
			this.rafId = null;
			this.flush();
		});
	};

	private flush(): void {
		if (!this.active) return;

		const rect = getRect(this.element);
		if (this.lastRect !== null && rectsEqual(rect, this.lastRect)) return;
		this.lastRect = rect;

		void emit("overlay://update", { id: this.id, rect });
	}
}

export type SolariumOverlayProps = ParentProps<{
	id: string;
	cornerRadius?: number;
	variant?: GlassEffectVariant;
	tintColor?: [number, number, number];
	scale?: number;
	animation?: {
		duration?: number;
		easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
	};
	class?: string;
	style?: string;
}>;

export function SolariumOverlay(props: SolariumOverlayProps) {
	const [element, setElement] = createSignal<Element | null>(null);
	const [tracker, setTracker] = createSignal<OverlayTracker | null>(null);
	const solarium = useSolarium();

	onMount(() => {
		const el = element();
		if (!el || !solarium?.()) return;

		const overlayTracker = new OverlayTracker(props.id, el, {
			cornerRadius: props.cornerRadius,
			variant: props.variant,
			tintColor: props.tintColor,
			scale: props.scale,
			animation: props.animation,
		});

		setTracker(overlayTracker);
		overlayTracker.start();
	});

	onCleanup(() => {
		const t = tracker();
		if (t) {
			t.stop();
		}
	});

	// Update tracker when props change
	createEffect(() => {
		const t = tracker();
		if (!t) return;

		// For now, recreate the tracker when options change
		// TODO: Add update method to OverlayTracker
		const el = element();
		if (el) {
			t.stop();
			const newTracker = new OverlayTracker(props.id, el, {
				cornerRadius: props.cornerRadius,
				variant: props.variant,
				tintColor: props.tintColor,
				scale: props.scale,
				animation: props.animation,
			});
			setTracker(newTracker);
			newTracker.start();
		}
	});

	return <div class={props.class} style={props.style} />
};
