import { open } from "@tauri-apps/plugin-shell";
import { cx } from "cva";
import {
	createEffect,
	createSignal,
	onCleanup,
	type ParentProps,
} from "solid-js";

export function FaqStep(props: { active: boolean }) {
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

	return (
		<div class="flex flex-col items-center justify-center min-h-full px-12 py-6 gap-6">
			<div
				class={cx(
					"flex flex-col items-center gap-2 text-center transition-all duration-500",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<h2 class="text-2xl font-bold text-gray-12 tracking-tight">
					Frequently Asked Questions
				</h2>
				<p class="text-[14px] text-gray-10">
					Everything you need to know to get started.
				</p>
			</div>

			<div
				class={cx(
					"w-full max-w-[480px] rounded-xl border border-gray-4 bg-white dark:bg-gray-2 overflow-hidden transition-all duration-500 delay-100 shadow-xs",
					visible() ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4",
				)}
			>
				<FaqItem question="Is Cap free to use?">
					<p class="text-[13px] text-gray-10 leading-relaxed">
						Cap is free for personal use. For teams and commercial use, check
						out our{" "}
						<button
							type="button"
							onClick={() => open("https://cap.so/pricing")}
							class="text-blue-10 hover:text-blue-11 underline underline-offset-2"
						>
							pricing plans
						</button>
						.
					</p>
				</FaqItem>
				<FaqItem question="What's the difference between Instant and Studio?">
					<p class="text-[13px] text-gray-10 leading-relaxed">
						Instant mode uploads as you record — stop recording and you'll have
						a shareable link immediately. Studio mode records locally in full
						quality, letting you edit with backgrounds, effects, and more before
						sharing.
					</p>
				</FaqItem>
				<FaqItem question="Where are my recordings stored?">
					<p class="text-[13px] text-gray-10 leading-relaxed">
						All recordings are stored locally on your computer. In Instant mode,
						they're also uploaded to Cap's cloud for easy sharing. You can
						manage storage in Settings.
					</p>
				</FaqItem>
				<FaqItem question="Can I change my shortcuts later?">
					<p class="text-[13px] text-gray-10 leading-relaxed">
						Head to Settings → Shortcuts at any time to customize all your
						keyboard shortcuts.
					</p>
				</FaqItem>
				<FaqItem question="How does sharing work?">
					<p class="text-[13px] text-gray-10 leading-relaxed">
						In Instant mode, you get a shareable link automatically when you
						stop recording. In Studio mode, export your edited video and share
						via Cap's cloud or save locally.
					</p>
				</FaqItem>
			</div>

			<button
				type="button"
				onClick={() => open("https://cap.so/pricing")}
				class={cx(
					"flex items-center gap-1.5 text-[13px] text-blue-10 hover:text-blue-11 transition-all duration-500 delay-200",
					visible() ? "opacity-100" : "opacity-0",
				)}
			>
				View pricing plans
				<IconLucideExternalLink class="size-3" />
			</button>
		</div>
	);
}

function FaqItem(props: ParentProps<{ question: string }>) {
	const [open, setOpen] = createSignal(false);

	return (
		<div class="border-b border-gray-4 last:border-b-0">
			<button
				type="button"
				onClick={() => setOpen((p) => !p)}
				class="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-gray-2 dark:hover:bg-gray-3 transition-colors duration-200"
			>
				<span class="text-[13px] font-medium text-gray-12">
					{props.question}
				</span>
				<IconLucideChevronDown
					class={cx(
						"size-3.5 text-gray-9 shrink-0 transition-transform duration-300",
						open() && "rotate-180",
					)}
				/>
			</button>
			<div
				class="overflow-hidden transition-all duration-300 ease-out"
				style={{
					"max-height": open() ? "200px" : "0px",
					opacity: open() ? 1 : 0,
				}}
			>
				<div class="px-4 pb-3">{props.children}</div>
			</div>
		</div>
	);
}
