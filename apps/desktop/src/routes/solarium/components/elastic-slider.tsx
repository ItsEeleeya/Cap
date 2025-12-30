import { createEffect, createSignal, onCleanup, Show } from "solid-js";
import { Transition } from "solid-transition-group";

const MAX_OVERFLOW = 50;

function decay(value: number, max: number) {
	if (max === 0) {
		return 0;
	}

	const entry = value / max;
	const sigmoid = 2 * (1 / (1 + Math.exp(-entry)) - 0.5);

	return sigmoid * max;
}

function SpeakerXMarkIcon() {
	return (
		<svg
			class="size-5 text-white"
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L5.203 13H2.667a.75.75 0 01-.7-.48A6.985 6.985 0 011.5 10c0-.887.165-1.737.468-2.52a.75.75 0 01.699-.48h2.536l3.533-3.796a.75.75 0 01.811-.142zM12.22 5.22a.75.75 0 011.06 0L15 6.94l1.72-1.72a.75.75 0 111.06 1.06L16.06 8l1.72 1.72a.75.75 0 11-1.06 1.06L15 9.06l-1.72 1.72a.75.75 0 11-1.06-1.06L13.94 8l-1.72-1.72a.75.75 0 010-1.06z" />
		</svg>
	);
}

function SpeakerWaveIcon() {
	return (
		<svg
			class="size-5 text-white"
			fill="currentColor"
			viewBox="0 0 20 20"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M10.5 3.75a.75.75 0 00-1.264-.546L5.703 6.5H3a.75.75 0 00-.75.75v5.5c0 .414.336.75.75.75h2.703l3.533 3.296a.75.75 0 001.264-.546V3.75zM14.854 5.146a.75.75 0 00-1.06 1.06 4.5 4.5 0 010 6.364.75.75 0 001.06 1.06 6 6 0 000-8.484z" />
			<path d="M12.293 7.793a.75.75 0 10-1.06 1.06 1.5 1.5 0 010 2.122.75.75 0 001.06 1.06 3 3 0 000-4.242z" />
		</svg>
	);
}

export default function Slider() {
	const [volume, setVolume] = createSignal(50);
	const [region, setRegion] = createSignal("middle");
	const [overflow, setOverflow] = createSignal(0);
	const [scale, setScale] = createSignal(1);
	const [isDragging, setIsDragging] = createSignal(false);
	const [clientX, setClientX] = createSignal(0);

	let sliderRef: HTMLDivElement | undefined;
	let animationFrame: number | undefined;

	function animateScale(target: number) {
		const start = scale();
		const duration = 200;
		const startTime = performance.now();

		function animate(currentTime: number) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - (1 - progress) ** 3;
			setScale(start + (target - start) * eased);

			if (progress < 1) {
				animationFrame = requestAnimationFrame(animate);
			}
		}

		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = requestAnimationFrame(animate);
	}

	function animateOverflow(target: number) {
		const start = overflow();
		const duration = 500;
		const startTime = performance.now();

		function animate(currentTime: number) {
			const elapsed = currentTime - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const bounce = Math.sin(progress * Math.PI) * 0.5 + progress;
			setOverflow(start + (target - start) * bounce);

			if (progress < 1) {
				animationFrame = requestAnimationFrame(animate);
			}
		}

		if (animationFrame) cancelAnimationFrame(animationFrame);
		animationFrame = requestAnimationFrame(animate);
	}

	createEffect(() => {
		const x = clientX();
		if (sliderRef) {
			const { left, right } = sliderRef.getBoundingClientRect();
			let newValue = 0;

			if (x < left) {
				setRegion("left");
				newValue = left - x;
			} else if (x > right) {
				setRegion("right");
				newValue = x - right;
			} else {
				setRegion("middle");
				newValue = 0;
			}

			setOverflow(decay(newValue, MAX_OVERFLOW));
		}
	});

	function handlePointerDown(e: PointerEvent) {
		setIsDragging(true);
		updateVolume(e);
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handlePointerMove(e: PointerEvent) {
		if (isDragging()) {
			setClientX(e.clientX);
			updateVolume(e);
		}
	}

	function handlePointerUp() {
		setIsDragging(false);
		animateOverflow(0);
	}

	function updateVolume(e: PointerEvent) {
		if (sliderRef) {
			const { left, width } = sliderRef.getBoundingClientRect();
			const percent = Math.max(
				0,
				Math.min(100, ((e.clientX - left) / width) * 100),
			);
			setVolume(Math.floor(percent));
		}
	}

	onCleanup(() => {
		if (animationFrame) cancelAnimationFrame(animationFrame);
	});

	function getScaleX() {
		if (sliderRef) {
			const { width } = sliderRef.getBoundingClientRect();
			return 1 + overflow() / width;
		}
		return 1;
	}

	function getScaleY() {
		return 1 - (overflow() / MAX_OVERFLOW) * 0.2;
	}

	function getTransformOrigin() {
		if (sliderRef) {
			const { left, width } = sliderRef.getBoundingClientRect();
			return clientX() < left + width / 2 ? "right" : "left";
		}
		return "center";
	}

	function getHeight() {
		return 6 + (scale() - 1) * 30;
	}

	function getIconX(side: "left" | "right") {
		if (region() === side) {
			return side === "left" ? -overflow() / scale() : overflow() / scale();
		}
		return 0;
	}

	function getIconScale(side: "left" | "right") {
		return region() === side ? 1.4 : 1;
	}

	return (
		<div
			class="flex w-full touch-none select-none items-center justify-center gap-3"
			style={{
				transform: `scale(${scale()})`,
				opacity: 0.7 + (scale() - 1) * 1.5,
				transition: "transform 0.2s, opacity 0.2s",
			}}
			onMouseEnter={() => animateScale(1.2)}
			onMouseLeave={() => animateScale(1)}
			onTouchStart={() => animateScale(1.2)}
			onTouchEnd={() => animateScale(1)}
		>
			<div
				style={{
					transform: `translateX(${getIconX("left")}px) scale(${getIconScale("left")})`,
					transition:
						region() === "left" ? "transform 0.25s" : "transform 0.2s",
				}}
			>
				<SpeakerXMarkIcon />
			</div>

			<div
				ref={sliderRef}
				class="relative flex w-full max-w-[200px] grow cursor-grab touch-none select-none items-center py-4 active:cursor-grabbing"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
			>
				<div
					class="flex grow"
					style={{
						transform: `scaleX(${getScaleX()}) scaleY(${getScaleY()})`,
						"transform-origin": getTransformOrigin(),
						height: `${getHeight()}px`,
						"margin-top": `${-(getHeight() - 6) / 2}px`,
						"margin-bottom": `${-(getHeight() - 6) / 2}px`,
					}}
				>
					<div class="relative isolate h-full grow overflow-hidden rounded-full bg-gray-500">
						<div
							class="absolute h-full bg-white"
							style={{ width: `${volume()}%` }}
						/>
					</div>
				</div>
			</div>

			<div
				style={{
					transform: `translateX(${getIconX("right")}px) scale(${getIconScale("right")})`,
					transition:
						region() === "right" ? "transform 0.25s" : "transform 0.2s",
				}}
			>
				<SpeakerWaveIcon />
			</div>
		</div>
	);
}
