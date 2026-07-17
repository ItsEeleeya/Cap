import { getCurrentWindow } from "@tauri-apps/api/window";

export default function Onboarding() {
	return (
		<div class="size-full">
			<OnboardingHeader />
			<div class="pt-14">Cap</div>
		</div>
	);
}

function OnboardingHeader() {
	return (
		<div
			data-tauri-drag-region="deep"
			class="fixed top-0 left-0 w-full h-12 flex items-center p-3.5"
		>
			<button
				class="size-5 rounded-full inline-flex items-center justify-center before:content[''] before:absolute before:apple-vibrancy-fill before:size-7 before:rounded-full before:bg-white/5"
				onClick={() => void getCurrentWindow().close()}
			>
				<IconLucideX class="size-4 apple-vibrancy-fill" />
			</button>
		</div>
	);
}
