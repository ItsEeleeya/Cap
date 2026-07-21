import {
	createSignal,
	createEffect,
	onCleanup,
	onMount,
	For,
	Show,
	type JSX,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import {
	createSpring,
	springs,
	type SpringController,
	type SpringPreset,
} from "~/utils/springs";
// ^ adjust the import path/alias to wherever utils/springs actually lives

export interface SplitTextProps {
	text: string;
	class?: string;
	/** ms between each unit's animation start (stagger) */
	delay?: number;
	/** spring stiffness/damping — springs don't have a fixed "duration" the way gsap tweens do */
	preset?: SpringPreset;
	splitType?: "chars" | "words" | "lines";
	from?: { opacity?: number; y?: number };
	to?: { opacity?: number; y?: number };
	/** IntersectionObserver threshold */
	threshold?: number;
	/** IntersectionObserver rootMargin */
	rootMargin?: string;
	tag?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
	textAlign?: JSX.CSSProperties["text-align"];
	onComplete?: () => void;
}

type Unit = { key: number; content: string; isSpace: boolean };

function splitChars(text: string): Unit[] {
	return Array.from(text).map((ch, i) => ({
		key: i,
		content: ch,
		isSpace: ch === " ",
	}));
}

function splitWords(text: string): Unit[] {
	// Whitespace becomes its own (non-animated) unit so word gaps survive.
	return text
		.split(/(\s+)/)
		.filter(Boolean)
		.map((chunk, i) => ({
			key: i,
			content: chunk,
			isSpace: /^\s+$/.test(chunk),
		}));
}

export function SplitText(props: SplitTextProps) {
	let containerRef: HTMLElement | undefined;

	const type = () => props.splitType ?? "chars";
	const preset = () => props.preset ?? springs.default;
	const stagger = () => props.delay ?? 50;
	const from = () => ({ opacity: 0, y: 40, ...props.from });
	const to = () => ({ opacity: 1, y: 0, ...props.to });

	const [chars, setChars] = createSignal<Unit[]>([]);
	const [words, setWords] = createSignal<Unit[]>([]);
	const [lineGroups, setLineGroups] = createSignal<Unit[][]>([]);
	const [linesReady, setLinesReady] = createSignal(false);

	const springsMap = new Map<number, SpringController>();
	let observer: IntersectionObserver | undefined;
	let started = false;
	let timers: number[] = [];

	function getSpring(key: number) {
		let s = springsMap.get(key);
		if (!s) {
			s = createSpring(0, preset());
			springsMap.set(key, s);
		}
		return s;
	}

	function clearSprings() {
		springsMap.forEach((s) => s.destroy());
		springsMap.clear();
	}

	function clearTimers() {
		timers.forEach(clearTimeout);
		timers = [];
	}

	// Measures the flat (hidden) word spans and groups the ones sharing a
	// row into lines. A lightweight stand-in for GSAP SplitText's line
	// detection — fine for static text, won't auto-regroup on resize (add
	// a ResizeObserver calling resplit() if you need that).
	function measureLines() {
		if (!containerRef) return;
		const wordEls = Array.from(
			containerRef.querySelectorAll<HTMLElement>("[data-split-word]"),
		);
		const groups: Unit[][] = [];
		let currentTop: number | null = null;
		let currentGroup: Unit[] = [];
		for (const el of wordEls) {
			const key = Number(el.dataset.splitWord);
			const unit = words().find((w) => w.key === key);
			if (!unit) continue;
			const top = el.offsetTop;
			if (currentTop === null || Math.abs(top - currentTop) < 2) {
				currentGroup.push(unit);
			} else {
				groups.push(currentGroup);
				currentGroup = [unit];
			}
			currentTop = top;
		}
		if (currentGroup.length) groups.push(currentGroup);
		setLineGroups(groups);
		setLinesReady(true);
	}

	function resplit() {
		clearSprings();
		clearTimers();
		started = false;
		setLinesReady(false);

		if (type() === "chars") {
			setChars(splitChars(props.text));
		} else {
			setWords(splitWords(props.text));
			if (type() === "lines") {
				// Let the flat (hidden) words render, then measure next frame.
				requestAnimationFrame(() => requestAnimationFrame(measureLines));
			}
		}
	}

	function startAnimation() {
		if (started) return;
		started = true;

		const keys =
			type() === "chars"
				? chars()
						.filter((u) => !u.isSpace)
						.map((u) => u.key)
				: type() === "words"
					? words()
							.filter((u) => !u.isSpace)
							.map((u) => u.key)
					: lineGroups().map((_, i) => i);

		keys.forEach((key, i) => {
			timers.push(
				window.setTimeout(() => getSpring(key).set(1), i * stagger()),
			);
		});

		if (props.onComplete) {
			// Estimate settle time from the preset rather than polling every
			// spring for its rest state.
			const { k, d } = preset();
			const w = Math.sqrt(k);
			const z = d / (2 * w);
			const settleMs = (4 / (Math.max(z, 0.05) * w)) * 1000;
			timers.push(
				window.setTimeout(
					() => props.onComplete?.(),
					keys.length * stagger() + settleMs,
				),
			);
		}
	}

	onMount(() => {
		resplit();
		if (!containerRef) return;
		observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						startAnimation();
						observer?.disconnect();
					}
				}
			},
			{
				threshold: props.threshold ?? 0.1,
				rootMargin: props.rootMargin ?? "-100px",
			},
		);
		observer.observe(containerRef);
	});

	createEffect(() => {
		// Re-split when text or split mode changes.
		props.text;
		type();
		if (containerRef) resplit();
	});

	onCleanup(() => {
		observer?.disconnect();
		clearSprings();
		clearTimers();
	});

	const unitStyle = (key: number): JSX.CSSProperties => {
		const p = getSpring(key).value();
		const f = from();
		const t = to();
		return {
			display: "inline-block",
			opacity: `${(f.opacity ?? 0) + ((t.opacity ?? 1) - (f.opacity ?? 0)) * p}`,
			transform: `translateY(${(f.y ?? 0) + ((t.y ?? 0) - (f.y ?? 0)) * p}px)`,
			"will-change": "transform, opacity",
		};
	};

	return (
		<Dynamic
			component={props.tag ?? "p"}
			ref={containerRef}
			class={`split-parent inline-block whitespace-normal ${props.class ?? ""}`}
			style={{
				"text-align": props.textAlign ?? "center",
				"word-wrap": "break-word",
			}}
		>
			<Show when={type() === "chars"}>
				<For each={chars()}>
					{(u) =>
						u.isSpace ? (
							<span>{u.content}</span>
						) : (
							<span class="split-char" style={unitStyle(u.key)}>
								{u.content}
							</span>
						)
					}
				</For>
			</Show>

			<Show when={type() === "words"}>
				<For each={words()}>
					{(u) =>
						u.isSpace ? (
							<span>{u.content}</span>
						) : (
							<span class="split-word" style={unitStyle(u.key)}>
								{u.content}
							</span>
						)
					}
				</For>
			</Show>

			<Show when={type() === "lines"}>
				<Show
					when={linesReady()}
					fallback={
						<For each={words()}>
							{(u) => (
								<span data-split-word={u.key} style={{ visibility: "hidden" }}>
									{u.content}
								</span>
							)}
						</For>
					}
				>
					<For each={lineGroups()}>
						{(line, i) => (
							<span
								class="split-line overflow-hidden"
								style={{ ...unitStyle(i()), display: "block" }}
							>
								<For each={line}>
									{(u) => <span class="split-word">{u.content}</span>}
								</For>
							</span>
						)}
					</For>
				</Show>
			</Show>
		</Dynamic>
	);
}
