import type { ParentProps } from "solid-js";

export type PlatformName = "darwin" | "windows" | "linux";

export const PLATFORM: PlatformName = import.meta.env.TAURI_ENV_PLATFORM;
export const isMacOS = PLATFORM === "darwin";
export const isWindows = PLATFORM === "windows";
export const isLinux = PLATFORM === "linux";

function macOS(props: ParentProps) {
	return isMacOS ? props.children : null;
}

function windows(props: ParentProps) {
	return isWindows ? props.children : null;
}

function linux(props: ParentProps) {
	return isLinux ? props.children : null;
}

export const Platform = { macOS, windows, linux };
