import { type as osType } from "@tauri-apps/plugin-os";
import { createMemo } from "solid-js";

export type WindowCaptionSide = "left" | "right";

export interface WindowChromeMetrics {
	platform: ReturnType<typeof osType>;
	captionSide: WindowCaptionSide;
	captionWidth: number;
	captionPaddingLeft: string;
	captionPaddingRight: string;
}

export const MACOS_TRAFFIC_LIGHTS_WIDTH = 68;
export const WINDOWS_CAPTION_CONTROLS_WIDTH = 138;

export function useWindowChromeMetrics() {
	const platform = osType();

	return createMemo<WindowChromeMetrics>(() => {
		const captionSide: WindowCaptionSide =
			platform === "windows" ? "right" : "left";
		const captionWidth =
			platform === "windows"
				? WINDOWS_CAPTION_CONTROLS_WIDTH
				: MACOS_TRAFFIC_LIGHTS_WIDTH;

		return {
			platform,
			captionSide,
			captionWidth,
			captionPaddingLeft: captionSide === "left" ? `${captionWidth}px` : "0px",
			captionPaddingRight:
				captionSide === "right" ? `${captionWidth}px` : "0px",
		};
	});
}
