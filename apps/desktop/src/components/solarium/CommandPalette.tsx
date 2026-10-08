import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import { Transition } from "solid-transition-group";
import { Scroller } from "~/components/ScrollView";

const commands = [
	["Undo", "⌘ Z"],
	["Redo", "⇧ ⌘ Z"],
	["Play / Pause", "Space"],
	["Split clip", "S"],
	["Delete selection", "⌫"],
	["Duplicate clip", "⌘ D"],
	["Select all clips", "⌘ A"],
	["Deselect all", "⌥ ⌘ A"],
	["Zoom in", "⌘ +"],
	["Zoom out", "⌘ -"],
	["Fit timeline", "⇧ F"],
	["Add caption", "C"],
	["Toggle sidebar", "⌘ ."],
	["Toggle clips", "⌘ 1"],
	["Toggle captions", "⌘ 2"],
	["Toggle timeline", "⌘ 3"],
	["Open recording bundle", "⌘ O"],
	["Import media", "⌘ I"],
	["Export video", "⌘ E"],
	["Open settings", "⌘ ,"],
] as const;

export default function CommandPalette(props: {
	open: boolean;
	onClose: () => void;
}) {
	const [query, setQuery] = createSignal("");
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	let inputRef: HTMLInputElement | undefined;

	const filteredCommands = createMemo(() => {
		const normalizedQuery = query().trim().toLowerCase();
		if (!normalizedQuery) return commands;
		return commands.filter(([label]) =>
			label.toLowerCase().includes(normalizedQuery),
		);
	});

	createEffect(() => {
		if (!props.open) return;
		setQuery("");
		setSelectedIndex(0);
		queueMicrotask(() => inputRef?.focus());
	});

	createEffect(() => {
		const lastIndex = filteredCommands().length - 1;
		if (selectedIndex() > lastIndex) setSelectedIndex(Math.max(lastIndex, 0));
	});

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			props.onClose();
			return;
		}
		if (event.key === "ArrowDown") {
			event.preventDefault();
			setSelectedIndex((index) =>
				Math.min(index + 1, filteredCommands().length - 1),
			);
		}
		if (event.key === "ArrowUp") {
			event.preventDefault();
			setSelectedIndex((index) => Math.max(index - 1, 0));
		}
		if (event.key === "Enter") event.preventDefault();
	};

	createEffect(() => {
		if (!props.open) return;
		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	return (
		<Transition
			appear
			enterClass="[transform:scaleX(1.1)] opacity-0 blur-[4px]"
			enterActiveClass="duration-[200ms] ease-[var(--spring-easing)]"
			enterToClass="[transform:scaleX(1)] opacity-100 blur-0"
			exitClass="[transform:scaleX(1)] opacity-100 blur-0"
			exitActiveClass="duration-[250ms] ease-[var(--spring-easing)]"
			exitToClass="[transform:scaleX(1.1)] opacity-0 blur-[4px]"
		>
			<Show when={props.open}>
				<div
					class="fixed inset-0 z-100 flex items-start justify-center bg-black/0 pt-[12vh]"
					onClick={(event) =>
						event.target === event.currentTarget && props.onClose()
					}
				>
					<div
						class="relative h-[min(450px,76vh)] w-[min(560px,calc(100vw-32px))] overflow-hidden rounded-3xl bg-ed-card/40 dark:bg-ed-card/60 apple-glass"
						style="--spring-easing: linear(0, 0.0018, 0.0069 1.16%, 0.0262 2.32%, 0.0642, 0.1143 5.23%, 0.2244 7.84%, 0.5881 15.68%, 0.6933, 0.7839, 0.8591, 0.9191 26.13%, 0.9693, 1.0044 31.93%, 1.0234, 1.0358 36.58%, 1.0434 39.19%, 1.046 42.39%, 1.0446 44.71%, 1.0404 47.61%, 1.0118 61.84%, 1.0028 69.39%, 0.9981 80.42%, 0.9991 99.87%); --spring-duration: 0.8300s;"
					>
						<div class="absolute inset-x-0 top-0 z-10 flex h-13 items-center gap-3 border-b border-ed-line bg-ed-card/50 px-4">
							<IconLucideSearch class="size-4 shrink-0 text-ed-text-1" />
							<input
								ref={inputRef}
								value={query()}
								onInput={(event) => setQuery(event.currentTarget.value)}
								placeholder="Search commands..."
								class="h-13 min-w-0 flex-1 bg-transparent text-sm text-ed-text-1 outline-hidden placeholder:text-ed-text-3"
							/>
							<kbd class="rounded-md bg-ed-ctl px-1.5 py-1 text-[10px] text-ed-text-3">
								ESC
							</kbd>
						</div>
						<Scroller.Root class="h-full">
							<Scroller.Viewport
								class="h-full"
								fade
								edges={{ top: 56, bottom: 20 }}
							>
								<div class="p-2">
									<For each={filteredCommands()}>
										{([label, shortcut], index) => (
											<div
												class="flex h-9 items-center justify-between rounded-lg px-3 text-[13px] text-ed-text-1"
												classList={{
													"bg-ed-ctl-hover text-ed-text-1":
														selectedIndex() === index(),
												}}
											>
												<span>{label}</span>
												<kbd class="text-[11px] text-ed-text-3">{shortcut}</kbd>
											</div>
										)}
									</For>
									{filteredCommands().length === 0 && (
										<div class="px-3 py-8 text-center text-xs text-ed-text-3">
											No commands found
										</div>
									)}
								</div>
							</Scroller.Viewport>
							<Scroller.Scrollbar edges={{ top: 56, bottom: 16 }} />
							<Scroller.EdgeEffect
								to="top"
								size={60}
								blurIntensity={0.5}
								class="rounded-t-3xl"
							/>
						</Scroller.Root>
					</div>
				</div>
			</Show>
		</Transition>
	);
}
