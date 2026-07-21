import { createSpring } from "@solid-primitives/spring";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onMount, Show } from "solid-js";
import startupAudio from "../../assets/floating-in-the-air-adi-goldstein.mp3";
import { AnimatedLogo } from "./AnimatedLogo";
import SkyBackground from "./SkyBackground";
import { SplitText } from "./SplitText";

// ---------------------------------------------------------------------------
// Sky "burst" on page change: drift + dissipation spring up briefly (sign
// flips for back vs. forward so the clouds visibly reverse direction).
// Three fps tiers: normal rest (main page), a different rest once you've
// left the main page, and a transition fps used only while the burst is
// actively in flight. Cloud coverage steps down (no spring - it's not a
// continuous-motion value) once we leave the main page, and a soft black
// overlay fades in over the sky at the same time to recede it further
// behind the foreground content.
// ---------------------------------------------------------------------------
const MAIN_PAGE_DRIFT_SPEED = 0.4;
const MAIN_PAGE_DISSIPATION_SPEED = 1.0;
const MAIN_PAGE_FPS = 0;

const OTHER_PAGE_FPS = 16;

const BURST_DRIFT_SPEED = 25.8;
const BURST_DISSIPATION_SPEED = 10.65;
const BURST_FPS = 0; // unlimited

const MAIN_PAGE_CLOUD_COVERAGE = 0.7;
const OTHER_PAGE_CLOUD_COVERAGE = 0.3;
const OTHER_PAGE_OVERLAY_OPACITY = 0.15;

const TRANSITION_DURATION_MS = 600;
// Hold the burst speed for the transition duration, then spring back down.
const BURST_HOLD_MS = TRANSITION_DURATION_MS;
// How long after starting the spring-back to wait before dropping fps to
// its resting tier - gives the spring time to actually settle so the tail
// of the motion isn't rendered choppy right as it slows to a stop.
const SPRING_SETTLE_MS = 400;
const SPRING_OPTIONS = { stiffness: 0.05, damping: 0.7 };

export default function Onboarding() {
	const audio = new Audio(startupAudio);

	onMount(() => {
		audio.play();
		audio.volume = 0.6;
		audio.preload = "auto";
		audio.loop = false;
	});

	// 0 = main page, 1 = next page. Not building out real page content here -
	// just enough state to drive the sky's burst, fps tier, coverage, and
	// overlay.
	const [page, setPage] = createSignal(0);
	const onMainPage = () => page() === 0;

	const [driftSpeed, setDriftSpeed] = createSpring(
		MAIN_PAGE_DRIFT_SPEED,
		SPRING_OPTIONS,
	);
	const [dissipationSpeed, setDissipationSpeed] = createSpring(
		MAIN_PAGE_DISSIPATION_SPEED,
		SPRING_OPTIONS,
	);
	const [fpsCap, setFpsCap] = createSignal(MAIN_PAGE_FPS);

	let settleTimeout: ReturnType<typeof setTimeout> | undefined;

	function burst(
		direction: 1 | -1,
		restFps: number,
		restDrift: number,
		restDissipation: number,
	) {
		if (settleTimeout) clearTimeout(settleTimeout);

		setFpsCap(BURST_FPS);
		setDriftSpeed(BURST_DRIFT_SPEED * direction);
		setDissipationSpeed(BURST_DISSIPATION_SPEED * direction);

		settleTimeout = setTimeout(() => {
			setDriftSpeed(restDrift);
			setDissipationSpeed(restDissipation);
			settleTimeout = setTimeout(() => setFpsCap(restFps), SPRING_SETTLE_MS);
		}, BURST_HOLD_MS);
	}

	function goNext() {
		// Moving off the main page: rest settles at the "other page" tier.
		burst(
			1,
			OTHER_PAGE_FPS,
			MAIN_PAGE_DRIFT_SPEED,
			MAIN_PAGE_DISSIPATION_SPEED,
		);
		setPage((p) => p + 1);
	}

	function goBack() {
		if (onMainPage()) return;
		const next = page() - 1;
		// Landing back on the main page: rest settles at the main tier;
		// otherwise it stays at the "other page" tier.
		const restFps = next === 0 ? MAIN_PAGE_FPS : OTHER_PAGE_FPS;
		burst(-1, restFps, MAIN_PAGE_DRIFT_SPEED, MAIN_PAGE_DISSIPATION_SPEED);
		setPage(next);
	}

	const cloudCoverage = () =>
		onMainPage() ? MAIN_PAGE_CLOUD_COVERAGE : OTHER_PAGE_CLOUD_COVERAGE;

	return (
		<div
			data-tauri-drag-region="deep"
			class="relative size-full"
			style={{
				"font-family": "Geist Sans",
			}}
		>
			{/* sky: fixed background layer, z-index 0 */}
			<div class="fixed inset-0 z-0">
				<SkyBackground
					hourOverride={1}
					driftSpeed={driftSpeed()}
					dissipationSpeed={dissipationSpeed()}
					fpsCap={fpsCap()}
					cloudCoverage={cloudCoverage()}
				/>
			</div>

			{/* dims the sky further once we're off the main page, sits between
			    the sky and all foreground content */}
			<div
				class="fixed inset-0 z-10 bg-black transition-opacity duration-500 ease-out"
				style={{
					opacity: onMainPage() ? 0 : OTHER_PAGE_OVERLAY_OPACITY,
					"pointer-events": "none",
				}}
			/>

			{/* foreground content, above sky + overlay */}
			<div class="relative z-20 size-full">
				<OnboardingHeader onBack={goBack} showBack={!onMainPage()} />

				<div class="w-full mt-60 flex flex-col gap-3 items-center justify-center">
					<AnimatedLogo class="" />
					<SplitText
						class="text-4xl font-light pt-2"
						tag="h1"
						text="Welcome to Cap"
					/>

					<button
						class="mt-35 apple-glass-clear inline-flex items-baselinen justify-center p-2 px-4 gap-4 rounded-full text-lg *:apple-vibrancy-label"
						onClick={goNext}
					>
						<span>Continue</span>
						<IconMynauiArrowLongRight class="size-6.5 mt-px" />
					</button>

					<Show when={!onMainPage()}>
						<button
							class="mt-4 inline-flex items-center justify-center gap-2 text-sm text-white/60 hover:text-white/90 transition duration-200 ease-in-out"
							onClick={goBack}
						>
							<IconMynauiArrowLongLeft class="size-4" />
							<span>Previous</span>
						</button>
					</Show>
				</div>
			</div>
		</div>
	);
}

function OnboardingHeader(props: { onBack: () => void; showBack: boolean }) {
	return (
		<div class="fixed top-0 left-0 z-50 w-full h-13 flex items-center p-4.5">
			<button
				class="fixed top-5 left-5 group size-3.5 rounded-full inline-flex items-center justify-center before:content[''] before:absolute hover:before:bg-white/80 before:backdropbackdrop-brightness-40 active:scale-110 before:size-7 before:rounded-full before:bg-white/5 transition duration-200 ease-in-out"
				onClick={() => void getCurrentWindow().close()}
			>
				<IconLucideX class="size-4 apple-vibrancy-fill group-hover:text-black" />
			</button>

			<Show when={props.showBack}>
				<button
					class="fixed top-5 left-14 group size-7 rounded-full inline-flex items-center justify-center hover:bg-white/10 active:scale-110 transition duration-200 ease-in-out"
					onClick={props.onBack}
				>
					<IconMynauiArrowLongLeft class="size-4 apple-vibrancy-fill" />
				</button>
			</Show>
		</div>
	);
}
