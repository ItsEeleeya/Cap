import {
	createEffect,
	createSignal,
	type JSX,
	onCleanup,
	onMount,
	type ParentProps,
} from "solid-js";

// Utility for class merging
const cx = (...classes: (string | undefined | null | false)[]) =>
	classes.filter(Boolean).join(" ");

type Rect = {
	left: number;
	top: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

export interface SolariumTabsProps extends ParentProps {
	value: string;
	onValueChange: (value: string) => void;
	/** Called when the indicator enters a new tab's snap zone (during drag or click) */
	onSnap?: (value: string) => void;
	orientation?: "horizontal" | "vertical";
	class?: string;
}

export function SolariumTabs(props: SolariumTabsProps) {
	let containerRef: HTMLDivElement | undefined;

	// --- State ---
	const [rects, setRects] = createSignal<Record<string, Rect>>({});
	const [containerSize, setContainerSize] = createSignal({
		width: 0,
		height: 0,
	});

	const [isDragging, setIsDragging] = createSignal(false);
	const [hasMoved, setHasMoved] = createSignal(false); // Distinction between click and drag

	// Physics state
	const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });
	const [pointerStart, setPointerStart] = createSignal({ x: 0, y: 0 });
	const [initialDragValue, setInitialDragValue] = createSignal<string | null>(
		null,
	);
	const [snapCandidate, setSnapCandidate] = createSignal<string | null>(null);

	// --- Layout Measurement ---
	const measure = () => {
		if (!containerRef) return;
		const containerRect = containerRef.getBoundingClientRect();
		setContainerSize({
			width: containerRect.width,
			height: containerRect.height,
		});

		const newRects: Record<string, Rect> = {};
		const tabElements = Array.from(
			containerRef.querySelectorAll<HTMLElement>("[data-tab-value]"),
		);

		for (const el of tabElements) {
			const value = el.getAttribute("data-tab-value");
			if (value) {
				const r = el.getBoundingClientRect();
				newRects[value] = {
					width: r.width,
					height: r.height,
					left: r.left - containerRect.left,
					top: r.top - containerRect.top,
					centerX: r.left - containerRect.left + r.width / 2,
					centerY: r.top - containerRect.top + r.height / 2,
				};
			}
		}
		setRects(newRects);
	};

	onMount(() => {
		measure();
		const ro = new ResizeObserver(() => requestAnimationFrame(measure));
		if (containerRef) ro.observe(containerRef);
		window.addEventListener("resize", measure);
		onCleanup(() => {
			ro.disconnect();
			window.removeEventListener("resize", measure);
		});
	});

	// --- Attributes Update (Styling Hooks) ---
	createEffect(() => {
		const current = props.value;
		const candidate = snapCandidate() ?? current;
		const dragging = isDragging();

		if (!containerRef) return;

		const buttons = containerRef.querySelectorAll("[data-tab-value]");
		buttons.forEach((btn) => {
			const val = btn.getAttribute("data-tab-value");

			// Is this the committed selected value?
			if (val === current) btn.setAttribute("data-selected", "true");
			else btn.removeAttribute("data-selected");

			// Is this the current drag candidate (hover state)?
			if (dragging && val === candidate)
				btn.setAttribute("data-highlighted", "true");
			else btn.removeAttribute("data-highlighted");
		});
	});

	// --- Physics Helpers ---

	const applyRubberBand = (pos: number, min: number, max: number) => {
		// If inside bounds, return as is
		if (pos >= min && pos <= max) return pos;

		// Logarithmic rubber banding
		if (pos < min) {
			const dist = min - pos;
			return min - 10 * Math.log(dist + 1); // Damping factor
		}
		if (pos > max) {
			const dist = pos - max;
			return max + 10 * Math.log(dist + 1);
		}
		return pos;
	};

	const getClosestTab = (x: number, y: number): string => {
		let closestId = props.value;
		let minDist = Infinity;

		for (const [id, r] of Object.entries(rects())) {
			// Euclidean distance to centers
			const dist = Math.sqrt((x - r.centerX) ** 2 + (y - r.centerY) ** 2);
			if (dist < minDist) {
				minDist = dist;
				closestId = id;
			}
		}
		return closestId;
	};

	// --- Event Handlers ---

	const handlePointerDown = (e: PointerEvent) => {
		if (e.button !== 0) return;

		// Refresh rects just in case
		measure();

		const target = e.target as HTMLElement;
		const isTab = target.closest("[data-tab-value]");

		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

		setIsDragging(true);
		setHasMoved(false);
		setInitialDragValue(props.value);
		setSnapCandidate(props.value); // Initialize candidate
		setPointerStart({ x: e.clientX, y: e.clientY });
		setDragOffset({ x: 0, y: 0 });
	};

	const handlePointerMove = (e: PointerEvent) => {
		if (!isDragging()) return;

		const dx = e.clientX - pointerStart().x;
		const dy = e.clientY - pointerStart().y;

		// Movement threshold for "Click" vs "Drag"
		if (!hasMoved() && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
			setHasMoved(true);
		}

		// 1. Calculate raw delta
		let targetDX = dx;
		let targetDY = dy;
		if (props.orientation === "vertical") targetDX = 0;
		else targetDY = 0;

		// 2. Apply Constraints / Rubber Banding
		const startRect = rects()[initialDragValue() || props.value];
		if (startRect) {
			if (props.orientation === "vertical") {
				const currentTop = startRect.top + targetDY;
				const maxTop = containerSize().height - startRect.height;
				const constrainedTop = applyRubberBand(currentTop, 0, maxTop);
				targetDY = constrainedTop - startRect.top;
			} else {
				const currentLeft = startRect.left + targetDX;
				const maxLeft = containerSize().width - startRect.width;
				const constrainedLeft = applyRubberBand(currentLeft, 0, maxLeft);
				targetDX = constrainedLeft - startRect.left;
			}
		}

		setDragOffset({ x: targetDX, y: targetDY });

		// 3. Calculate Snap Candidate & Feedback
		if (startRect && hasMoved()) {
			const projectedCenterX = startRect.centerX + targetDX;
			const projectedCenterY = startRect.centerY + targetDY;

			const closest = getClosestTab(projectedCenterX, projectedCenterY);

			if (closest !== snapCandidate()) {
				setSnapCandidate(closest);
				props.onSnap?.(closest);
			}
		}
	};

	const handlePointerUp = (e: PointerEvent) => {
		if (!isDragging()) return;

		setIsDragging(false);
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);

		if (!hasMoved()) {
			// It was a click!
			// We need to find what we clicked on
			const target = document.elementFromPoint(e.clientX, e.clientY);
			const tabBtn = target?.closest("[data-tab-value]");
			if (tabBtn) {
				const val = tabBtn.getAttribute("data-tab-value");
				if (val && val !== props.value) {
					props.onValueChange(val);
					// props.onSnap?.(val);
				}
			}
		} else {
			// It was a drag, commit the candidate
			const finalCandidate = snapCandidate();
			if (finalCandidate && finalCandidate !== props.value) {
				props.onValueChange(finalCandidate);
			}
		}

		// Reset physics
		setDragOffset({ x: 0, y: 0 });
		setInitialDragValue(null);
		setSnapCandidate(null);
		setHasMoved(false);
	};

	// --- Styling ---

	const indicatorStyle = () => {
		const currentRect = rects()[props.value];
		if (!currentRect) return { opacity: 0 };

		const x = currentRect.left + dragOffset().x;
		const y = currentRect.top + dragOffset().y;

		return {
			width: `${currentRect.width}px`,
			height: `${currentRect.height}px`,
			transform: `translate3d(${x}px, ${y}px, 0)`,
		};
	};

	return (
		<div
			ref={containerRef}
			class={cx(
				"relative isolate flex touch-none select-none h-full rounded-full cursor-grab active:cursor-grabbing",
				props.orientation === "vertical" ? "flex-col" : "flex-row",
				props.class,
			)}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={handlePointerUp}
			onPointerCancel={handlePointerUp}
			// Data attribute to let children know dragging state via CSS if needed
			data-dragging={isDragging()}
		>
			{/* 
        INDICATOR WRAPPER
        Moves around. Contains the two visual states.
      */}
			<div
				class={cx(
					"absolute left-0 top-0 pointer-events-none will-change-transform",
					// Disable transition during drag for 1:1 feel, enable for snap
					!isDragging() &&
						"transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
				)}
				style={indicatorStyle()}
			>
				{/* 1. REST STATE: Standard background look */}
				<div
					class={cx(
						"absolute inset-0 rounded-full bg-white dark:bg-blue-10/50 transition-opacity duration-200 apple-glass z-50",
						isDragging() ? "opacity-0" : "opacity-100",
					)}
				/>

				{/* 2. DRAG STATE: "Apple Glass" Effect */}
				<div
					class={cx(
						"absolute inset-0 rounded-full transition-all duration-200 apple-glass-clear",
						// Visual logic: Scale up and fade in
						isDragging() ? "opacity-100 scale-125" : "opacity-0 scale-100",
					)}
				/>
			</div>

			{/* Tab Items */}
			{props.children}
		</div>
	);
}

// --- Child Component ---

export interface SolariumTabProps extends ParentProps {
	value: string;
	class?: string;
	disabled?: boolean;
}

export function SolariumTab(props: SolariumTabProps) {
	return (
		<button
			type="button"
			data-tab-value={props.value}
			disabled={props.disabled}
			class={cx(
				"relative z-10 outline-none transition-all duration-200 bg-transparent p-0 select-none",
				// Default colors
				"text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
				// Selected state (applied by Parent)
				"data-[selected=true]:text-black dark:data-[selected=true]:text-white",
				// Highlighted/Candidate state during drag (applied by Parent)
				"data-[highlighted=true]:text-black dark:data-[highlighted=true]:text-white data-[highlighted=true]:scale-105",
				// Dim others when dragging
				"group-data-[dragging=true]:not([data-highlighted=true]):opacity-50",

				props.disabled && "opacity-50 cursor-not-allowed",
				props.class,
			)}
		>
			{props.children}
		</button>
	);
}
