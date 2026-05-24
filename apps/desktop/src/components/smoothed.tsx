// Credits: https://roomzer.dev/smoothed-components/
// Adopted for SolidJS

import {
	type ComponentProps,
	createEffect,
	type JSX,
	onCleanup,
	splitProps,
	type ValidComponent,
} from "solid-js";
import { Dynamic } from "solid-js/web";

/**
 * Smoothed — unified iOS-style smoothing component.
 *
 * Auto-detects shape based on `radius`:
 * - When `radius >= min(width, height) / 2` with uniform corners → **capsule**
 *   (uses a cap-Bézier construction tangent to the long axis)
 * - Otherwise → **squircle** (per-corner smoothed rounded rectangle)
 *
 * Per-corner radii (`topLeftRadius`, `topRightRadius`, …) always render as a
 * squircle, even if the base radius would otherwise produce a capsule.
 *
 * @example Basic usage
 * ```tsx
 * <Smoothed radius={24} smoothing={0.6} class="p-4 bg-white">
 *   Content
 * </Smoothed>
 * ```
 *
 * @example Capsule (auto-detected)
 * ```tsx
 * <Smoothed radius={9999} smoothing={0.6} class="px-4 py-2 bg-white">
 *   Label
 * </Smoothed>
 * ```
 *
 * @example Per-corner radii
 * ```tsx
 * <Smoothed
 *   radius={20}
 *   topLeftRadius={32}
 *   bottomRightRadius={4}
 *   smoothing={0.6}
 * />
 * ```
 */
export interface SmoothedOwnProps {
	/** Base corner radius in px (default 0). When >= min(width,height)/2, automatically becomes a capsule. */
	radius?: number;
	/** Per-corner overrides — applied on top of radius. Only the specified corners are overridden. */
	topLeftRadius?: number;
	topRightRadius?: number;
	bottomRightRadius?: number;
	bottomLeftRadius?: number;
	/** Corner smoothing factor (0–1, default 0.6) */
	smoothing?: number;
	/** Border width in px (rendered via ::after pseudo-element) */
	borderWidth?: number;
	/** Border color (supports any CSS color value) */
	borderColor?: string;
	/** Render as a different element or component (e.g. "button") */
	as?: ValidComponent;
	children?: JSX.Element;
}

export type SmoothedProps<T extends ValidComponent = "div"> = SmoothedOwnProps &
	Omit<ComponentProps<T>, keyof SmoothedOwnProps>;

const observed = new WeakMap<Element, (w: number, h: number) => void>();
let sharedRO: ResizeObserver | null = null;

function getRO(): ResizeObserver {
	if (!sharedRO) {
		sharedRO = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const cb = observed.get(entry.target);
				if (!cb) continue;
				const box = entry.borderBoxSize?.[0];
				if (box) {
					cb(box.inlineSize, box.blockSize);
				} else {
					const rect = entry.target.getBoundingClientRect();
					cb(rect.width, rect.height);
				}
			}
		});
	}
	return sharedRO;
}

let styleInjected = false;
function ensureStyle(): void {
	if (styleInjected) return;
	styleInjected = true;
	const el = document.createElement("style");
	el.textContent = `
    .smoothed-base {
      position: relative;
      overflow: visible;
    }
    .smoothed-border::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
      clip-path: var(--sm-border-clip);
      background: var(--sm-border-color);
    }
  `;
	document.head.appendChild(el);
}

const pathCache = new Map<string, string>();
const CACHE_MAX = 256;

