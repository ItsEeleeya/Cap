import { createContextProvider } from "@solid-primitives/context";
import { createSpring } from "@solid-primitives/spring";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSignal,
	onCleanup,
	type ParentProps,
} from "solid-js";

type StepFlowOptions = {
	/**
	 * The onboarding version the caller is running. Panels with a
	 * `minVersion` above `lastSeenVersion` are included; panels with no
	 * `minVersion` are always included. Defaults to including everything
	 * (equivalent to lastSeenVersion = 0).
	 */
	lastSeenVersion?: Accessor<number>;
	onFinish: () => void | Promise<void>;
};

/** Spring used for step panel + step-nav enter/exit motion. */
export const STEP_SPRING_OPTIONS = { stiffness: 0.2, damping: 0.8 };

interface RegisteredPanel {
	id: number;
	order: number;
	minVersion?: number;
	excludeFromIndicator?: boolean;
}

export const [StepFlowProvider, useStepFlowContext] = createContextProvider(
	(options: StepFlowOptions) => {
		const lastSeenVersion = () => options.lastSeenVersion?.() ?? 0;

		// StepPanel instances register themselves here on mount, in render
		// order, and deregister on unmount - this list is the single source
		// of truth for "how many steps are there / which ones count".
		const [panels, setPanels] = createSignal<RegisteredPanel[]>([]);
		let nextPanelId = 0;

		function registerPanel(meta: {
			order: number;
			minVersion?: number;
			excludeFromIndicator?: boolean;
		}) {
			const id = nextPanelId++;
			setPanels((prev) =>
				[...prev, { id, ...meta }].sort((a, b) =>
					a.order !== b.order ? a.order - b.order : a.id - b.id,
				),
			);
			return id;
		}

		function unregisterPanel(id: number) {
			setPanels((prev) => prev.filter((p) => p.id !== id));
		}

		// Visible panels: unconditionally-registered ones, plus any whose
		// minVersion is newer than what this user last saw. A panel that
		// never mounts (caller wrapped it in <Show when={...}>) never
		// registers at all, so conditional steps (e.g. permissions-only-if-
		// missing) fall out naturally without StepFlow special-casing them.
		const visiblePanels = createMemo(() =>
			panels().filter(
				(p) => p.minVersion === undefined || p.minVersion > lastSeenVersion(),
			),
		);

		const total = () => visiblePanels().length;

		function indexOfPanel(id: number) {
			return visiblePanels().findIndex((p) => p.id === id);
		}

		const [step, setStep] = createSignal(0);

		function goToStep(target: number) {
			if (target < 0 || target >= total()) return;
			setStep(target);
		}

		function next() {
			if (step() < total() - 1) goToStep(step() + 1);
			else options.onFinish();
		}

		function back() {
			goToStep(step() - 1);
		}

		const isFirst = createMemo(() => step() <= 0);
		const isLast = createMemo(() => step() >= total() - 1);

		// Dots only count panels that don't opt out (e.g. the welcome page,
		// which exists for the shared enter animation, not as a "step" from
		// the user's perspective).
		const indicatorPanels = createMemo(() =>
			visiblePanels().filter((p) => !p.excludeFromIndicator),
		);
		const dotCount = () => indicatorPanels().length;
		function dotIndexForStep(currentStep: number) {
			const panel = visiblePanels()[currentStep];
			if (!panel || panel.excludeFromIndicator) return -1;
			return indicatorPanels().findIndex((p) => p.id === panel.id);
		}

		return {
			step,
			total,
			goToStep,
			next,
			back,
			isFirst,
			isLast,
			dotCount,
			dotIndexForStep,
			registerPanel,
			unregisterPanel,
			indexOfPanel,
		};
	},
);

/**
 * Throws if used outside a StepFlowProvider. StepPanel/StepNavigation and any
 * step content should always be mounted underneath the provider, so this
 * keeps call sites free of `| undefined` checks.
 */
export function useStepFlow() {
	const ctx = useStepFlowContext();
	if (!ctx)
		throw new Error("useStepFlow must be used within a StepFlowProvider");
	return ctx;
}

interface StepPanelProps extends ParentProps {
	/**
	 * Intended position among all panels, e.g. 0, 1, 2... Sorted
	 * numerically regardless of mount timing, so a panel gated behind an
	 * async condition (resolves after other panels have already mounted)
	 * still lands in the right place instead of wherever it happened to
	 * register. Ties broken by registration order.
	 */
	order: number;
	/**
	 * Gates this panel to onboarding versions newer than what the user last
	 * saw. Omit for panels that should always show (welcome, permissions-if-
	 * missing, etc). A panel wrapped in a falsy <Show> simply never mounts
	 * and never registers, so conditional-by-platform or
	 * conditional-by-missing-permission panels don't need this at all -
	 * minVersion is specifically for "new step added since version N".
	 */
	minVersion?: number;
	/**
	 * Excludes this panel from the step-navigation dot indicator, without
	 * removing it from the flow. Use for panels like "welcome" that exist
	 * for a shared entrance animation rather than as a step the user should
	 * see progress against.
	 */
	excludeFromIndicator?: boolean;
}

/**
 * Renders its children as one step in the flow, sliding in/out based on its
 * registered position. Panels register themselves with StepFlowProvider on
 * mount (in render order) and deregister on unmount, so the flow's total
 * step count and each panel's index are derived automatically - list
 * `<StepPanel>` for every step your current user should see (wrap
 * conditional ones in <Show>), no index/total bookkeeping required.
 *
 * Motion is spring-driven (position + opacity independently) rather than a
 * CSS transition, so it can be interrupted/re-targeted mid-flight cleanly.
 */
export function StepPanel(props: StepPanelProps) {
	const flow = useStepFlow();

	const id = flow.registerPanel({
		order: props.order,
		minVersion: props.minVersion,
		excludeFromIndicator: props.excludeFromIndicator,
	});
	onCleanup(() => flow.unregisterPanel(id));

	const index = () => flow.indexOfPanel(id);
	const active = () => flow.step() === index();
	const targetX = () => (active() ? 0 : index() < flow.step() ? -40 : 40);

	const [x, setX] = createSpring(targetX(), STEP_SPRING_OPTIONS);
	createEffect(() => setX(targetX()));

	const [opacity, setOpacity] = createSpring(
		active() ? 1 : 0,
		STEP_SPRING_OPTIONS,
	);
	createEffect(() => setOpacity(active() ? 1 : 0));

	return (
		<div class="size-full">
			<div
				class="absolute inset-0"
				style={{
					transform: `translateX(${x()}px)`,
					opacity: opacity(),
					visibility: opacity() > 0.01 ? "visible" : "hidden",
					"pointer-events": active() ? "auto" : "none",
					"z-index": active() ? 1 : 0,
				}}
			>
				{props.children}
			</div>
		</div>
	);
}
