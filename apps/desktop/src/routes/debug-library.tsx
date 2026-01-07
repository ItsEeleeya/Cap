import { createElementSize } from "@solid-primitives/resize-observer";
import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import {
	type Accessor,
	children,
	createMemo,
	createSignal,
	For,
	type JSX,
	onCleanup,
	onMount,
	type ParentProps,
} from "solid-js";
import IconCapRings from "~/assets/CapLogoRings.svg";
import { commands } from "~/utils/tauri";
import { createSolariumWindow } from "./debug";
import ElasticSlider from "./solarium/components/elastic-slider";
import {
	SolariumPopover,
	SolariumPopoverContent,
	SolariumPopoverTrigger,
} from "./solarium/components/SolariumPopover";
import { SolariumSlider } from "./solarium/components/solarium-slider";
import { LiquidGlassPopover } from "./solarium/elastic";

/* ---------------------------------- kinds --------------------------------- */

const ComponentKind = {
	button: "Button",
	slider: "Slider",
	switch: "Switch",
	liquid: "Liquid",
} as const;

type ComponentKindValue = (typeof ComponentKind)[keyof typeof ComponentKind];

/* ------------------------------ debug window ------------------------------- */

export function openDebugLibrary() {
	createSolariumWindow({
		label: "debug-library",
		title: "Cap Component Library",
		url: "/solarium-debug",
		hiddenTitle: true,
		minWidth: 400,
		minHeight: 300,
		titleBarStyle: "overlay",
		transparent: true,
		windowEffects: {
			effects: [Effect.UnderWindowBackground],
		},
	});
}

/* ----------------------------- main container ------------------------------ */

export default function SolariumDebugLibrary() {
	onMount(async () => {
		commands.addToolbarShell();
	});

	const [filter, setFilter] = createSignal<ComponentKindValue | "All">("All");

	const entries: ShowcaseEntry[] = [
		{
			kind: ComponentKind.button,
			name: "Buttons",
			Component: ButtonShowcase,
		},
		{
			kind: ComponentKind.slider,
			name: "Sliders",
			Component: ValueSliderShowcase,
		},
		{
			kind: ComponentKind.liquid,
			name: "Liquid Effect",
			Component: LiquidShowcase,
		},
		{
			kind: ComponentKind.switch,
			name: "Switch",
			Component: SwitchShowcase,
		},
		{
			kind: ComponentKind.slider,
			name: "Stepped Slider",
			Component: SteppedSliderShowcase,
		},
	];

	const filtered = createMemo(() =>
		filter() === "All" ? entries : entries.filter((e) => e.kind === filter()),
	);
	return (
		<ViewWithSidebar
			sidebarContent={
				<div class="flex flex-col justify-between">
					<div class="w-40 h-fit flex flex-col gap-1">
						<For each={["All", ...Object.values(ComponentKind)]}>
							{(item) => (
								<button
									class={`rounded-xl px-3 py-1 text-left font-light ${
										filter() === item
											? "bg-[-apple-system-control-accent]"
											: "opacity-70 hover:opacity-100"
									}`}
									onClick={() => setFilter(item as ComponentKindValue | "All")}
								>
									<p>{item}</p>
								</button>
							)}
						</For>
					</div>
					<div class="p-2 text-xs">Platform</div>
				</div>
			}
		>
			<div data-tauri-drag-region class="flex gap-2 p-4">
				<div
					data-tauri-drag-region
					class="flex-1 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4"
				>
					<For each={filtered()}>
						{(entry) => (
							<ShowcaseCard title={entry.name}>
								<entry.Component />
							</ShowcaseCard>
						)}
					</For>
				</div>
			</div>
		</ViewWithSidebar>
	);
}

/* ------------------------------ showcase core ------------------------------ */

type ShowcaseEntry = {
	kind: ComponentKindValue;
	name: string;
	Component: () => JSX.Element;
};

/* ------------------------------ showcase card ------------------------------ */

function ShowcaseCard(props: ParentProps<{ title: string }>) {
	return (
		<div
			data-tauri-drag-region
			class="apple-glass rounded-2xl p-4 flex flex-col gap-3"
		>
			<h3 class="text-sm font-medium opacity-80">{props.title}</h3>
			<div class="flex items-center justify-center min-h-20">
				{props.children}
			</div>
		</div>
	);
}

