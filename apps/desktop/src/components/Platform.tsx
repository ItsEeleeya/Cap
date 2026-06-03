import type { ParentProps } from "solid-js";

const __PLATFORM__ = import.meta.env.TAURI_ENV_PLATFORM;

export type PlatformName = "macos" | "windows" | "linux";

export const PLATFORM: PlatformName = __PLATFORM__;
export const isMacOS = PLATFORM === "macos";
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