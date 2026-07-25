import { createEventListener } from "@solid-primitives/event-listener";
import { createSpring } from "@solid-primitives/spring";
import { makePersisted } from "@solid-primitives/storage";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cx } from "cva";
import {
	type Accessor,
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { createStore } from "solid-js/store";
import GlassEffectContainer from "~/components/GlassEffectContainer";
import { Scroller } from "~/components/ScrollView";
import { createForceTouch } from "~/utils/force-touch";
import { commands } from "~/utils/tauri";
import startupAudio from "../../assets/floating-in-the-air-adi-goldstein.mp3";
import { AnimatedLogo } from "./AnimatedLogo";
import { SplitText } from "./SplitText";
import SkyBackground from "./sky-background/SkyBackground";
import { FaqStep } from "./steps/FaqStep";
import {
	InstantMockup,
	MODE_DETAILS,
	ModeDetailStep,
	ModesOverviewStep,
	ScreenshotMockup,
	StudioMockup,
	ToggleStep,
} from "./steps/ModesSteps";
import { PermissionsStep } from "./steps/PermissionsStep";
import { ShortcutsStep } from "./steps/ShortcutStep";
import {
	STEP_SPRING_OPTIONS,
	StepFlowProvider,
	StepPanel,
	useStepFlow,
} from "./steps/StepFlow";

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
const MAIN_PAGE_FPS = 0; // unlimited

const MAIN_PAGE_RENDER_SCALE = 0.35;
const OTHER_PAGE_RENDER_SCALE = 0.2;

const OTHER_PAGE_FPS = 24;

const BURST_DRIFT_SPEED = 25.8;
const BURST_DISSIPATION_SPEED = 10.65;
const BURST_FPS = 0; // unlimited

const MAIN_PAGE_CLOUD_COVERAGE = 0.7;
const OTHER_PAGE_CLOUD_COVERAGE = 0.7;

const TRANSITION_DURATION_MS = 500;
// Hold the burst speed for the transition duration, then spring back down.
const BURST_HOLD_MS = TRANSITION_DURATION_MS;
// How long after starting the spring-back to wait before dropping fps to
// its resting tier - gives the spring time to actually settle so the tail
// of the motion isn't rendered choppy right as it slows to a stop.
const SPRING_SETTLE_MS = 400;
const SPRING_OPTIONS = { stiffness: 0.05, damping: 0.7 };

// Logo gesture: on platforms with Force Touch trackpads (macOS/WebKit),
// pressure continuously drives the boost amount instead of a plain
// double-click. Feature-detected rather than platform-sniffed - anywhere
// these events don't exist, dblclick is the whole story.
const FORCE_TOUCH_SUPPORTED =
	typeof window !== "undefined" && "onwebkitmouseforcewillbegin" in window;
// Fire a haptic tick every time reported force has moved this much since
// the last one we notified for.
const FORCE_HAPTIC_STEP = 0.1;
// On platforms without Force Touch, a double-click just boosts for a fixed
// window instead of tracking a press-and-hold.
const DOUBLE_CLICK_BOOST_DURATION_MS = 1200;

const ENTER_SPRING_OPTIONS = { stiffness: 0.12, damping: 0.7 };

// Total step count for the flow. Real step content lands later; for now
// step 0 is the welcome page and step 1 is a placeholder.
const TOTAL_STEPS = 9;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

export default function Onboarding() {
	async function handleFinish() {
		// TODO
		// await getCurrentWindow().close();
	}

	return (
		<StepFlowProvider total={() => TOTAL_STEPS} onFinish={handleFinish}>
			<OnboardingContent />
		</StepFlowProvider>
	);
}

function OnboardingContent() {
	const flow = useStepFlow();
	const onMainPage = () => flow.step() === 0;

	const audio = new Audio(startupAudio);
	const [audioState, setAudioState] = makePersisted(
		createSignal({ isMuted: false }),
		{ name: "audioSettings" },
	);

	onMount(() => {
		audio.volume = 0.6;
		audio.preload = "auto";
		audio.loop = false;
		audio.controls = false;

		if ("mediaSession" in navigator) {
			navigator.mediaSession.metadata = new MediaMetadata({
				title: "Welcome to Cap",
				album: "Floating in The Air",
				artist: "Adi Goldstein",
			});
		}
	});

	const [audioStateLoaded, setAudioStateLoaded] = createSignal(false);

	createEffect(() => {
		// makePersisted's signal reads as the default synchronously and is
		// overwritten once storage resolves; if your storage backend
		// exposes a ready/loaded signal, prefer that instead of this
		// microtask-based guard.
		if (!audioStateLoaded()) {
			queueMicrotask(() => setAudioStateLoaded(true));
			return;
		}
		if (audioState().isMuted) {
			audio.pause();
		} else {
			void audio.play();
		}
	});

	const [renderScale, setRenderScale] = createSignal(MAIN_PAGE_RENDER_SCALE);
	createEffect(() => {
		setRenderScale(
			onMainPage() ? MAIN_PAGE_CLOUD_COVERAGE : OTHER_PAGE_RENDER_SCALE,
		);
	});

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

	// Bursts the sky whenever the step actually changes, direction inferred
	// from whether we moved forward or backward. The rest tier it settles at
	// depends only on whether we land on the main page or not.
	let prevStep = flow.step();
	createEffect(() => {
		const current = flow.step();
		if (current === prevStep) return;
		const direction = current > prevStep ? 1 : -1;
		const restFps = current === 0 ? MAIN_PAGE_FPS : OTHER_PAGE_FPS;
		burst(
			direction,
			restFps,
			MAIN_PAGE_DRIFT_SPEED,
			MAIN_PAGE_DISSIPATION_SPEED,
		);
		prevStep = current;
	});

	// Logo boost (main page only): `t` is null when inactive, or a 0-1
	// amount when active - either the live Force Touch pressure, or a flat
	// 1 for the fixed-duration dblclick fallback. Drift/dissipation lerp
	// between main-page rest and the burst speeds by that amount, and
	// SkyBackground's own hour clock switches to "play" for as long as
	// it's active (and never switches back once engaged - see
	// SkyBackground).
	const [logoBoostT, setLogoBoostT] = createSignal<number | null>(null);
	createEffect(() => {
		const t = logoBoostT();
		if (t !== null) {
			setDriftSpeed(lerp(MAIN_PAGE_DRIFT_SPEED, BURST_DRIFT_SPEED, t));
			setDissipationSpeed(
				lerp(MAIN_PAGE_DISSIPATION_SPEED, BURST_DISSIPATION_SPEED, t),
			);
		} else if (onMainPage()) {
			setDriftSpeed(MAIN_PAGE_DRIFT_SPEED);
			setDissipationSpeed(MAIN_PAGE_DISSIPATION_SPEED);
		}
	});

	onMount(() => {
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "ArrowRight") {
				e.preventDefault();
				flow.next();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				flow.back();
			} else if (e.key === "Enter") {
				e.preventDefault();
				flow.next();
			}
		}
		window.addEventListener("keydown", onKeyDown);
		onCleanup(() => window.removeEventListener("keydown", onKeyDown));
	});

	const cloudCoverage = () =>
		onMainPage() ? MAIN_PAGE_CLOUD_COVERAGE : OTHER_PAGE_CLOUD_COVERAGE;

	const [permissionsState, setPermissionsState] = createStore({
		needed: true,
		granted: false,
		coreGranted: false,
	});

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
					play={logoBoostT() !== null}
					driftSpeed={driftSpeed()}
					dissipationSpeed={dissipationSpeed()}
					fpsCap={fpsCap()}
					cloudCoverage={cloudCoverage()}
					renderScale={renderScale()}
				/>
			</div>

			{/* dims the sky further once we're off the main page, sits between
			    the sky and all foreground content */}
			<div
				class="fixed inset-0 z-10 bg-black/60 transition-opacity duration-1000 ease-out pointer-events-none"
				style={{
					opacity: onMainPage() ? 0 : 1,
				}}
			/>

			{/* foreground content, above sky + overlay */}
			<div class="relative z-20 size-full flex flex-col">
				<div class="fixed top-0 left-0 z-50 w-full h-12.5 flex items-center p-4.5">
					<button
						class="group size-3.5 rounded-full inline-flex items-center justify-center before:content[''] before:absolute hover:before:bg-white/30 active:scale-110 will-change-transform before:size-7 before:rounded-full before:bg-white/5 transition duration-200 ease-in-out"
						type="button"
						onClick={() => void getCurrentWindow().close()}
					>
						<IconLucideX class="size-4 apple-vibrancy-fill group-hover:text-black" />
					</button>
					<div class="flex-1" />

					<button
						class="group size-3.5 rounded-full inline-flex items-center justify-center before:content[''] before:absolute hover:before:bg-white/30 active:scale-110 will-change-transform before:size-7 before:rounded-full before:bg-white/5 transition duration-200 ease-in-out"
						type="button"
						onClick={() => {
							setAudioState({ isMuted: !audioState().isMuted });
						}}
					>
						<Show
							when={audioState().isMuted}
							fallback={
								<IconLucideVolume2 class="size-6.5 *:apple-vibrancy-fill" />
							}
						>
							<IconLucideVolumeX class="size-6.5 *:apple-vibrancy-fill" />
						</Show>
					</button>
				</div>

				<Scroller.Root class="relative">
					<Scroller.Viewport
						edges={{ top: 10, bottom: 90 }}
						overscroll="contain"
						fade
					>
						<StepPanel index={0}>
							<WelcomeStep onLogoBoost={setLogoBoostT} />
						</StepPanel>
						<StepPanel index={1}>
							<PermissionsStep
								active={flow.step() === 1}
								onPermissionsChanged={(v) => setPermissionsState("granted", v)}
								onCorePermissionsChanged={(v) =>
									setPermissionsState("coreGranted", v)
								}
							/>
							<p>lorem ipsum</p>
						</StepPanel>
						<StepPanel index={2}>
							<ModesOverviewStep active={flow.step() === 2} />
						</StepPanel>
						<StepPanel index={3}>
							<ModeDetailStep mode={MODE_DETAILS[0]} active={flow.step() === 3}>
								<InstantMockup active={flow.step() === 3} />
							</ModeDetailStep>
						</StepPanel>
						<StepPanel index={4}>
							<ModeDetailStep mode={MODE_DETAILS[1]} active={flow.step() === 4}>
								<StudioMockup active={flow.step() === 4} />
							</ModeDetailStep>
						</StepPanel>
						<StepPanel index={5}>
							<ModeDetailStep mode={MODE_DETAILS[2]} active={flow.step() === 5}>
								<ScreenshotMockup active={flow.step() === 5} />
							</ModeDetailStep>
						</StepPanel>
						<StepPanel index={6}>
							<ToggleStep active={flow.step() === 6} />
						</StepPanel>
						<StepPanel index={7}>
							<ShortcutsStep active={flow.step() === 7} />
						</StepPanel>
						<StepPanel index={8}>
							<FaqStep active={flow.step() === 8} />
						</StepPanel>
					</Scroller.Viewport>

					<Scroller.Scrollbar edges={{ top: 50, bottom: 80 }} />
				</Scroller.Root>

				<BottomNav nextLabel={flow.isLast() ? "Start Using Cap" : "Continue"} />
			</div>
		</div>
	);
}

