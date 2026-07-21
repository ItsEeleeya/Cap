import { createTween } from "@solid-primitives/tween";
import {
	type Component,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// ---------------------------------------------------------------------------
// Time-of-day palette. Named keyframes tween linearly by hour.
// Maps onto the "drift" 2D-clouds technique's tunables:
//   skyTop/skyBottom     -> sky gradient
//   cloudDark/cloudLight -> cloud shading range
//   cloudCover           -> how much cloud vs open sky (paired with cloudalpha in-shader)
//   lightColor/sunAngle  -> sun/moon glow + warm/cool tint on light-facing cloud edges
// ---------------------------------------------------------------------------

interface Keyframe {
	t: number;
	name: string;
	skyTop: [number, number, number];
	skyBottom: [number, number, number];
	cloudDark: number;
	cloudLight: number;
	cloudCover: number;
	cloudTint: [number, number, number];
	lightColor: [number, number, number];
	sunAngleDeg: number;
	skyTint: number;
}

const KEYFRAMES: Keyframe[] = [
	{
		t: 0.0,
		name: "night",
		skyTop: [0.02, 0.03, 0.09],
		skyBottom: [0.04, 0.06, 0.14],
		cloudDark: 0.16,
		cloudLight: 0.4,
		cloudCover: 0.1,
		cloudTint: [0.45, 0.55, 0.85],
		lightColor: [0.55, 0.65, 0.95],
		sunAngleDeg: 260,
		skyTint: 0.35,
	},
	{
		t: 5.0,
		name: "predawn",
		skyTop: [0.06, 0.08, 0.16],
		skyBottom: [0.18, 0.14, 0.19],
		cloudDark: 0.18,
		cloudLight: 0.42,
		cloudCover: 0.11,
		cloudTint: [0.85, 0.55, 0.5],
		lightColor: [0.85, 0.55, 0.5],
		sunAngleDeg: 15,
		skyTint: 0.4,
	},
	{
		t: 6.3,
		name: "sunrise",
		skyTop: [0.09, 0.15, 0.32],
		skyBottom: [0.85, 0.42, 0.22],
		cloudDark: 0.18,
		cloudLight: 0.46,
		cloudCover: 0.1,
		cloudTint: [1.0, 0.55, 0.24],
		lightColor: [1.0, 0.5, 0.2],
		sunAngleDeg: 20,
		skyTint: 0.55,
	},
	{
		t: 8.0,
		name: "morning",
		skyTop: [0.05, 0.2, 0.46],
		skyBottom: [0.16, 0.32, 0.52],
		cloudDark: 0.2,
		cloudLight: 0.48,
		cloudCover: 0.12,
		cloudTint: [1.0, 0.9, 0.72],
		lightColor: [1.0, 0.85, 0.6],
		sunAngleDeg: 40,
		skyTint: 0.5,
	},
	{
		t: 12.0,
		name: "noon",
		skyTop: [0.03, 0.16, 0.42],
		skyBottom: [0.08, 0.28, 0.48],
		cloudDark: 0.2,
		cloudLight: 0.46,
		cloudCover: 0.13,
		cloudTint: [1.0, 1.0, 1.0],
		lightColor: [1.0, 0.98, 0.92],
		sunAngleDeg: 90,
		skyTint: 0.5,
	},
	{
		t: 16.0,
		name: "afternoon",
		skyTop: [0.04, 0.16, 0.42],
		skyBottom: [0.14, 0.26, 0.46],
		cloudDark: 0.2,
		cloudLight: 0.47,
		cloudCover: 0.12,
		cloudTint: [1.0, 0.92, 0.78],
		lightColor: [1.0, 0.87, 0.62],
		sunAngleDeg: 140,
		skyTint: 0.5,
	},
	{
		t: 18.7,
		name: "sunset",
		skyTop: [0.07, 0.1, 0.26],
		skyBottom: [0.9, 0.38, 0.16],
		cloudDark: 0.18,
		cloudLight: 0.46,
		cloudCover: 0.1,
		cloudTint: [1.0, 0.45, 0.16],
		lightColor: [1.0, 0.42, 0.15],
		sunAngleDeg: 160,
		skyTint: 0.6,
	},
	{
		t: 20.2,
		name: "dusk",
		skyTop: [0.04, 0.05, 0.14],
		skyBottom: [0.22, 0.14, 0.21],
		cloudDark: 0.17,
		cloudLight: 0.42,
		cloudCover: 0.11,
		cloudTint: [0.62, 0.42, 0.55],
		lightColor: [0.6, 0.42, 0.55],
		sunAngleDeg: 195,
		skyTint: 0.45,
	},
	{
		t: 22.5,
		name: "night",
		skyTop: [0.02, 0.03, 0.09],
		skyBottom: [0.04, 0.06, 0.14],
		cloudDark: 0.16,
		cloudLight: 0.4,
		cloudCover: 0.1,
		cloudTint: [0.45, 0.55, 0.85],
		lightColor: [0.55, 0.65, 0.95],
		sunAngleDeg: 250,
		skyTint: 0.35,
	},
	{
		t: 24.0,
		name: "night",
		skyTop: [0.02, 0.03, 0.09],
		skyBottom: [0.04, 0.06, 0.14],
		cloudDark: 0.16,
		cloudLight: 0.4,
		cloudCover: 0.1,
		cloudTint: [0.45, 0.55, 0.85],
		lightColor: [0.55, 0.65, 0.95],
		sunAngleDeg: 260,
		skyTint: 0.35,
	},
];

// ---------------------------------------------------------------------------
// Fixed render tuning. These were exposed as sliders while dialing in the
// look; now that the values are settled they're plain consts. Adjust here,
// not via UI.
// ---------------------------------------------------------------------------
const CLOUD_DRIFT_SPEED = 0.8;
const CLOUD_DISSIPATION_SPEED = 0.65;
const CLOUD_COVERAGE = 0.8;
const STAR_BRIGHTNESS = 0.9;
const IRIDESCENCE = 0.25;
const CLOUD_SHADOW_AMOUNT = 0.5;

// Play-through-day rate, in simulated hours per real second.
const PLAY_SPEED = 0.9;

// How often (ms) to re-read the system clock when following real time.
const SYSTEM_CLOCK_POLL_MS = 30_000;

// ---------------------------------------------------------------------------
// Transition mode (e.g. handing off to a permissions screen with foreground
// text/UI): clouds thin out and the scene dims, while render resolution and
// frame rate both drop since the background is secondary at that point.
// ---------------------------------------------------------------------------
const TRANSITION_DURATION_MS = 900;
const TRANSITION_EASE = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
const TRANSITION_DRIFT_SPEED = 0.08; // much slower drift while transitioning
const TRANSITION_FPS = 8;
const FPS_CAP = 48;
// Internal render scale while transitioning, on top of the normal DPR cap.
// Kept high enough that the browser's bilinear upscale reads as a soft
// blur rather than visible pixelation.
const TRANSITION_RESOLUTION_SCALE = 0.45;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

interface KeyframeArrays {
	t: Float32Array;
	skyTop: Float32Array;
	skyBottom: Float32Array;
	cloudDark: Float32Array;
	cloudLight: Float32Array;
	cloudCover: Float32Array;
	cloudTint: Float32Array;
	lightColor: Float32Array;
	lightDir: Float32Array;
	skyTint: Float32Array;
	count: number;
}

function buildKeyframeArrays(frames: Keyframe[]): KeyframeArrays {
	const n = frames.length;
	const t = new Float32Array(n);
	const skyTop = new Float32Array(n * 3);
	const skyBottom = new Float32Array(n * 3);
	const cloudDark = new Float32Array(n);
	const cloudLight = new Float32Array(n);
	const cloudCover = new Float32Array(n);
	const cloudTint = new Float32Array(n * 3);
	const lightColor = new Float32Array(n * 3);
	const lightDir = new Float32Array(n * 2);
	const skyTint = new Float32Array(n);

	frames.forEach((f, i) => {
		t[i] = f.t;
		skyTop.set(f.skyTop, i * 3);
		skyBottom.set(f.skyBottom, i * 3);
		cloudDark[i] = f.cloudDark;
		cloudLight[i] = f.cloudLight;
		cloudCover[i] = f.cloudCover;
		cloudTint.set(f.cloudTint, i * 3);
		lightColor.set(f.lightColor, i * 3);
		const a = toRad(f.sunAngleDeg);
		lightDir.set([Math.cos(a), Math.sin(a)], i * 2);
		skyTint[i] = f.skyTint;
	});

	return {
		t,
		skyTop,
		skyBottom,
		cloudDark,
		cloudLight,
		cloudCover,
		cloudTint,
		lightColor,
		lightDir,
		skyTint,
		count: n,
	};
}

function compileShader(
	gl: WebGL2RenderingContext,
	type: number,
	src: string,
): WebGLShader {
	const shader = gl.createShader(type);
	if (!shader) throw new Error("Failed to create shader");
	gl.shaderSource(shader, src);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Shader compile error: ${info}`);
	}
	return shader;
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertSrc: string,
	fragSrc: string,
): WebGLProgram {
	const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
	const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
	const program = gl.createProgram();
	if (!program) throw new Error("Failed to create program");
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		throw new Error(`Program link error: ${info}`);
	}
	return program;
}

interface UniformLocations {
	uResolution: WebGLUniformLocation | null;
	uTime: WebGLUniformLocation | null;
	uHour: WebGLUniformLocation | null;
	uSpeed: WebGLUniformLocation | null;
	uCoverageMul: WebGLUniformLocation | null;
	uStarBrightness: WebGLUniformLocation | null;
	uIridescence: WebGLUniformLocation | null;
	uDissipationSpeed: WebGLUniformLocation | null;
	uShadowAmount: WebGLUniformLocation | null;
	uTransition: WebGLUniformLocation | null;
	uKCount: WebGLUniformLocation | null;
	uKt: WebGLUniformLocation | null;
	uKSkyTop: WebGLUniformLocation | null;
	uKSkyBottom: WebGLUniformLocation | null;
	uKCloudDark: WebGLUniformLocation | null;
	uKCloudLight: WebGLUniformLocation | null;
	uKCloudCover: WebGLUniformLocation | null;
	uKCloudTint: WebGLUniformLocation | null;
	uKLightColor: WebGLUniformLocation | null;
	uKLightDir: WebGLUniformLocation | null;
	uKSkyTint: WebGLUniformLocation | null;
}

interface SkyBackgroundProps {
	/** When true, clouds thin out, the scene dims, and render cost drops
	 * (lower internal resolution + capped fps) to hand focus to foreground
	 * UI, e.g. a permissions screen. */
	transitioning?: boolean;
	/** Manual hour override (0-24). When set, this takes precedence over
	 * following the system clock. Ignored while `play` is true. */
	hourOverride?: number;
	/** Animate through a full day instead of showing a fixed/system hour. */
	play?: boolean;
}

function getSystemHour(): number {
	const now = new Date();
	return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

const SkyBackground: Component<SkyBackgroundProps> = (props) => {
	let canvasRef!: HTMLCanvasElement;
	let rafId = 0;
	const startTime = performance.now();

	// hour: follows the system clock by default; `hourOverride` or `play`
	// take precedence when provided.
	const [systemHour, setSystemHour] = createSignal(getSystemHour());
	const hour = () => {
		if (props.play) return playHour();
		if (props.hourOverride !== undefined) return props.hourOverride;
		return systemHour();
	};

	const [playHour, setPlayHour] = createSignal(getSystemHour());
	let playRafId = 0;
	createEffect(() => {
		if (props.play) {
			let last = performance.now();
			const tick = (now: number) => {
				const dt = (now - last) / 1000;
				last = now;
				setPlayHour((h) => (h + dt * PLAY_SPEED) % 24);
				playRafId = requestAnimationFrame(tick);
			};
			playRafId = requestAnimationFrame(tick);
			onCleanup(() => cancelAnimationFrame(playRafId));
		}
	});

	onMount(() => {
		const poll = setInterval(
			() => setSystemHour(getSystemHour()),
			SYSTEM_CLOCK_POLL_MS,
		);
		onCleanup(() => clearInterval(poll));
	});

	// transition: tween a 0/1 target driven by the `transitioning` prop.
	const [transitionTarget, setTransitionTarget] = createSignal(0);
	createEffect(() => setTransitionTarget(props.transitioning ? 1 : 0));
	const transition = createTween(transitionTarget, {
		duration: TRANSITION_DURATION_MS,
		ease: TRANSITION_EASE,
	});

	// fps counter, dev-mode only diagnostic (no UI in production)
	const [fps, setFps] = createSignal(0);

	onMount(() => {
		const canvas = canvasRef;
		const gl = canvas.getContext("webgl2", {
			antialias: false,
			alpha: false,
			powerPreference: "high-performance",
		});
		if (!gl) return;

		let program: WebGLProgram;
		try {
			program = createProgram(gl, VERT_SRC, fragSrc);
		} catch (err) {
			console.error(err);
			return;
		}
		gl.useProgram(program);

		const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
		const aPos = gl.getAttribLocation(program, "aPos");
		gl.enableVertexAttribArray(aPos);
		gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

		const kf = buildKeyframeArrays(KEYFRAMES);

		const u: UniformLocations = {
			uResolution: gl.getUniformLocation(program, "uResolution"),
			uTime: gl.getUniformLocation(program, "uTime"),
			uHour: gl.getUniformLocation(program, "uHour"),
			uSpeed: gl.getUniformLocation(program, "uSpeed"),
			uCoverageMul: gl.getUniformLocation(program, "uCoverageMul"),
			uStarBrightness: gl.getUniformLocation(program, "uStarBrightness"),
			uIridescence: gl.getUniformLocation(program, "uIridescence"),
			uDissipationSpeed: gl.getUniformLocation(program, "uDissipationSpeed"),
			uShadowAmount: gl.getUniformLocation(program, "uShadowAmount"),
			uTransition: gl.getUniformLocation(program, "uTransition"),
			uKCount: gl.getUniformLocation(program, "uKCount"),
			uKt: gl.getUniformLocation(program, "uKt"),
			uKSkyTop: gl.getUniformLocation(program, "uKSkyTop"),
			uKSkyBottom: gl.getUniformLocation(program, "uKSkyBottom"),
			uKCloudDark: gl.getUniformLocation(program, "uKCloudDark"),
			uKCloudLight: gl.getUniformLocation(program, "uKCloudLight"),
			uKCloudCover: gl.getUniformLocation(program, "uKCloudCover"),
			uKCloudTint: gl.getUniformLocation(program, "uKCloudTint"),
			uKLightColor: gl.getUniformLocation(program, "uKLightColor"),
			uKLightDir: gl.getUniformLocation(program, "uKLightDir"),
			uKSkyTint: gl.getUniformLocation(program, "uKSkyTint"),
		};

		gl.uniform1i(u.uKCount, kf.count);
		gl.uniform1fv(u.uKt, kf.t);
		gl.uniform3fv(u.uKSkyTop, kf.skyTop);
		gl.uniform3fv(u.uKSkyBottom, kf.skyBottom);
		gl.uniform1fv(u.uKCloudDark, kf.cloudDark);
		gl.uniform1fv(u.uKCloudLight, kf.cloudLight);
		gl.uniform1fv(u.uKCloudCover, kf.cloudCover);
		gl.uniform3fv(u.uKCloudTint, kf.cloudTint);
		gl.uniform3fv(u.uKLightColor, kf.lightColor);
		gl.uniform2fv(u.uKLightDir, kf.lightDir);
		gl.uniform1fv(u.uKSkyTint, kf.skyTint);

		// Internal render resolution drops during transition (on top of the DPR
		// cap) so the browser's bilinear upscale reads as a soft blur, and so
		// there are fewer pixels to shade while the background is secondary.
		function resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			const scale = transition() > 0.001 ? TRANSITION_RESOLUTION_SCALE : 1;
			const w = Math.round(canvas.clientWidth * dpr * scale);
			const h = Math.round(canvas.clientHeight * dpr * scale);
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
				gl?.viewport(0, 0, w, h);
			}
		}

		let lastFrameTime = performance.now();
		let fpsFrames = 0;
		let fpsLastReport = performance.now();

		function render(now: number) {
			// fps cap: normal speed unless a transition is in progress, in which
			// case we drop to TRANSITION_FPS since the background is secondary.
			const transitionAmount = transition();
			const capValue = transitionAmount > 0.001 ? TRANSITION_FPS : FPS_CAP;
			if (capValue > 0) {
				const minInterval = 1000 / capValue;
				const elapsed = now - lastFrameTime;
				if (elapsed < minInterval) {
					rafId = requestAnimationFrame(render);
					return;
				}
				lastFrameTime = now - (elapsed % minInterval);
			} else {
				lastFrameTime = now;
			}

			resize();
			const t = (performance.now() - startTime) / 1000;
			const driftSpeed =
				transitionAmount > 0.001 ? TRANSITION_DRIFT_SPEED : CLOUD_DRIFT_SPEED;

			if (!gl) return;
			gl.uniform2f(u.uResolution, canvas.width, canvas.height);
			gl.uniform1f(u.uTime, t);
			gl.uniform1f(u.uHour, hour());
			gl.uniform1f(u.uSpeed, driftSpeed);
			gl.uniform1f(u.uDissipationSpeed, CLOUD_DISSIPATION_SPEED);
			gl.uniform1f(u.uCoverageMul, CLOUD_COVERAGE);
			gl.uniform1f(u.uStarBrightness, STAR_BRIGHTNESS);
			gl.uniform1f(u.uIridescence, IRIDESCENCE);
			gl.uniform1f(u.uShadowAmount, CLOUD_SHADOW_AMOUNT);
			gl.uniform1f(u.uTransition, transitionAmount);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			if (import.meta.env.DEV) {
				fpsFrames++;
				if (now - fpsLastReport >= 500) {
					const measured = (fpsFrames * 1000) / (now - fpsLastReport);
					setFps(Math.round(measured));
					fpsFrames = 0;
					fpsLastReport = now;
				}
			}

			rafId = requestAnimationFrame(render);
		}
		rafId = requestAnimationFrame(render);

		onCleanup(() => {
			if (rafId) cancelAnimationFrame(rafId);
		});
	});

	return (
		<div
			style={{
				position: "relative",
				width: "100%",
				height: "100%",
				"min-height": "100vh",
				overflow: "hidden",
				background: "#050810",
			}}
		>
			<canvas
				ref={canvasRef}
				style={{
					position: "absolute",
					inset: 0,
					width: "100%",
					height: "100%",
					display: "block",
				}}
			/>

			{import.meta.env.DEV && (
				<span class="absolute text-xs top-14 left-3 w-20 text-center rounded-full z-2 font-mono text-white bg-black/30 border py-1 pointer-events-none">
					{fps()} FPS
				</span>
			)}
		</div>
	);
};

export default SkyBackground;
