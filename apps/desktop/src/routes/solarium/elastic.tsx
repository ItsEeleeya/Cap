import { createSignal, type JSX, onCleanup } from "solid-js";

type SpringOpts = {
	stiffness?: number;
	damping?: number;
};

function spring(initial: number, target: number, opts: SpringOpts = {}) {
	let x = initial;
	let v = 0;

	const k = opts.stiffness ?? 20;
	const c = opts.damping ?? 26;

	return {
		setTarget(t: number) {
			target = t;
		},
		step(dt: number) {
			const a = -k * (x - target) - c * v;
			v += a * dt;
			x += v * dt;
			return x;
		},
		get() {
			return x;
		},
	};
}

export function LiquidGlassPopover(props: {
	trigger: JSX.Element;
	children: JSX.Element;
}) {
	let triggerRef!: HTMLButtonElement;
	let popoverRef!: HTMLDivElement;

	const [open, setOpen] = createSignal(false);
	let raf = 0;

	function rect(el: HTMLElement) {
		return el.getBoundingClientRect();
	}

	function morphOpen() {
		if (open()) return;

		const start = rect(triggerRef);

		const endW = 360;
		const endH = 220;
		const end = {
			left: (window.innerWidth - endW) / 2,
			top: (window.innerHeight - endH) / 2,
			width: endW,
			height: endH,
		};

		// Clone trigger (native glass)
		const clone = triggerRef.cloneNode(true) as HTMLDivElement;
		clone.className =
			"fixed z-50 pointer-events-none apple-glass border border-white/10";

		Object.assign(clone.style, {
			left: `${start.left}px`,
			top: `${start.top}px`,
			width: `${start.width}px`,
			height: `${start.height}px`,
			borderRadius: "999px",
			transformOrigin: "center",
		});

		document.body.appendChild(clone);

		// Springs
		const sx = spring(start.left, end.left);
		const sy = spring(start.top, end.top);
		const sw = spring(start.width, end.width);
		const sh = spring(start.height, end.height);
		const sr = spring(999, 14, { stiffness: 14, damping: 30 });

		// liquid feel: slight scale overshoot
		const sxs = spring(1, 1, { stiffness: 10, damping: 18 });
		const sys = spring(1, 1, { stiffness: 10, damping: 18 });

		let last = performance.now();

		const frame = (now: number) => {
			const dt = Math.min(32, now - last) / 1000;
			last = now;

			const x = sx.step(dt);
			const y = sy.step(dt);
			const w = sw.step(dt);
			const h = sh.step(dt);
			const r = sr.step(dt);

			// stretch a bit while moving
			const vx = Math.abs(sw.get() - end.width);
			const vy = Math.abs(sh.get() - end.height);
			sxs.setTarget(1 + Math.min(0.06, vx / 800));
			sys.setTarget(1 + Math.min(0.06, vy / 800));

			const scaleX = sxs.step(dt);
			const scaleY = sys.step(dt);

			Object.assign(clone.style, {
				left: `${x}px`,
				top: `${y}px`,
				width: `${w}px`,
				height: `${h}px`,
				borderRadius: `${r}px`,
				transform: `scale(${scaleX}, ${scaleY})`,
			});

			const done =
				Math.abs(x - end.left) < 0.4 &&
				Math.abs(y - end.top) < 0.4 &&
				Math.abs(w - end.width) < 0.4 &&
				Math.abs(h - end.height) < 0.4;

			if (!done) {
				raf = requestAnimationFrame(frame);
			} else {
				clone.remove();
				setOpen(true);
			}
		};

		raf = requestAnimationFrame(frame);
	}

	function close() {
		setOpen(false);
	}

	onCleanup(() => cancelAnimationFrame(raf));

	return (
		<>
			{/* Trigger */}
			<button
				ref={triggerRef}
				onClick={morphOpen}
				class="
          relative z-10
          size-14 rounded-full
          apple-glass-clear
          border border-white/10
          flex items-center justify-center
          text-white
        "
			>
				{props.trigger}
			</button>

			{/* Popover */}
			{open() && (
				<div
					class="fixed inset-0 z-40 flex items-center justify-center"
					onClick={close}
				>
					<div
						ref={popoverRef}
						onClick={(e) => e.stopPropagation()}
						class="
              relative
              w-[360px] h-[220px]
              rounded-[14px]
              apple-glass
              border border-white/10
              p-4
              overflow-hidden
            "
					>
						{/* Specular highlights (liquid feel) */}
						<div
							class="
              pointer-events-none
              absolute -top-12 -left-12
              w-40 h-40
              rounded-full
              bg-white/20
              blur-2xl
              opacity-50
            "
						/>
						<div
							class="
              pointer-events-none
              absolute top-8 right-6
              w-24 h-24
              rounded-full
              bg-white/10
              blur-xl
            "
						/>

						{props.children}
					</div>
				</div>
			)}
		</>
	);
}
