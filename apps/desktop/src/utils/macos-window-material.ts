import type { UnlistenFn } from "@tauri-apps/api/event";
import {
	Effect,
	EffectState,
	type Effects,
	getCurrentWindow,
} from "@tauri-apps/api/window";
import { type as osType, version as osVersion } from "@tauri-apps/plugin-os";

type MacOSWindowMaterial = "panel" | "settings";

let focusUnlisten: Promise<UnlistenFn> | undefined;

const macOSMajorVersion = () => {
	const [major] = osVersion().split(".");
	const parsed = Number.parseInt(major ?? "", 10);
	return Number.isNaN(parsed) ? null : parsed;
};

const updateWindowFocusState = (focused: boolean) => {
	const root = document.documentElement;
	root.dataset.macosWindowFocus = focused ? "focused" : "blurred";
	root.classList.toggle("window-blurred", !focused);
};

export async function applyMacOSWindowMaterial(material: MacOSWindowMaterial) {
	if (osType() !== "macos") return;

	const majorVersion = macOSMajorVersion() ?? 0;
	const visualSystem = majorVersion >= 26 ? "liquid-glass" : "vibrancy";
	const radius =
		material === "settings" && visualSystem === "liquid-glass" ? 26 : 16;
	const backgroundEffect =
		material === "settings"
			? Effect.UnderPageBackground
			: Effect.WindowBackground;
	const root = document.documentElement;
	root.dataset.macosNativeMaterial = material;
	root.dataset.macosVisualSystem = visualSystem;
	const currentWindow = getCurrentWindow();
	updateWindowFocusState(await currentWindow.isFocused());
	focusUnlisten ??= currentWindow.onFocusChanged(({ payload }) =>
		updateWindowFocusState(payload),
	);
	await focusUnlisten;

	const effects: Effects = {
		effects: [backgroundEffect],
		state: EffectState.FollowsWindowActiveState,
		radius,
	};

	await currentWindow.setEffects(effects);
}
