import { createContextProvider } from "@solid-primitives/context";
import { type } from "@tauri-apps/plugin-os";
import { createEffect, createSignal } from "solid-js";
import { generalSettingsStore } from "~/store";

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

import { commands } from "./tauri";

// 0–23, maps 1:1 to GlassMaterialVariant
export type GlassVariant = number;

export const GlassEffectVariant = {
	regular: 0,
	clear: 1,
	dock: 2,
	appIcons: 3,
	widgets: 4,
	text: 5,
	avplayer: 6,
	facetime: 7,
	controlCenter: 8,
	notificationCenter: 9,
	monogram: 10,
	bubbles: 11,
	identity: 12,
	focusBorder: 13,
	focusPlatter: 14,
	keyboard: 15,
	sidebar: 16,
	abuttedSidebar: 17,
	inspector: 18,
	control: 19,
	loupe: 20,
	slider: 21,
	camera: 22,
	cartouchePopover: 23,
};

export interface OverlayOptions {
	cornerRadius?: number;
	variant?: GlassVariant;
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

	constructor(
		private readonly id: string,
		private readonly element: Element,
		private readonly options: OverlayOptions = {},
	) {
		this.resizeObserver = new ResizeObserver(this.schedule);
		this.mutationObserver = new MutationObserver(this.schedule);
	}

	async start(): Promise<void> {
		const rect = getRect(this.element);

		commands.createOverlay(
			this.id,
			rect,
			this.options.cornerRadius ?? 12,
			this.options.variant ?? 0,
		);

		this.active = true;
		this.lastRect = rect;
		this.attach();
	}

	async stop(): Promise<void> {
		this.active = false;

		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}

		this.resizeObserver.disconnect();
		this.mutationObserver.disconnect();
		this.abort.abort();

		// await invoke("plugin:overlay|destroy_overlay", { id: this.id });
		await commands.destroyOverlay(this.id);
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

		commands.updateOverlay(this.id, rect);
	}
}
