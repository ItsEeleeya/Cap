import { cx } from "cva";
import { For, Show } from "solid-js";
import { Button } from "~/components/Button";
import { useStepFlow } from "./StepFlow";

export function StepNavigation(props: {
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
											: "w-1.5 h-1.5 bg-gray-5",
								)}
							/>
						)}
					</For>
				</div>

				<div class="flex-1 flex justify-end">
					<div class="flex flex-col items-center gap-1.5">
						<Button
							onClick={flow.next}
							variant="primary"
							size="md"
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
						</Button>
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
			<span class="text-[10px] text-gray-8 tabular-nums">
				Press Enter ↵ or use ← → arrow keys
			</span>
		</div>
	);
}
