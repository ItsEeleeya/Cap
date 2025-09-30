import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveResource } from "@tauri-apps/api/path";
import { createResource, For } from "solid-js";

const WALLPAPER_NAMES = [
	// macOS wallpapers
	"macOS/sequoia-dark",
	"macOS/sequoia-light",
	"macOS/sonoma-clouds",
	"macOS/sonoma-dark",
	"macOS/sonoma-evening",
	"macOS/sonoma-fromabove",
	"macOS/sonoma-horizon",
	"macOS/sonoma-light",
	"macOS/sonoma-river",
	"macOS/ventura-dark",
	"macOS/ventura-semi-dark",
	"macOS/ventura",
	// Blue wallpapers
	"blue/1",
	"blue/2",
	"blue/3",
	"blue/4",
	"blue/5",
	"blue/6",
	// Purple wallpapers
	"purple/1",
	"purple/2",
	"purple/3",
	"purple/4",
	"purple/5",
	"purple/6",
	// Dark wallpapers
	"dark/1",
	"dark/2",
	"dark/3",
	"dark/4",
	"dark/5",
	"dark/6",
	// Orange wallpapers
	"orange/1",
	"orange/2",
	"orange/3",
	"orange/4",
	"orange/5",
	"orange/6",
	"orange/7",
	"orange/8",
	"orange/9",
] as const;

export default function () {
	const [wallpapers] = createResource(async () => {
		// Only load visible wallpapers initially
		const visibleWallpaperPaths = WALLPAPER_NAMES.map(async (id) => {
			try {
				const path = await resolveResource(`assets/backgrounds/${id}.jpg`);
				return { id, path };
			} catch (_err) {
				return { id, path: null };
			}
		});

		// Load initial batch
		const initialPaths = await Promise.all(visibleWallpaperPaths);

		return initialPaths
			.filter((p) => p.path !== null)
			.map(({ id, path }) => ({
				id,
				url: convertFileSrc(path),
				rawPath: path,
			}));
	});

	return (
		<>
			<div class="absolute w-screen h-1/2 flex overflow-x-scroll p-1 gap-3">
				<For each={wallpapers()}>
					{(item) => {
						return (
							<img
								class="rounded-2xl shadow-sm"
								src={item.url}
								alt="wallpaper image"
							/>
						);
					}}
				</For>
			</div>
			<div class="absolute w-screen h-full flex flex-col overflow-x-scroll p-2 gap-3 top-[50%] rounded-2xl">
				<For each={wallpapers()}>
					{(item) => {
						return (
							<img
								class="rounded-2xl shadow-sm"
								src={item.url}
								alt="wallpaper image"
							/>
						);
					}}
				</For>
			</div>
		</>
	);
}
