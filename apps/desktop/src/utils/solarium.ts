import { createContextProvider } from "@solid-primitives/context";
import { type } from "@tauri-apps/plugin-os";
import {
	createEffect,
	createSignal,
	onCleanup,
	onMount,
	type ParentProps,
} from "solid-js";
import { generalSettingsStore } from "~/store";
import {
	commands,
	GlassEffectOptions,
	JsRect,
	SolariumOverlay,
	type GlassEffectVariant,
} from "./tauri";

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
	private lastCornerRadius: number | null = null;
	private rafId: number | null = null;
	private resizeObserver: ResizeObserver;
	private mutationObserver: MutationObserver;
	private abort = new AbortController();
	private active = false;
	private creating = false;

	constructor(
		private readonly id: string,
		private readonly element: Element,
		private readonly options: GlassEffectOptions,
	) {
		this.resizeObserver = new ResizeObserver(this.schedule);
		this.mutationObserver = new MutationObserver(this.schedule);
	}

	private getCornerRadius(): number {
		const style = getComputedStyle(this.element);
		const radii = [
			style.borderTopLeftRadius,
			style.borderTopRightRadius,
			style.borderBottomRightRadius,
			style.borderBottomLeftRadius,
		].map((radius) => Number.parseFloat(radius) || 0);
		const maxRadius = radii.reduce(
			(max, radius) => (radius > max ? radius : max),
			0,
		);
		return maxRadius || this.options.cornerRadius;
	}

	async start(): Promise<void> {
		if (this.active || this.creating) {
			return;
		}

		this.creating = true;
		const rect = getRect(this.element);
		const cornerRadius = this.getCornerRadius();

		try {
			await commands.createSolariumOverlay(this.id, {
				rect,
				glassOptions: {
					...this.options,
					cornerRadius,
				},
			});
			this.active = true;
			this.lastRect = rect;
			this.lastCornerRadius = cornerRadius;
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
		const cornerRadius = this.getCornerRadius();
		const rectChanged =
			this.lastRect === null || !rectsEqual(rect, this.lastRect);
		const radiusChanged =
			this.lastCornerRadius === null || cornerRadius !== this.lastCornerRadius;
		if (!rectChanged && !radiusChanged) return;

		this.lastRect = rect;
		this.lastCornerRadius = cornerRadius;

		void commands.updateSolariumOverlay(this.id, {
			rect,
			glassOptions: {
				...this.options,
				cornerRadius,
			},
		});
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
		easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";
	};
	class?: string;
	style?: string;
}>;

export function SolariumOverlayC(props: SolariumOverlayProps) {
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
}