function cached(key: string, build: () => string): string {
	let path = pathCache.get(key);
	if (path) return path;
	path = build();
	if (pathCache.size >= CACHE_MAX) {
		const first = pathCache.keys().next().value;
		if (first !== undefined) pathCache.delete(first);
	}
	pathCache.set(key, path);
	return path;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const f = (n: number) => n.toFixed(5);

interface CornerParams {
	a: number;
	b: number;
	c: number;
	d: number;
	p: number;
	r: number;
	arcLen: number;
}

function cornerParams(
	radius: number,
	smoothing: number,
	budget: number,
): CornerParams {
	const s = smoothing;
	let p = (1 + s) * radius;
	const arcMeasure = 90 * (1 - s);
	const arcLen = Math.sin(toRad(arcMeasure / 2)) * radius * Math.SQRT2;
	const angleAlpha = (90 - arcMeasure) / 2;
	const p3p4 = radius * Math.tan(toRad(angleAlpha / 2));
	const angleBeta = 45 * s;
	const c = p3p4 * Math.cos(toRad(angleBeta));
	const d = c * Math.tan(toRad(angleBeta));
	let b = (p - arcLen - c - d) / 3;
	let a = 2 * b;
	if (p > budget) {
		const space = budget - d - arcLen - c;
		const minA = space / 6;
		const maxB = space - minA;
		b = Math.min(b, maxB);
		a = space - b;
		p = Math.min(p, budget);
	}
	return { a, b, c, d, p, r: radius, arcLen };
}

function buildSquirclePath(
	w: number,
	h: number,
	radius: number,
	smoothing: number,
	tlr?: number,
	trr?: number,
	brr?: number,
	blr?: number,
): string {
	if (w <= 0 || h <= 0) return "";
	const budget = Math.min(w, h) / 2;
	const cr = Math.min(radius, budget);
	const TR = cornerParams(Math.min(trr ?? cr, budget), smoothing, budget);
	const BR = cornerParams(Math.min(brr ?? cr, budget), smoothing, budget);
	const BL = cornerParams(Math.min(blr ?? cr, budget), smoothing, budget);
	const TL = cornerParams(Math.min(tlr ?? cr, budget), smoothing, budget);
	const parts: string[] = [];
	parts.push(`M ${f(w - TR.p)} 0`);
	if (TR.r) {
		parts.push(
			`c ${f(TR.a)} 0 ${f(TR.a + TR.b)} 0 ${f(TR.a + TR.b + TR.c)} ${f(TR.d)}`,
		);
		parts.push(`a ${f(TR.r)} ${f(TR.r)} 0 0 1 ${f(TR.arcLen)} ${f(TR.arcLen)}`);
		parts.push(
			`c ${f(TR.d)} ${f(TR.c)} ${f(TR.d)} ${f(TR.b + TR.c)} ${f(TR.d)} ${f(TR.a + TR.b + TR.c)}`,
		);
	}
	parts.push(`L ${f(w)} ${f(h - BR.p)}`);
	if (BR.r) {
		parts.push(
			`c 0 ${f(BR.a)} 0 ${f(BR.a + BR.b)} ${f(-BR.d)} ${f(BR.a + BR.b + BR.c)}`,
		);
		parts.push(
			`a ${f(BR.r)} ${f(BR.r)} 0 0 1 ${f(-BR.arcLen)} ${f(BR.arcLen)}`,
		);
		parts.push(
			`c ${f(-BR.c)} ${f(BR.d)} ${f(-(BR.b + BR.c))} ${f(BR.d)} ${f(-(BR.a + BR.b + BR.c))} ${f(BR.d)}`,
		);
	}
	parts.push(`L ${f(BL.p)} ${f(h)}`);
	if (BL.r) {
		parts.push(
			`c ${f(-BL.a)} 0 ${f(-(BL.a + BL.b))} 0 ${f(-(BL.a + BL.b + BL.c))} ${f(-BL.d)}`,
		);
		parts.push(
			`a ${f(BL.r)} ${f(BL.r)} 0 0 1 ${f(-BL.arcLen)} ${f(-BL.arcLen)}`,
		);
		parts.push(
			`c ${f(-BL.d)} ${f(-BL.c)} ${f(-BL.d)} ${f(-(BL.b + BL.c))} ${f(-BL.d)} ${f(-(BL.a + BL.b + BL.c))}`,
		);
	}
	parts.push(`L 0 ${f(TL.p)}`);
	if (TL.r) {
		parts.push(
			`c 0 ${f(-TL.a)} 0 ${f(-(TL.a + TL.b))} ${f(TL.d)} ${f(-(TL.a + TL.b + TL.c))}`,
		);
		parts.push(
			`a ${f(TL.r)} ${f(TL.r)} 0 0 1 ${f(TL.arcLen)} ${f(-TL.arcLen)}`,
		);
		parts.push(
			`c ${f(TL.c)} ${f(-TL.d)} ${f(TL.b + TL.c)} ${f(-TL.d)} ${f(TL.a + TL.b + TL.c)} ${f(-TL.d)}`,
		);
	}
	parts.push("Z");
	return parts.join(" ");
}

function buildCapsulePath(w: number, h: number, smoothing: number): string {
	if (w <= 0 || h <= 0) return "";
	const shortSide = Math.min(w, h);
	const r = shortSide / 2;
	if (r <= 0) return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
	const s = Math.max(0, Math.min(1, smoothing));
	const betaRad = toRad(45 * s);
	const arcHalfRad = toRad(45 * (1 - s));
	const arcLen = Math.sin(arcHalfRad) * r * Math.SQRT2;
	const c = r * Math.tan(betaRad / 2) * Math.cos(betaRad);
	const d = c * Math.tan(betaRad);
	const longBudget = Math.max(w, h) / 2;
	const longSpace = Math.max(
		0,
		Math.min((1 + s) * r, longBudget) - d - arcLen - c,
	);
	const bl = longSpace / 3;
	const al = 2 * bl;
	const pLong = al + bl + c + d + arcLen;
	const sinB = Math.sin(betaRad);
	const cosB = Math.cos(betaRad);
	const t = s > 0 ? (4 * r * Math.tan(betaRad / 2)) / 3 : 0;
	const capSpan = shortSide - 2 * d - 2 * arcLen;
	const tx = t * sinB;
	const ty = t * cosB;
	const isH = w >= h;
	const parts: string[] = [];
	if (isH) {
		parts.push(`M ${f(w - pLong)} 0`);
		parts.push(`c ${f(al)} 0 ${f(al + bl)} 0 ${f(al + bl + c)} ${f(d)}`);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(arcLen)} ${f(arcLen)}`);
		parts.push(
			`c ${f(tx)} ${f(ty)} ${f(tx)} ${f(capSpan - ty)} 0 ${f(capSpan)}`,
		);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(-arcLen)} ${f(arcLen)}`);
		parts.push(
			`c ${f(-c)} ${f(d)} ${f(-(bl + c))} ${f(d)} ${f(-(al + bl + c))} ${f(d)}`,
		);
		if (w - 2 * pLong > 0.01) parts.push(`L ${f(pLong)} ${f(h)}`);
		parts.push(
			`c ${f(-al)} 0 ${f(-(al + bl))} 0 ${f(-(al + bl + c))} ${f(-d)}`,
		);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(-arcLen)} ${f(-arcLen)}`);
		parts.push(
			`c ${f(-tx)} ${f(-ty)} ${f(-tx)} ${f(-capSpan + ty)} 0 ${f(-capSpan)}`,
		);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(arcLen)} ${f(-arcLen)}`);
		parts.push(
			`c ${f(c)} ${f(-d)} ${f(bl + c)} ${f(-d)} ${f(al + bl + c)} ${f(-d)}`,
		);
		parts.push("Z");
	} else {
		parts.push(`M ${f(w)} ${f(h - pLong)}`);
		parts.push(`c 0 ${f(al)} 0 ${f(al + bl)} ${f(-d)} ${f(al + bl + c)}`);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(-arcLen)} ${f(arcLen)}`);
		parts.push(
			`c ${f(-ty)} ${f(tx)} ${f(-capSpan + ty)} ${f(tx)} ${f(-capSpan)} 0`,
		);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(-arcLen)} ${f(-arcLen)}`);
		parts.push(
			`c ${f(-d)} ${f(-c)} ${f(-d)} ${f(-(bl + c))} ${f(-d)} ${f(-(al + bl + c))}`,
		);
		if (h - 2 * pLong > 0.01) parts.push(`L 0 ${f(pLong)}`);
		parts.push(`c 0 ${f(-al)} 0 ${f(-(al + bl))} ${f(d)} ${f(-(al + bl + c))}`);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(arcLen)} ${f(-arcLen)}`);
		parts.push(
			`c ${f(ty)} ${f(-tx)} ${f(capSpan - ty)} ${f(-tx)} ${f(capSpan)} 0`,
		);
		if (arcLen > 0.001)
			parts.push(`a ${f(r)} ${f(r)} 0 0 1 ${f(arcLen)} ${f(arcLen)}`);
		parts.push(
			`c ${f(d)} ${f(c)} ${f(d)} ${f(bl + c)} ${f(d)} ${f(al + bl + c)}`,
		);
		parts.push("Z");
	}
	return parts.join(" ");
}

export interface GeoOpts {
	radius: number;
	topLeftRadius?: number;
	topRightRadius?: number;
	bottomRightRadius?: number;
	bottomLeftRadius?: number;
	smoothing: number;
	borderWidth: number;
}

function buildPath(w: number, h: number, geo: GeoOpts): string {
	const shortHalf = Math.min(w, h) / 2;
	const hasUniformRadii =
		geo.topLeftRadius === undefined &&
		geo.topRightRadius === undefined &&
		geo.bottomRightRadius === undefined &&
		geo.bottomLeftRadius === undefined;
	const isCapsule =
		geo.radius >= shortHalf && hasUniformRadii && Math.abs(w - h) > 0.5;
	if (isCapsule) {
		return buildCapsulePath(w, h, geo.smoothing);
	}
	return buildSquirclePath(
		w,
		h,
		geo.radius,
		geo.smoothing,
		geo.topLeftRadius,
		geo.topRightRadius,
		geo.bottomRightRadius,
		geo.bottomLeftRadius,
	);
}

function offsetPath(pathString: string, offset: number): string {
	return pathString.replace(
		/([ML])\s*([\d.-]+)\s+([\d.-]+)/g,
		(_, cmd, x, y) =>
			`${cmd} ${parseFloat(x) + offset} ${parseFloat(y) + offset}`,
	);
}

function buildClipPaths(
	w: number,
	h: number,
	geo: GeoOpts,
): { outer: string; border: string | null } | null {
	if (w <= 0 || h <= 0) return null;
	const key = `sm:${w}:${h}:${geo.radius}:${geo.smoothing}:${geo.topLeftRadius ?? ""}:${geo.topRightRadius ?? ""}:${geo.bottomRightRadius ?? ""}:${geo.bottomLeftRadius ?? ""}`;
	const outer = cached(key, () => buildPath(w, h, geo));
	let border: string | null = null;
	const bw = geo.borderWidth;
	if (bw > 0) {
		const iw = w - bw * 2;
		const ih = h - bw * 2;
		if (iw > 0 && ih > 0) {
			const innerGeo: GeoOpts = {
				...geo,
				radius: Math.max(0, geo.radius - bw),
				topLeftRadius:
					geo.topLeftRadius !== undefined
						? Math.max(0, geo.topLeftRadius - bw)
						: undefined,
				topRightRadius:
					geo.topRightRadius !== undefined
						? Math.max(0, geo.topRightRadius - bw)
						: undefined,
				bottomRightRadius:
					geo.bottomRightRadius !== undefined
						? Math.max(0, geo.bottomRightRadius - bw)
						: undefined,
				bottomLeftRadius:
					geo.bottomLeftRadius !== undefined
						? Math.max(0, geo.bottomLeftRadius - bw)
						: undefined,
			};
			const innerKey = `sm:${iw}:${ih}:${innerGeo.radius}:${innerGeo.smoothing}:${innerGeo.topLeftRadius ?? ""}:${innerGeo.topRightRadius ?? ""}:${innerGeo.bottomRightRadius ?? ""}:${innerGeo.bottomLeftRadius ?? ""}`;
			const inner = cached(innerKey, () => buildPath(iw, ih, innerGeo));
			const rect = `M -1 -1 L ${w + 1} -1 L ${w + 1} ${h + 1} L -1 ${h + 1} Z`;
			border = `path(evenodd, '${rect} ${offsetPath(inner, bw)}')`;
		}
	}
	return { outer, border };
}

function geoKey(g: GeoOpts): string {
	return `${g.radius}:${g.topLeftRadius}:${g.topRightRadius}:${g.bottomRightRadius}:${g.bottomLeftRadius}:${g.smoothing}:${g.borderWidth}`;
}

export interface SmoothedHandle {
	sync: (geo: GeoOpts, borderColor: string) => void;
	disconnect: () => void;
}

export function smoothedObserver(
	el: HTMLElement,
	initialGeo: GeoOpts,
	initialBorderColor: string,
): SmoothedHandle {
	let geo = initialGeo;
	let lastOuterPath = "";
	let lastGeoKey = "";
	let lastBorderColor = "";
	ensureStyle();
	el.classList.add("smoothed-base");

	const applyGeometry = (w: number, h: number) => {
		const result = buildClipPaths(w, h, geo);
		if (!result) return;
		if (result.outer === lastOuterPath) return;
		lastOuterPath = result.outer;
		el.style.clipPath = `path('${result.outer}')`;
		const r = geo.radius;
		const tl = geo.topLeftRadius ?? r;
		const tr = geo.topRightRadius ?? r;
		const br = geo.bottomRightRadius ?? r;
		const bl = geo.bottomLeftRadius ?? r;
		el.style.borderRadius = `${tl}px ${tr}px ${br}px ${bl}px`;
		if (result.border) {
			el.classList.add("smoothed-border");
			el.style.setProperty("--sm-border-clip", result.border);
		} else {
			el.classList.remove("smoothed-border");
			el.style.removeProperty("--sm-border-clip");
		}
	};

	lastGeoKey = geoKey(geo);
	const initRect = el.getBoundingClientRect();
	applyGeometry(initRect.width, initRect.height);
	if (initialBorderColor) {
		el.style.setProperty("--sm-border-color", initialBorderColor);
		lastBorderColor = initialBorderColor;
	}

	let dims: [number, number] = [initRect.width, initRect.height];
	const onResize = (w: number, h: number) => {
		if (w !== dims[0] || h !== dims[1]) {
			dims = [w, h];
			lastOuterPath = "";
			applyGeometry(w, h);
		}
	};
	observed.set(el, onResize);
	getRO().observe(el);

	return {
		sync(newGeo: GeoOpts, borderColor: string) {
			const newKey = geoKey(newGeo);
			if (newKey !== lastGeoKey) {
				geo = newGeo;
				lastGeoKey = newKey;
				lastOuterPath = "";
				const rect = el.getBoundingClientRect();
				dims = [rect.width, rect.height];
				applyGeometry(rect.width, rect.height);
			}
			if (borderColor !== lastBorderColor) {
				el.style.setProperty("--sm-border-color", borderColor);
				lastBorderColor = borderColor;
			}
		},
		disconnect() {
			observed.delete(el);
			getRO().unobserve(el);
			el.classList.remove("smoothed-base", "smoothed-border");
			el.style.removeProperty("--sm-border-clip");
			el.style.removeProperty("--sm-border-color");
			el.style.removeProperty("clip-path");
			el.style.removeProperty("border-radius");
		},
	};
}

export function Smoothed<T extends ValidComponent = "div">(
	props: SmoothedProps<T>,
) {
	const [local, rest] = splitProps(props, [
		"as",
		"radius",
		"topLeftRadius",
		"topRightRadius",
		"bottomRightRadius",
		"bottomLeftRadius",
		"smoothing",
		"borderWidth",
		"borderColor",
		"children",
	]);

	const userRef = (props as { ref?: (el: HTMLElement | undefined) => void })
		.ref;
	let handle: SmoothedHandle | null = null;
	let element: HTMLElement | undefined;

	const createGeo = (): GeoOpts => ({
		radius: local.radius ?? 0,
		topLeftRadius: local.topLeftRadius,
		topRightRadius: local.topRightRadius,
		bottomRightRadius: local.bottomRightRadius,
		bottomLeftRadius: local.bottomLeftRadius,
		smoothing: local.smoothing ?? 0.6,
		borderWidth: local.borderWidth ?? 0,
	});

	const refCallback = (el: HTMLElement | undefined) => {
		if (handle) {
			handle.disconnect();
			handle = null;
		}
		if (el) {
			handle = smoothedObserver(
				el,
				createGeo(),
				local.borderColor ?? "transparent",
			);
		}
		element = el;
		if (typeof userRef === "function") {
			userRef(el);
		}
	};

	createEffect(() => {
		if (!element || !handle) return;
		handle.sync(createGeo(), local.borderColor ?? "transparent");
	});

	onCleanup(() => handle?.disconnect());

	return (
		<Dynamic component={local.as ?? "div"} ref={refCallback} {...rest}>
			{local.children}
		</Dynamic>
	);
}

export default Smoothed;
