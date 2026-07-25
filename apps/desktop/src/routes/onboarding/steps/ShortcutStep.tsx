import { cx } from "cva";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	type ParentProps,
} from "solid-js";

export function ShortcutsStep(props: { active: boolean }) {
	const [visible, setVisible] = createSignal(false);

	createEffect(() => {
		if (props.active) {
			setVisible(false);
			const t = setTimeout(() => setVisible(true), 100);
			onCleanup(() => clearTimeout(t));
		} else {
			setVisible(false);
		}
	});

	const settingsAreas = [
		{
			title: "Keyboard Shortcuts",
			desc: "Global hotkeys for recording, screenshots, and switching modes",
		},
		{
			title: "Custom S3 Storage",
			desc: "Connect your own S3-compatible bucket for full control over your recordings",
		},
		{
			title: "Custom Domain",
			desc: "Use your own domain for shareable links instead of cap.link",
		},
		{
			title: "Recording Preferences",
			desc: "FPS, quality, countdown timer, cursor effects, and more",
		},
	];

	return (
		<div class="flex flex-col items-center justify-center min-h-full px-12 gap-6">
			<div
				class={cx(
					"flex flex-col items-center gap-3 text-center max-w-[440px] transition-all duration-500",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<div class="flex items-center justify-center size-12 rounded-2xl bg-white dark:bg-gray-3 border border-gray-4">
					<IconCapSettings class="size-5 text-gray-11" />
				</div>
				<h2 class="text-2xl font-bold text-gray-12 tracking-tight">
					Make Cap yours
				</h2>
				<p class="text-[14px] text-gray-10 leading-relaxed">
					Customize everything from keyboard shortcuts to storage. Cap adapts to
					your workflow.
				</p>
			</div>

			<div
				class={cx(
					"w-full max-w-[420px] flex flex-col gap-2 transition-all duration-500 delay-100",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<For each={settingsAreas}>
					{(area, index) => (
						<div
							class="flex flex-col gap-1 px-4 py-3 rounded-xl border border-gray-4 bg-white dark:bg-gray-2 transition-all duration-500 shadow-xs"
							style={{
								"transition-delay": `${150 + index() * 80}ms`,
								opacity: visible() ? 1 : 0,
								transform: visible() ? "translateY(0)" : "translateY(8px)",
							}}
						>
							<span class="text-[13px] font-medium text-gray-12">
								{area.title}
							</span>
							<span class="text-[11px] text-gray-10 leading-snug">
								{area.desc}
							</span>
						</div>
					)}
				</For>
			</div>

			<p
				class={cx(
					"text-xs text-gray-9 transition-all duration-500 delay-300",
					visible() ? "opacity-100" : "opacity-0",
				)}
			>
				Change any of these at any time in Settings
			</p>
		</div>
	);
}
