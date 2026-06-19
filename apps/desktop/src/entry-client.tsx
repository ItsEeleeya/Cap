// @refresh reload

import { mount, StartClient } from "@solidjs/start/client";
import { commands } from "./utils/tauri";

async function initApp() {
	if (
		import.meta.env.DEV &&
		import.meta.env.VITE_SOLID_DEVTOOLS &&
		window.location.pathname.startsWith("/editor")
	) {
		const { attachDevtoolsOverlay } = await import("@solid-devtools/overlay");
		attachDevtoolsOverlay();
	}

	const app = document.getElementById("app");
	if (!app) throw new Error("App root element not found");

	mount(() => <StartClient />, app);

	commands.log("mounted");

	const pluginOs = import("@tauri-apps/plugin-os");
	pluginOs
		.then(({ type }) =>
			document.documentElement.setAttribute("data-platform", type()),
		)
		.catch((error) => console.error("Failed to get OS type:", error));

	if (import.meta.env.TAURI_ENV_PLATFORM === "darwin") {
		import("~/utils/material-hosting")
			.then(({ APPLE_SUPPORTS_HOSTED_MATERIALS }) => {
				pluginOs.then(({ version }) => {
					const v = version().split(".");
					const majorVersion = parseInt(v[0], 10);

					if (majorVersion === 26) {
						document.documentElement.setAttribute(
							"data-macos-window-has-extended-radius",
							"",
						);
					}
				});

				if (APPLE_SUPPORTS_HOSTED_MATERIALS) {
					document.documentElement.setAttribute("data-solarium", "true");
				} else {
					document.documentElement.removeAttribute("data-solarium");
				}
			})
			.catch((error) =>
				console.error("Failed to check Material Hosting support:", error),
			);
	}
}

void initApp();
