import {
	type Component,
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
} from "solid-js";
import { type SpringPreset, springStep, springs } from "~/utils/springs";

export interface FlexiSegmentedControlProps {
	options: string[];
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
	class?: string;
	/**
	 * How far the thumb is allowed to "tug" past its constraints while
	 * dragging, as a fraction of movement allowed (0 = hard stop, 1 = no
	 * resistance at all). Mirrors Motion's `dragElastic`. Default 0.15
	 * (mostly rigid, with a small give).
	 */
	dragElastic?: number;
}

// Thumb-position springs. "select" is used for click-to-select (snappier),
// "drag" is used when a drag gesture ends and the thumb snaps back from an
// elastic overshoot or to the chosen segment.
const THUMB_SPRINGS: Record<"select" | "drag", SpringPreset> = {
	select: springs.snappy,
	drag: springs.default,
};

const TRACK_PADDING = 3; // px, matches the `padding: 3px` on the track
const DEFAULT_DRAG_ELASTIC = 0.15;

/**
 * Resolves a raw (unclamped) position against [min, max] with elastic
 * resistance past the edges, the same shape as Motion's dragElastic:
 * past a boundary, only `elastic` fraction of the overshoot is applied.
 */
function applyElastic(raw: number, min: number, max: number, elastic: number) {
	if (raw < min) return min - (min - raw) * elastic;
	if (raw > max) return max + (raw - max) * elastic;
	return raw;
}