/**
 * Bottom step-navigation bar. Always mounted (rather than gated by <Show>)
 * so it can spring in/out the same way a StepPanel does - the only boundary
 * it ever crosses is main-page <-> everything-else, so it always enters
 * from / exits to the right, matching how a panel at index 1 behaves
 * relative to index 0.
 *
 * z-40 here matters: a StepPanel gets z-index:1 while active, which (being
 * a positive z-index) always paints above anything at z-index:auto/0 -
 * DOM order doesn't help. Without an explicit z-index of our own on this
 * *outer* fixed wrapper, the active panel's full-bleed hit area sits on
 * top and swallows every click meant for the nav underneath it.
 */
function BottomNav(props: { nextLabel: string }) {
	const flow = useStepFlow();
	const visible = () => flow.step() !== 0;
	const targetX = () => (visible() ? 0 : 40);

	const [x, setX] = createSpring(targetX(), STEP_SPRING_OPTIONS);
	createEffect(() => setX(targetX()));

	const [opacity, setOpacity] = createSpring(
		visible() ? 1 : 0,
		STEP_SPRING_OPTIONS,
	);
	createEffect(() => setOpacity(visible() ? 1 : 0));

	return (
		<div
			class="fixed bottom-0 left-0 z-40 w-full"
			style={{
				transform: `translateX(${x()}px)`,
				opacity: opacity(),
				visibility: opacity() > 0.01 ? "visible" : "hidden",
				"pointer-events": visible() ? "auto" : "none",
			}}
		>
			<StepNavigation nextLabel={props.nextLabel} />
		</div>
	);
}

