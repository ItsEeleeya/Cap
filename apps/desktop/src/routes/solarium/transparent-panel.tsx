import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { onCleanup } from "solid-js";

const appWebview = getCurrentWebviewWindow();

const HIT_SELECTOR = "[data-hit-target]";
const dpr = window.devicePixelRatio;

let isIgnored: boolean | null = null;
let rafId: number | null = null;
let lastPos: { x: number; y: number } | null = null;

function updateHitTest() {
	rafId = null;
	if (!lastPos) return;

	const x = lastPos.x / dpr;
	const y = lastPos.y / dpr;

	const elements = document.elementsFromPoint(x, y);
	const hasHitTarget = elements.some(
		(el) => el instanceof HTMLElement && el.matches(HIT_SELECTOR),
	);

	const shouldIgnore = !hasHitTarget;

	if (shouldIgnore !== isIgnored) {
		appWebview.setIgnoreCursorEvents(shouldIgnore);
		isIgnored = shouldIgnore;
	}
}

function onDeviceMouseMove(payload: { x: number; y: number }) {
	lastPos = payload;
	if (rafId == null) {
		rafId = requestAnimationFrame(updateHitTest);
	}
}

// Example listener hookup
const unlisten = await appWebview.listen("device-mouse-move", (e) => {
	onDeviceMouseMove(e.payload);
});

onCleanup(() => {
	unlisten();
	if (rafId) cancelAnimationFrame(rafId);
});
