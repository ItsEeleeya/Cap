// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

function initApp() {
	const app = document.getElementById("app");
	if (!app) throw new Error("App root element not found");

	mount(() => <StartClient />, app);

	import("@tauri-apps/plugin-os")
		.then(({ type }) =>
			document.documentElement.setAttribute("data-platform", type()),
		)
		.catch((error) => console.error("Failed to get OS type:", error));

	if (import.meta.env.TAURI_ENV_PLATFORM === "darwin") {
		import("~/utils/material-hosting")
			.then(({ APPLE_SUPPORTS_HOSTED_MATERIALS }) =>
				document.documentElement.setAttribute(
					"data-solarium",
					String(APPLE_SUPPORTS_HOSTED_MATERIALS),
				),
			)
			.catch((error) =>
				console.error("Failed to check Material Hosting support:", error),
			);
	}
}

initApp();