/**
 * Spring-driven slide-up/fade/blur-in entrance style. Shared by the logo and
 * the Continue button so both animate on the same physics rather than one
 * using a spring and the other a keyframe animation.
 */
function createEnterStyle(show: Accessor<boolean>) {
	const [progress, setProgress] = createSpring(0, ENTER_SPRING_OPTIONS);
	createEffect(() => setProgress(show() ? 1 : 0));

	return () => ({
		opacity: progress(),
		transform: `translateY(${(1 - progress()) * 24}px)`,
		filter: `blur(${(1 - progress()) * 10}px)`,
	});
}

function WelcomeStep(props: { onLogoBoost: (t: number | null) => void }) {
	const flow = useStepFlow();

	const [showLogo, setShowLogo] = createSignal(false);
	const [showContinue, setShowContinue] = createSignal(false);
	onMount(() => {
		setShowLogo(true);
		const t = setTimeout(() => setShowContinue(true), 250);
		onCleanup(() => clearTimeout(t));
	});
	const logoEnterStyle = createEnterStyle(showLogo);
	const continueEnterStyle = createEnterStyle(showContinue);

	const forceTouch = createForceTouch({
		levels: [0.5, 0.8, 1.0],
		onLevelCrossed() {
			void commands.performHapticFeedback("levelChange", "drawCompleted");
		},
	});

	createEffect(() => props.onLogoBoost(forceTouch.amount()));

	// consumer owns the fallback:
	let doubleClickTimeout: ReturnType<typeof setTimeout> | undefined;
	function handleLogoDoubleClick() {
		if (forceTouch.isSupported()) return;
		if (doubleClickTimeout) clearTimeout(doubleClickTimeout);
		props.onLogoBoost(1);
		doubleClickTimeout = setTimeout(() => props.onLogoBoost(null), 1200);
	}
	onCleanup(() => doubleClickTimeout && clearTimeout(doubleClickTimeout));

	return (
		<div class="w-full mt-60 flex flex-col gap-3 items-center justify-center">
			<div
				ref={forceTouch.ref}
				onDblClick={handleLogoDoubleClick}
				style={logoEnterStyle()}
			>
				<AnimatedLogo class="" />
			</div>
			<SplitText
				class="text-4xl font-medium pt-2"
				tag="h1"
				text="Welcome to Cap"
			/>

			<div class="mt-24" style={continueEnterStyle()}>
				<ContinueButton onClick={flow.next} />
			</div>
		</div>
	);
}

