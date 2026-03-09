// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

async function initApp() {
	try {
		const { type } = await import("@tauri-apps/plugin-os");
		const ostype = type();
		document.documentElement.setAttribute("platform", ostype);
	} catch (error) {
		console.error("Failed to get OS type:", error);
	}

	mount(() => <StartClient />, document.getElementById("app")!);
}

initApp();
