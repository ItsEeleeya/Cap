import { createContextProvider } from "@solid-primitives/context";
import { type } from "@tauri-apps/plugin-os";
import { createEffect, createSignal } from "solid-js";
import { generalSettingsStore } from "~/store";

export const [SolariumContext, useSolarium] = createContextProvider(() => {
	const generalSettings = generalSettingsStore.createQuery();
	const [enabled, setEnabled] = createSignal(
		document.documentElement.hasAttribute("solarium"),
	);
	if (type() === "macos") {
		createEffect(() =>
			setEnabled(!!generalSettings.data?.experimentalSolarium),
		);
	}
	return enabled;
});