function DummyStep() {
	return (
		<div class="w-full mt-24 flex flex-col gap-3 items-center justify-center text-white">
			<h2 class="text-2xl font-medium">Dummy step</h2>
			<p class="text-white/60">Real content goes here later.</p>
		</div>
	);
}

function ContinueButton(props: { class?: string; onClick: () => void }) {
	return (
		<GlassEffectContainer
			class={cx("rounded-full", props.class)}
			onClick={props.onClick}
		>
			<button
				type="button"
				class="inline-flex items-center justify-center gap-2 text-white hover:text-white/90 transition duration-200 ease-in-out rounded-[inherit] p-2 px-4"
			>
				<span>Continue</span>
				<IconMynauiArrowLongRight class="size-6.5 mt-px" />
			</button>
		</GlassEffectContainer>
	);
}

function StepNavigation(props: {
	nextLabel: string;
	nextDisabled?: boolean;
	showSkip?: boolean;
	onSkip?: () => void;
}) {
	const flow = useStepFlow();
	const dotCount = () => flow.total() - flow.minStep();
	const currentDot = () => flow.step() - flow.minStep();

	return (
		<div class="flex flex-col items-center gap-2 px-8 pb-5 pt-2 shrink-0 relative z-40">
			<div class="flex items-center justify-between w-full">
				<div class="flex-1">
					<Show when={!flow.isFirst()}>
						<button
							type="button"
							onClick={flow.back}
							class="flex items-center gap-1.5 text-[13px] text-gray-10 hover:text-gray-12 transition-colors duration-200"
						>
							<IconLucideArrowLeft class="size-3.5" />
							Back
						</button>
					</Show>
				</div>

				<div class="flex items-center gap-1">
					<For each={Array.from({ length: dotCount() })}>
						{(_, index) => (
							<div
								class={cx(
									"rounded-full transition-all duration-300",
									currentDot() === index()
										? "w-5 h-1.5 bg-gray-12"
										: currentDot() > index()
											? "w-1.5 h-1.5 bg-gray-8"
											: "w-1.5 h-1.5 bg-white/40",
								)}
							/>
						)}
					</For>
				</div>

				<div class="flex-1 flex justify-end">
					<div class="flex flex-col items-center gap-1.5">
						<button
							onClick={flow.next}
							class="gap-2 px-10 py-3 min-h-12 min-w-38 text-[15px] font-medium"
							disabled={props.nextDisabled}
						>
							{props.nextLabel}
							<Show
								when={!flow.isLast()}
								fallback={<IconLucideCheck class="size-4" />}
							>
								<IconLucideArrowRight class="size-4" />
							</Show>
						</button>
						<Show when={props.showSkip}>
							<button
								type="button"
								onClick={() => props.onSkip?.()}
								class="text-[11px] text-gray-9 hover:text-gray-11 transition-colors duration-200 py-0.5"
							>
								Skip onboarding
							</button>
						</Show>
					</div>
				</div>
			</div>
		</div>
	);
}