/* --------------------------- showcase components --------------------------- */

function ButtonShowcase() {
	return (
		<div class="flex flex-wrap items-center justify-center gap-2">
			<button class="rounded-xl px-4 py-2 bg-white/90 text-black hover:bg-white">
				Primary
			</button>
			<button class="rounded-xl px-4 py-2 bg-green-500/90 text-white hover:bg-green-500">
				Success
			</button>
			<button class="rounded-xl px-4 py-2 bg-blue-9/90 text-white hover:bg-blue-9">
				Info
			</button>
			<button class="rounded-xl px-4 py-2 bg-red-500/90 text-white hover:bg-red-500">
				Danger
			</button>
			<button class="rounded-xl px-4 py-2 bg-orange-500/90 text-white hover:bg-orange-500">
				Warning
			</button>
		</div>
	);
}

function LiquidShowcase() {
	return (
		<div class="flex gap-2">
			<SolariumPopover>
				<SolariumPopoverTrigger>
					<button class="px-5 py-3 apple-glass rounded-full hover:bg-white/10 transition-colors ease-in-out duration-200">
						More…
					</button>
				</SolariumPopoverTrigger>

				<SolariumPopoverContent>
					<div class="flex apple-glass rounded-2xl flex-col p-10">Items</div>
				</SolariumPopoverContent>
			</SolariumPopover>
		</div>
	);
}

function SwitchShowcase() {
	return <div class="flex gap-2"></div>;
}

function ValueSliderShowcase() {
	const [value, setValue] = createSignal(50);

	return (
		<div class="w-full flex flex-col gap-8 p-2">
			<SolariumSlider
				class="w-full"
				minValue={0}
				maxValue={1000}
				value={[value()]}
				onChange={setValue}
				formatTooltip={(v) => {
					return `${v}`;
				}}
			></SolariumSlider>

			<div class="w-full flex flex-col gap-2">
				<input
					type="range"
					min="0"
					max="100"
					step="1"
					// value={value()}
					// onInput={(e) => setValue(+e.currentTarget.value)}
				/>
				<span class="text-xs opacity-70">Slide</span>
			</div>
			<ElasticSlider
				// leftIcon={<img class="size-5" alt="logo" src={IconCapRings}></img>}
				class="w-44"
			></ElasticSlider>
		</div>
	);
}

function SteppedSliderShowcase() {
	const [value, setValue] = createSignal(2);

	return (
		<div class="w-full flex flex-col gap-2">
			<input
				type="range"
				min="0"
				max="4"
				step="1"
				value={value()}
				onInput={(e) => setValue(+e.currentTarget.value)}
			/>
			<span class="text-xs opacity-70">Step {value()}</span>
		</div>
	);
}

/* ----------------------------- layout wrapper ------------------------------ */

function ViewWithSidebar(
	props: ParentProps<{ class?: string; sidebarContent: JSX.Element }>,
) {
	const focused = createWindowFocus();
	const resolved = children(() => props.children);
	const resolvedContent = children(() => props.sidebarContent);
	let sidebarContainerRef: HTMLDivElement | undefined;
	const sidebarSize = createElementSize(() => sidebarContainerRef);

	return (
		<div data-tauri-drag-region class="flex flex-col size-full">
			{/*<div data-tauri-drag-region class="w-full h-12 pl-10" />*/}
			<div
				ref={sidebarContainerRef}
				data-tauri-drag-region
				class="fixed top-0 left-0 min-w-[100px] p-1.5 h-full flex items-center justify-center"
			>
				<div
					data-tauri-drag-region
					class={`flex size-full rounded-[20.8px] pt-10 p-2 ${
						focused() ? "apple-glass" : "apple-glass-subdued"
					}`}
				>
					{resolvedContent()}
				</div>
			</div>

			<div
				class="overflow-scroll overscroll-contain scrollbar-thin"
				style={{
					"padding-left": `${sidebarSize?.width ?? 25}px`,
				}}
			>
				{resolved()}
			</div>
		</div>
	);
}

/* ------------------------------ window focus ------------------------------- */

function createWindowFocus(): Accessor<boolean> {
	const [focused, setFocused] = createSignal(true);

	onMount(async () => {
		const unlisten = await getCurrentWindow().onFocusChanged((e) =>
			setFocused(e.payload),
		);
		onCleanup(unlisten);
	});

	return focused;
}