export const FlexiSegmentedControl: Component<FlexiSegmentedControlProps> = (
	props,
) => {
	const [selected, setSelected] = createSignal(
		props.value ?? props.defaultValue ?? props.options[0],
	);

	const segRefs: HTMLButtonElement[] = [];
	let trackRef!: HTMLDivElement;

	// ── Thumb geometry (left/width), spring-driven ───────────────────────────
	// The thumb itself has no visible background — it only supplies the
	// rect that the active-label layer is clipped to, and is the drag
	// hit-target.
	const [thumbLeft, setThumbLeft] = createSignal(0);
	const [thumbWidth, setThumbWidth] = createSignal(0);

	let thumbLeftPos = 0;
	let thumbLeftVel = 0;
	let thumbRaf = 0;

	const [isDragging, setIsDragging] = createSignal(false);

	let dragStartX = 0;
	let dragStartLeft = 0;
	let dragPointerId = -1;

	// ── Helpers ───────────────────────────────────────────────────────────────
	function measureIdx(idx: number) {
		const seg = segRefs[idx];
		if (!seg || !trackRef) return null;
		const tr = trackRef.getBoundingClientRect();
		const sr = seg.getBoundingClientRect();
		return { left: sr.left - tr.left, width: sr.width };
	}

	function trackRange() {
		// Draggable range for thumbLeft, in the track's padding-box-relative
		// coordinate space (absolutely positioned children are offset from
		// the padding edge, so left:0 already sits inside the padding —
		// only the far-side padding needs subtracting).
		const total = trackRef?.offsetWidth ?? 0;
		return Math.max(0, total - TRACK_PADDING * 2);
	}

	function nearestIdx(centerX: number) {
		let best = 0;
		let bestDist = Infinity;
		for (let i = 0; i < props.options.length; i++) {
			const m = measureIdx(i);
			if (!m) continue;
			const dist = Math.abs(m.left + m.width / 2 - centerX);
			if (dist < bestDist) {
				bestDist = dist;
				best = i;
			}
		}
		return best;
	}

	// ── Thumb spring loop ─────────────────────────────────────────────────────
	function stopThumbLoop() {
		if (thumbRaf) cancelAnimationFrame(thumbRaf);
		thumbRaf = 0;
	}

	function animateThumbTo(targetLeft: number, preset: SpringPreset) {
		stopThumbLoop();
		let last = performance.now();
		function tick(now: number) {
			const dt = Math.min((now - last) / 1000, 0.064);
			last = now;
			[thumbLeftPos, thumbLeftVel] = springStep(
				thumbLeftPos,
				thumbLeftVel,
				targetLeft,
				dt,
				preset.k,
				preset.d,
			);
			setThumbLeft(thumbLeftPos);
			const done =
				Math.abs(thumbLeftPos - targetLeft) < 0.05 &&
				Math.abs(thumbLeftVel) < 0.05;
			if (done) {
				thumbLeftPos = targetLeft;
				thumbLeftVel = 0;
				setThumbLeft(targetLeft);
				thumbRaf = 0;
			} else {
				thumbRaf = requestAnimationFrame(tick);
			}
		}
		thumbRaf = requestAnimationFrame(tick);
	}

	function snapToIdx(idx: number, preset: SpringPreset | null) {
		const m = measureIdx(idx);
		if (!m) return;
		setThumbWidth(m.width);
		if (preset) {
			animateThumbTo(m.left, preset);
		} else {
			stopThumbLoop();
			thumbLeftPos = m.left;
			thumbLeftVel = 0;
			setThumbLeft(m.left);
		}
	}

	onCleanup(() => {
		stopThumbLoop();
	});

	// ── Drag ──────────────────────────────────────────────────────────────────
	function onPointerDown(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragPointerId = e.pointerId;
		dragStartX = e.clientX;
		dragStartLeft = thumbLeftPos;
		setIsDragging(true);
		stopThumbLoop();
	}

	function onPointerMove(e: PointerEvent) {
		if (!isDragging() || e.pointerId !== dragPointerId) return;
		const range = trackRange();
		const min = 0;
		const max = range - thumbWidth();
		const elastic = props.dragElastic ?? DEFAULT_DRAG_ELASTIC;

		const dx = e.clientX - dragStartX;
		const raw = dragStartLeft + dx;
		const resolved = applyElastic(raw, min, max, elastic);

		thumbLeftPos = resolved;
		thumbLeftVel = 0;
		setThumbLeft(resolved);
	}

	function onPointerUp(e: PointerEvent) {
		if (!isDragging() || e.pointerId !== dragPointerId) return;
		setIsDragging(false);
		dragPointerId = -1;

		// nearestIdx is based on where the thumb settles, which should be
		// the *constrained* center (not the elastic-overshot one) so an
		// overscroll at either edge still resolves to the first/last
		// segment rather than nothing.
		const range = trackRange();
		const settledLeft = Math.max(
			0,
			Math.min(thumbLeftPos, range - thumbWidth()),
		);
		const idx = nearestIdx(settledLeft + thumbWidth() / 2);
		snapToIdx(idx, THUMB_SPRINGS.drag);
		const opt = props.options[idx];
		if (opt !== selected()) {
			setSelected(opt);
			props.onChange?.(opt);
		}
	}

	// ── Selection click (clicking a label directly) ──────────────────────────
	function select(opt: string) {
		if (opt === selected()) return;
		setSelected(opt);
		props.onChange?.(opt);
	}

	let mounted = false;
	onMount(() => {
		snapToIdx(props.options.indexOf(selected()), null);
		mounted = true;
	});

	createEffect(() => {
		const idx = props.options.indexOf(selected());
		if (!mounted) return;
		// Programmatic / click selection: snappier spring than drag-release.
		snapToIdx(idx, THUMB_SPRINGS.select);
	});

	createEffect(() => {
		if (props.value != null && props.value !== selected())
			setSelected(props.value);
	});

	function onKeyDown(e: KeyboardEvent, opt: string) {
		const i = props.options.indexOf(opt);
		if (e.key === "ArrowRight" || e.key === "ArrowDown") {
			e.preventDefault();
			const next = props.options[Math.min(i + 1, props.options.length - 1)];
			select(next);
			segRefs[props.options.indexOf(next)]?.focus();
		} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
			e.preventDefault();
			const prev = props.options[Math.max(i - 1, 0)];
			select(prev);
			segRefs[props.options.indexOf(prev)]?.focus();
		}
	}

	// ── Clip-path for the active-label layer ─────────────────────────────────
	// inset(top right bottom left round radius). Clips to the thumb's
	// current rect (including any elastic overshoot while dragging — the
	// mask just follows thumbLeft/thumbWidth directly, no extra bulge).
	const RADIUS = "9px";
	const clipPath = () => {
		const l = thumbLeft();
		const w = thumbWidth();
		const trackW = trackRef?.offsetWidth ?? 0;
		const right = trackW - (l + w);
		return `inset(${TRACK_PADDING}px ${right}px ${TRACK_PADDING}px ${l}px round ${RADIUS})`;
	};

	return (
		<div
			style={{
				padding: "6px",
				margin: "-6px",
				"box-sizing": "content-box" as const,
			}}
		>
			<div
				ref={trackRef!}
				class={`relative rounded-[14px] inline-flex w-fit ${props.class ?? ""}`}
				style={{
					background: "#1c1c1e",
					"box-shadow": "inset 0 1px 0 rgba(255,255,255,0.06)",
					padding: `${TRACK_PADDING}px`,
					gap: "0",
				}}
			>
				{/* ── Thumb (hit-target only, no visible background) ──────────────── */}
				<div
					class="absolute top-[3px] bottom-[3px] z-20 cursor-grab active:cursor-grabbing"
					style={{
						left: `${thumbLeft()}px`,
						width: `${thumbWidth()}px`,
					}}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
				/>

				{/* ── Base label row (dim) — always visible ───────────────────────── */}
				<For each={props.options}>
					{(opt, i) => (
						<button
							ref={(el) => {
								segRefs[i()] = el;
							}}
							role="tab"
							aria-selected={selected() === opt}
							class="relative z-10 text-sm font-medium rounded-[11px] outline-none focus-visible:ring-2 focus-visible:ring-white/30 select-none whitespace-nowrap"
							style={{
								padding: "5px 16px",
								color: "rgba(255,255,255,0.45)",
								"font-weight": "500",
							}}
							onClick={() => select(opt)}
							onKeyDown={(e) => onKeyDown(e, opt)}
						>
							{opt}
						</button>
					)}
				</For>

				{/*
          ── Active label row — clipped to the thumb rect ────────────────
          Absolutely covers the same layout as the base row. clip-path
          masks it to only show inside the thumb's current rect.
          pointer-events:none so drags/clicks pass through to the
          thumb/buttons beneath.
        */}
				<div
					aria-hidden="true"
					class="absolute inset-0 flex pointer-events-none z-30"
					style={{
						"clip-path": clipPath(),
					}}
				>
					<For each={props.options}>
						{(opt) => (
							<div
								class="flex items-center justify-center text-sm select-none whitespace-nowrap"
								style={{
									padding: "5px 16px",
									color: "#3b9eff",
									"font-weight": "600",
									"text-shadow": "0 0 12px rgba(59,158,255,0.5)",
								}}
							>
								{opt}
							</div>
						)}
					</For>
				</div>
			</div>
		</div>
	);
};
