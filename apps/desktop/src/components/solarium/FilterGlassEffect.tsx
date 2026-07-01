/**
 * GlassFilter.tsx — SolidJS glass refraction component
 *
 * Cross-browser: Chromium, Safari/WebKit (desktop + iOS), Firefox.
 * Designed for Tauri apps (no network, no CDN — pure canvas generation).
 *
 * Technique informed by: https://aave.com/design/building-glass-for-the-web
 *
 * Safari / WebKit fixes applied:
 *  1. Fresh filter ID on every map regeneration → defeats Safari's
 *     aggressive SVG filter output cache (same ID = stale pixels).
 *  2. Displacement map built for the top-left quadrant only, then mirrored
 *     into all four → 4× cheaper, keeps regen inside a single frame.
 *  3. Lens geometry conservatively sized → avoids Safari's source-graphic
 *     size ceiling that breaks the effect into mismatched tiles.
 *  4. Specular highlight image restricted to the lens rectangle → same
 *     visual result at lower cost; Safari avoids per-pixel artifacts
 *     that only Chromium shows at full filter-region size.
 *  5. Uses CSS `filter` on the element itself, not `backdrop-filter` +
 *     SVG. The SVG backdrop-filter approach is Chromium-only; this
 *     bends the element's own rendered pixels instead.
 *
 * Usage:
 *   <Glass width={200} height={80} radius={24} blur={8}>
 *     <YourContent />
 *   </Glass>
 */

import {
	createEffect,
	createSignal,
	type JSX,
	mergeProps,
	onCleanup,
} from "solid-js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface GlassProps {
	/** Width of the glass lens in px */
	width: number;
	/** Height of the glass lens in px */
	height: number;
	/** Corner radius of the lens in px (default 16) */
	radius?: number;
	/** Gaussian blur applied before displacement, in px (default 6) */
	blur?: number;
	/**
	 * Overall displacement scale multiplier.
	 * Higher → more bending. (default 14)
	 */
	refractionScale?: number;
	/**
	 * Lens depth — how far the dome protrudes.
	 * Controls the slope of the height field. (default 10)
	 */
	depth?: number;
	/**
	 * Chromatic aberration strength as a fraction of refractionScale (0–1).
	 * 0 = off. (default 0.18)
	 */
	chromaAmount?: number;
	/** Opacity of the specular / rim highlight (0–1, default 0.4) */
	specularOpacity?: number;
	/** Angle of the virtual light source in degrees (default 135) */
	specularAngle?: number;
	/** Additional CSS class on the outer wrapper */
	class?: string;
	/** Additional inline styles on the outer wrapper */
	style?: JSX.CSSProperties;
	children?: JSX.Element;
}

// ─────────────────────────────────────────────────────────────────────────────
// SDF: rounded rectangle (full image)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signed distance to a rounded rectangle centred at (cx, cy).
 * Positive = inside the shape.
 */
function sdRoundRect(
	px: number,
	py: number,
	cx: number,
	cy: number,
	radius: number,
): number {
	const r = Math.min(radius, cx, cy);
	const ax = Math.abs(px - cx);
	const ay = Math.abs(py - cy);
	if (ax > cx - r && ay > cy - r) {
		return r - Math.sqrt((ax - (cx - r)) ** 2 + (ay - (cy - r)) ** 2);
	}
	return Math.min(cx - ax, cy - ay);
}

// ─────────────────────────────────────────────────────────────────────────────
// Lens height profile
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Smooth cosine bell: 0 at the edge (t=0), `depth` at the centre (t=1).
 * Zero slope at both ends so displacement tapers cleanly.
 */
