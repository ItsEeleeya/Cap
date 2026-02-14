import { motion } from "motion-solid";
import {
	batch,
	children,
	createEffect,
	createSignal,
	type JSX,
	onMount,
	splitProps,
} from "solid-js";

interface SolariumTabsProps extends JSX.HTMLAttributes<HTMLDivElement> {
	value: string;
	onValueChange: (value: string) => void;
	onSnap?: () => void;
}

interface SolariumTabProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
	value: string;
}

export function SolariumTabs(props: SolariumTabsProps) {
	const [local, rest] = splitProps(props, [
		"value",
		"onValueChange",
		"children",
		"onSnap",
		"class",
	]);

	let containerRef: HTMLDivElement | undefined;

	const [isDragging, setIsDragging] = createSignal(false);
	const [animatedX, setAnimatedX] = createSignal(0);
	const [animatedWidth, setAnimatedWidth] = createSignal(0);
	const [lastSnapValue, setLastSnapValue] = createSignal(local.value);

	const resolvedChildren = children(() => local.children);

	// Get all tab buttons
	function getTabElements() {
		if (!containerRef) return [];
		return Array.from(
			containerRef.querySelectorAll<HTMLButtonElement>("[data-tab-value]"),
		);
	}

	// Get position info for a specific tab
	function getTabLayout(value: string) {
		const tabs = getTabElements();
		const tab = tabs.find((t) => t.getAttribute("data-tab-value") === value);
		if (!tab || !containerRef) return null;

		const containerRect = containerRef.getBoundingClientRect();
		const tabRect = tab.getBoundingClientRect();

		return {
			x: tabRect.left - containerRect.left,
			width: tabRect.width,
			centerX: tabRect.left - containerRect.left + tabRect.width / 2,
		};
	}

	// Find which tab the highlight center is over
	function getTabAtPosition(centerX: number): string | null {
		const tabs = getTabElements();
		let closestTab = tabs[0];
		let minDistance = Infinity;

		for (const tab of tabs) {
			const layout = getTabLayout(tab.getAttribute("data-tab-value")!);
			if (!layout) continue;

			const distance = Math.abs(centerX - layout.centerX);
			if (distance < minDistance) {
				minDistance = distance;
				closestTab = tab;
			}
		}

		return closestTab?.getAttribute("data-tab-value") || null;
	}

	// Update highlight position to match active tab
	function updateHighlightPosition() {
		const layout = getTabLayout(local.value);
		console.log(`layout: ${JSON.stringify(layout)}`);
		if (layout) {
			batch(() => {
				setAnimatedX(layout.x);
				setAnimatedWidth(layout.width);
			});
		}
	}

	// Update pointer events on tabs - disable on active tab so highlight can be clicked
	function updateTabPointerEvents() {
		const tabs = getTabElements();
		for (const tab of tabs) {
			const value = tab.getAttribute("data-tab-value");
			if (value === local.value) {
				tab.style.pointerEvents = "none";
			} else {
				tab.style.pointerEvents = "auto";
			}
		}
	}

	// Watch for value changes
	createEffect(() => {
		local.value; // Track dependency
		updateHighlightPosition();
		updateTabPointerEvents();
	});

	// Initial layout
	onMount(() => {
		updateHighlightPosition();
		updateTabPointerEvents();
	});

	// Handle drag motion
	function handleDrag(_event: any, info: { offset: { x: number } }) {
		const highlightCenterX = animatedX() + animatedWidth() / 2 + info.offset.x;

		// Detect which tab we're over
		const tabAtCenter = getTabAtPosition(highlightCenterX);
		if (tabAtCenter && tabAtCenter !== lastSnapValue()) {
			setLastSnapValue(tabAtCenter);
			local.onSnap?.();
		}
	}

	// Handle drag end - snap to nearest tab ALWAYS
	function handleDragEnd(_event: any, info: { offset: { x: number } }) {
		const finalCenterX = animatedX() + animatedWidth() / 2 + info.offset.x;

		const nearestTab = getTabAtPosition(finalCenterX);

		// Always snap to a tab - fallback to current value if calculation fails
		const targetTab = nearestTab || local.value;

		batch(() => {
			setIsDragging(false);
			setLastSnapValue(targetTab);
			local.onValueChange(targetTab);
			updateTabPointerEvents();
			updateHighlightPosition();
		});
	}

	// Handle tab click
	function handleTabClick(value: string) {
		if (value !== local.value) {
			// Trigger the growth animation
			setIsDragging(true);

			// Small delay to show the growth, then move and shrink
			setTimeout(() => {
				batch(() => {
					setIsDragging(false);
					setLastSnapValue(value);
					local.onValueChange(value);
				});
			}, 150);
		}
	}

	return (
		<div
			ref={containerRef}
			class={`relative isolate select-none ${local.class || ""}`}
			{...rest}
		>
			{/* Draggable highlight - z-10 normally, z-50 when dragging to appear on top */}
			<motion.div
				class={`absolute top-0 bottom-0 rounded-full cursor-grab ${isDragging()
					? "cursor-grabbing shadow-xl/25 shadow-white"
					: "bg-blue-7"
					}`}
				style={{ "pointer-events": "auto" }}
				animate={{
					x: animatedX(),
					width: animatedWidth(),
					"scale-x": isDragging() ? 1.55 : 1,
					"scale-y": isDragging() ? 1.8 : 1,
					opacity: isDragging() ? "55%" : "100%",
					"z-index": isDragging() ? "50" : "10",
				}}
				transition={{
					type: "spring",
					stiffness: 120, // Lower = slower, more fluid response
					damping: 15, // Lower = more bounce, less friction
					mass: 1.4, // Higher = more weight/inertia (liquid feel)
				}}
				drag="x"
				dragElastic={0.05} // Slightly more elastic for gooey feel
				dragMomentum={false}
				dragConstraints={{
					left: 0,
					right: (containerRef?.offsetWidth || 0) - animatedWidth(),
				}}
				onDragStart={() => {
					setIsDragging(true);
				}}
				onDrag={handleDrag}
				onDragEnd={handleDragEnd}
			>
				<div class="size-full apple-glass-clear rounded-full" />
			</motion.div>

			{/* Triggers layer - pointer-events-none on container, re-enabled on individual triggers */}
			<div
				class="relative z-30 flex w-full h-full pointer-events-none"
				onClick={(e) => {
					// Handle clicks on triggers
					const target = (e.target as HTMLElement).closest("[data-tab-value]");
					if (target) {
						const value = target.getAttribute("data-tab-value");
						if (value) {
							handleTabClick(value);
						}
					}
				}}
			>
				{resolvedChildren()}
			</div>
		</div>
	);
}

export function SolariumTab(props: SolariumTabProps) {
	const [local, rest] = splitProps(props, ["children", "value", "class"]);
	return (
		<button
			type="button"
			data-tab-value={local.value}
			class={`relative flex-1 select-none outline-none flex items-center justify-center pointer-events-auto ${local.class}`}
			{...rest}
		>
			{local.children}
		</button>
	);
}