function bellProfile(t: number, depth: number): number {
	return depth * 0.5 * (1 - Math.cos(Math.PI * t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Displacement map
// ─────────────────────────────────────────────────────────────────────────────

interface DisplacementResult {
	imageData: ImageData;
	/** Maximum raw displacement magnitude — used to set feDisplacementMap scale */
	maxDisplacement: number;
}

/**
 * Builds an RGBA displacement map for a convex rounded-rectangle lens.
 *
 *   R channel → horizontal displacement (128 = no shift)
 *   G channel → vertical   displacement (128 = no shift)
 *   B channel → 128 (unused)
 *   A channel → 255
 *
 * Only the top-left quadrant is computed; the result is mirrored into
 * the remaining three quadrants with appropriate sign flips (Safari perf fix).
 */
function buildDisplacementMap(
	w: number,
	h: number,
	radius: number,
	depth: number,
): DisplacementResult {
	const n = w * h;
	const rawDx = new Float32Array(n);
	const rawDy = new Float32Array(n);
	const cx = w / 2;
	const cy = h / 2;
	const halfMin = Math.min(cx, cy);

	let maxD = 0;

	// We iterate over the top-left quadrant: x ∈ [0, ceil(cx)), y ∈ [0, ceil(cy))
	const qw = Math.ceil(cx);
	const qh = Math.ceil(cy);
	const eps = 1.0; // finite-difference step in pixels

	// Helper: normalised bell height at pixel (px, py)
	const H = (px: number, py: number) =>
		bellProfile(
			Math.min(Math.max(sdRoundRect(px, py, cx, cy, radius), 0) / halfMin, 1),
			depth,
		);

	for (let qy = 0; qy < qh; qy++) {
		for (let qx = 0; qx < qw; qx++) {
			const sd = sdRoundRect(qx + 0.5, qy + 0.5, cx, cy, radius);
			if (sd <= 0) continue; // outside lens → displacement stays 0

			// Gradient of the height field via central differences
			const hR = H(qx + 0.5 + eps, qy + 0.5);
			const hL = H(qx + 0.5 - eps, qy + 0.5);
			const hD = H(qx + 0.5, qy + 0.5 + eps);
			const hU = H(qx + 0.5, qy + 0.5 - eps);

			const dx = (hR - hL) / (2 * eps);
			const dy = (hD - hU) / (2 * eps);

			const mag = Math.sqrt(dx * dx + dy * dy);
			if (mag > maxD) maxD = mag;

			// Mirror into all four quadrants
			// (qx, qy)         → top-left  pixel: (qx,       qy      ), sign: (+dx, +dy)
			// (w-1-qx, qy)     → top-right pixel: (w-1-qx,   qy      ), sign: (-dx, +dy)
			// (qx, h-1-qy)     → bot-left  pixel: (qx,       h-1-qy  ), sign: (+dx, -dy)
			// (w-1-qx, h-1-qy) → bot-right pixel: (w-1-qx,   h-1-qy  ), sign: (-dx, -dy)
			const mirrors: [number, number, number, number][] = [
				[qx, qy, dx, dy],
				[w - 1 - qx, qy, -dx, dy],
				[qx, h - 1 - qy, dx, -dy],
				[w - 1 - qx, h - 1 - qy, -dx, -dy],
			];
			for (const [mx, my, fdx, fdy] of mirrors) {
				if (mx >= 0 && mx < w && my >= 0 && my < h) {
					const i = my * w + mx;
					rawDx[i] = fdx;
					rawDy[i] = fdy;
				}
			}
		}
	}

	// Encode into 8-bit RGBA (128 = neutral displacement)
	const data = new Uint8ClampedArray(n * 4);
	const norm = maxD > 0 ? 127 / maxD : 1;
	for (let i = 0; i < n; i++) {
		data[i * 4 + 0] = Math.min(
			255,
			Math.max(0, Math.round(128 + rawDx[i] * norm)),
		);
		data[i * 4 + 1] = Math.min(
			255,
			Math.max(0, Math.round(128 + rawDy[i] * norm)),
		);
		data[i * 4 + 2] = 128;
		data[i * 4 + 3] = 255;
	}

	return { imageData: new ImageData(data, w, h), maxDisplacement: maxD };
}

// ─────────────────────────────────────────────────────────────────────────────
// Specular / rim highlight map
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a white RGBA highlight image for a convex rounded-rect lens.
 * Restricted to the lens bounds (Safari specular perf fix: full filter-region
 * cost is avoidable because Safari doesn't produce the sub-pixel flicker
 * that requires Chromium's full-region approach).
 */
function buildSpecularMap(
	w: number,
	h: number,
	radius: number,
	opacity: number,
	angleDeg: number,
): ImageData {
	const data = new Uint8ClampedArray(w * h * 4);
	const cx = w / 2;
	const cy = h / 2;
	const rad = (angleDeg * Math.PI) / 180;
	const lx = Math.cos(rad);
	const ly = -Math.sin(rad); // flip Y for SVG

	for (let py = 0; py < h; py++) {
		for (let px = 0; px < w; px++) {
			const sd = sdRoundRect(px + 0.5, py + 0.5, cx, cy, radius);
			if (sd <= 0) continue;

			const normEdge = Math.min(sd / Math.min(cx, cy), 1);

			// Dome surface normal
			const nx = (px + 0.5 - cx) / cx;
			const ny = (py + 0.5 - cy) / cy;
			const nz = Math.sqrt(Math.max(0, 1 - nx * nx * 0.6 - ny * ny * 0.6));
			const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);

			// Specular lobe
			const dot = Math.max(0, (nx * lx + ny * ly + nz * 0.5) / nLen);
			const specular = dot ** 10 * 0.9;

			// Soft rim / edge glow
			const rim = (1 - normEdge) ** 2.5 * 0.45;

			const alpha = Math.min(1, specular + rim) * opacity;
			const i = (py * w + px) * 4;
			data[i + 0] = 255;
			data[i + 1] = 255;
			data[i + 2] = 255;
			data[i + 3] = Math.round(alpha * 255);
		}
	}

	return new ImageData(data, w, h);
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas → data URL
// ─────────────────────────────────────────────────────────────────────────────

function toDataURL(imageData: ImageData): string {
	const canvas = document.createElement("canvas");
	canvas.width = imageData.width;
	canvas.height = imageData.height;
	const ctx = canvas.getContext("2d")!;
	ctx.putImageData(imageData, 0, 0);
	return canvas.toDataURL("image/png");
}

// ─────────────────────────────────────────────────────────────────────────────
// Unique filter ID (Safari cache busting)
// ─────────────────────────────────────────────────────────────────────────────

let _counter = 0;
const freshId = () => `gf-${++_counter}-${Date.now()}`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function FilterGlassSurface(rawProps: GlassProps) {
	const props = mergeProps(
		{
			radius: 16,
			blur: 6,
			refractionScale: 14,
			depth: 10,
			chromaAmount: 0.18,
			specularOpacity: 0.4,
			specularAngle: 135,
		} satisfies Partial<GlassProps>,
		rawProps,
	);

	const [filterId, setFilterId] = createSignal(freshId());
	const [dispUrl, setDispUrl] = createSignal("");
	const [specUrl, setSpecUrl] = createSignal("");
	const [scale, setScale] = createSignal(1);
	const [scaleR, setScaleR] = createSignal(1); // chroma red
	const [scaleB, setScaleB] = createSignal(1); // chroma blue

	// Regenerate maps whenever any geometry prop changes
	createEffect(() => {
		const w = Math.max(2, Math.round(props.width));
		const h = Math.max(2, Math.round(props.height));
		const r = props.radius!;
		const depth = props.depth!;
		const refScale = props.refractionScale!;
		const chroma = props.chromaAmount!;
		const specOp = props.specularOpacity!;
		const specAngle = props.specularAngle!;

		const { imageData: dispData, maxDisplacement } = buildDisplacementMap(
			w,
			h,
			r,
			depth,
		);
		const specData = buildSpecularMap(w, h, r, specOp, specAngle);

		const baseScale = maxDisplacement * refScale;

		// Assign a brand-new ID so Safari doesn't serve its cached filter output
		setFilterId(freshId());
		setDispUrl(toDataURL(dispData));
		setSpecUrl(toDataURL(specData));
		setScale(baseScale);
		setScaleR(baseScale * (1 + chroma));
		setScaleB(baseScale * (1 - chroma));
	});

	onCleanup(() => {
		/* nothing persistent */
	});

	const useChroma = () => props.chromaAmount! > 0;

	return (
		<div
			class={props.class}
			style={{
				position: "relative",
				display: "inline-block",
				width: `${props.width}px`,
				height: `${props.height}px`,
				...(props.style ?? {}),
			}}
		>
			{/*
        Hidden SVG — holds the filter definition.

        We deliberately do NOT put this filter on a backdrop-filter.
        backdrop-filter with an SVG filter is Chromium-only and broken in
        Safari & Firefox. Instead the filter lives on the content itself,
        bending its own rendered pixels. This is what makes it cross-browser.

        filterUnits="userSpaceOnUse" lets us use px widths/heights directly.
      */}
			<svg
				aria-hidden="true"
				style={{ display: "none" }}
				// color-interpolation-filters="sRGB" is set as a prop below; this
				// attribute ensures colour accuracy through the filter chain.
			>
				<defs>
					<filter
						id={filterId()}
						x="0"
						y="0"
						width={props.width}
						height={props.height}
						filterUnits="userSpaceOnUse"
						color-interpolation-filters="sRGB"
					>
						{/* ── Step 1: Gaussian blur ──────────────────────────────────── */}
						<feGaussianBlur
							in="SourceGraphic"
							stdDeviation={props.blur}
							result="blurred"
						/>

						{/* ── Step 2: Load displacement map texture ─────────────────── */}
						<feImage
							href={dispUrl()}
							x="0"
							y="0"
							width={props.width}
							height={props.height}
							preserveAspectRatio="none"
							result="disp_map"
						/>

						{/* ── Step 3a: Chromatic aberration — red channel displaced more */}
						{useChroma() && (
							<feDisplacementMap
								in="blurred"
								in2="disp_map"
								scale={scaleR()}
								xChannelSelector="R"
								yChannelSelector="G"
								result="disp_r"
							/>
						)}

						{/* ── Step 3b: Main (green channel) displacement ─────────────── */}
						<feDisplacementMap
							in="blurred"
							in2="disp_map"
							scale={scale()}
							xChannelSelector="R"
							yChannelSelector="G"
							result="disp_g"
						/>

						{/* ── Step 3c: Chromatic aberration — blue channel displaced less */}
						{useChroma() && (
							<feDisplacementMap
								in="blurred"
								in2="disp_map"
								scale={scaleB()}
								xChannelSelector="R"
								yChannelSelector="G"
								result="disp_b"
							/>
						)}

						{/*
              ── Step 4: Merge RGB channels for chromatic aberration ────────
              We isolate each channel from its displaced version then add them.
              R from disp_r, G from disp_g, B from disp_b.
            */}
						{useChroma() ? (
							<>
								{/* Extract R from disp_r */}
								<feColorMatrix
									in="disp_r"
									type="matrix"
									values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
									result="only_r"
								/>
								{/* Extract G from disp_g */}
								<feColorMatrix
									in="disp_g"
									type="matrix"
									values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
									result="only_g"
								/>
								{/* Extract B from disp_b */}
								<feColorMatrix
									in="disp_b"
									type="matrix"
									values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
									result="only_b"
								/>
								{/* Combine R+G */}
								<feBlend in="only_r" in2="only_g" mode="screen" result="rg" />
								{/* Combine RG+B → final displaced */}
								<feBlend
									in="rg"
									in2="only_b"
									mode="screen"
									result="displaced"
								/>
							</>
						) : (
							/* No chroma: alias disp_g to "displaced" via a no-op matrix */
							<feColorMatrix
								in="disp_g"
								type="matrix"
								values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"
								result="displaced"
							/>
						)}

						{/* ── Step 5: Load specular highlight texture ────────────────── */}
						<feImage
							href={specUrl()}
							x="0"
							y="0"
							width={props.width}
							height={props.height}
							preserveAspectRatio="none"
							result="specular"
						/>

						{/* ── Step 6: Composite specular over displaced content ────────── */}
						<feComposite
							in="specular"
							in2="displaced"
							operator="over"
							result="with_specular"
						/>

						{/*
              ── Step 7: Clip to lens shape ─────────────────────────────────
              feComposite "in" operator masks the output to the opaque region
              of SourceGraphic, which is the original children content bounded
              by the element's own shape. Combined with border-radius on the
              wrapper, this keeps the glass within its rounded bounds.
            */}
						<feComposite in="with_specular" in2="SourceGraphic" operator="in" />
					</filter>
				</defs>
			</svg>

			{/*
        The inner div is the thing that gets filtered.
        CSS `filter: url(#id)` applies the SVG filter to the element's own
        painted pixels — cross-browser, no backdrop tricks needed.
      */}
			<div
				style={{
					width: "100%",
					height: "100%",
					filter: `url(#${filterId()})`,
					"border-radius": `${props.radius}px`,
					overflow: "hidden",
					// Ensure the element is composited on its own layer so the filter
					// has a clean source to work with (also helps Tauri's WebView).
					"will-change": "filter",
					isolation: "isolate",
				}}
			>
				{props.children}
			</div>
		</div>
	);
}
