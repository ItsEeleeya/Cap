import {
	type Component,
	createEffect,
	createSignal,
	onCleanup,
	onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import blitFragSrc from "./sky-background.blit.frag.glsl?raw";
import fragSrc from "./sky-background.frag.glsl?raw";

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
		skyBottom: [0.0, 0.31, 0.6],
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

const DEFAULT_DRIFT_SPEED = 0.85;
const DEFAULT_DISSIPATION_SPEED = 2.0;
const DEFAULT_FPS_CAP = 0;
const DEFAULT_CLOUD_COVERAGE = 1.0;
const DEFAULT_STAR_BRIGHTNESS = 1.0;
const DEFAULT_STAR_SCALE = 1.0;
const IRIDESCENCE = 0.22;
const CLOUD_SHADOW_AMOUNT = 0.7;

const PLAY_SPEED = 0.9;
const SYSTEM_CLOCK_POLL_MS = 30_000;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function skyDarknessFromTop(skyTop: [number, number, number]): number {
	const luminance = (skyTop[0] + skyTop[1] + skyTop[2]) * 1.2;
	return 1.0 - Math.min(1, Math.max(0, luminance));
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
	skyDarkness: Float32Array;
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
	const skyDarkness = new Float32Array(n);

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
		skyDarkness[i] = skyDarknessFromTop(f.skyTop);
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
		skyDarkness,
		count: n,
	};
}

function interpolateSkyDarkness(hour: number): number {
	const h = Math.min(24, Math.max(0, hour));
	let i0 = 0;
	for (let i = 0; i < KEYFRAMES.length - 1; i++) {
		if (h >= KEYFRAMES[i].t && h <= KEYFRAMES[i + 1].t) {
			i0 = i;
			break;
		}
	}
	const i1 = i0 + 1;
	const kf0 = KEYFRAMES[i0];
	const kf1 = KEYFRAMES[i1];
	const span = Math.max(kf1.t - kf0.t, 0.0001);
	const f = Math.min(1, Math.max(0, (h - kf0.t) / span));
	const d0 = skyDarknessFromTop(kf0.skyTop);
	const d1 = skyDarknessFromTop(kf1.skyTop);
	return d0 + (d1 - d0) * f;
}

const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const DEFAULT_RENDER_SCALE = 0.5;
const RENDER_SCALE_STEPS = [0.3, 0.5, 0.8, 1] as const;

function quantizeRenderScale(scale: number): number {
	let closest: number = RENDER_SCALE_STEPS[0];
	let minDiff = Math.abs(scale - closest);
	for (const step of RENDER_SCALE_STEPS) {
		const diff = Math.abs(scale - step);
		if (diff < minDiff) {
			minDiff = diff;
			closest = step;
		}
	}
	return closest;
}

const CLOUD_RERENDER_INTERVAL_MS = 32;
const MAX_PHASE_DT_SEC = 1;

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

interface CloudUniformLocations {
	uResolution: WebGLUniformLocation | null;
	uTime: WebGLUniformLocation | null;
	uHour: WebGLUniformLocation | null;
	uDriftPhase: WebGLUniformLocation | null;
	uDissipationPhase: WebGLUniformLocation | null;
	uCoverageMul: WebGLUniformLocation | null;
	uIridescence: WebGLUniformLocation | null;
	uShadowAmount: WebGLUniformLocation | null;
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

interface BlitUniformLocations {
	uCloudTexture: WebGLUniformLocation | null;
	uResolution: WebGLUniformLocation | null;
	uTime: WebGLUniformLocation | null;
	uStarBrightness: WebGLUniformLocation | null;
	uStarScale: WebGLUniformLocation | null;
	uSkyDarkness: WebGLUniformLocation | null;
}

interface SkyBackgroundProps {
	driftSpeed?: number;
	dissipationSpeed?: number;
	cloudCoverage?: number;
	starBrightness?: number;
	starScale?: number;
	fpsCap?: number;
	renderScale?: number;
	hourOverride?: number;
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

	const [systemHour, setSystemHour] = createSignal(getSystemHour());

	// Once play has been engaged, the clock detaches from the system clock
	// for good - system time is only ever used for the initial, pre-play
	// load. Otherwise stopping play would snap back to whatever the real
	// wall clock says, which reads as time rewinding.
	const [everPlayed, setEverPlayed] = createSignal(false);
	const hour = () => {
		if (props.play || everPlayed()) return playHour();
		if (props.hourOverride !== undefined) return props.hourOverride;
		return systemHour();
	};

	const [playHour, setPlayHour] = createSignal(getSystemHour());
	let playRafId = 0;
	createEffect(() => {
		if (props.play) {
			setEverPlayed(true);
			let last = performance.now();
			const tick = (now: number) => {
				const dt = Math.min((now - last) / 1000, MAX_PHASE_DT_SEC);
				last = now;
				setPlayHour((h) => (h + dt * PLAY_SPEED) % 24);
				playRafId = requestAnimationFrame(tick);
			};
			playRafId = requestAnimationFrame(tick);

			const handlePlayVisibilityChange = () => {
				if (document.visibilityState === "visible") {
					last = performance.now();
				}
			};
			document.addEventListener("visibilitychange", handlePlayVisibilityChange);
			onCleanup(() => {
				cancelAnimationFrame(playRafId);
				document.removeEventListener(
					"visibilitychange",
					handlePlayVisibilityChange,
				);
			});
		}
	});

	onMount(() => {
		const poll = setInterval(
			() => setSystemHour(getSystemHour()),
			SYSTEM_CLOCK_POLL_MS,
		);
		onCleanup(() => clearInterval(poll));
	});

	const [fps, setFps] = createSignal(0);

	onMount(() => {
		const canvas = canvasRef;
		const gl = canvas.getContext("webgl2", {
			antialias: false,
			alpha: false,
			powerPreference: "high-performance",
		});
		if (!gl) return;

		let cloudProgram: WebGLProgram;
		let blitProgram: WebGLProgram;
		try {
			cloudProgram = createProgram(gl, VERT_SRC, fragSrc);
			blitProgram = createProgram(gl, VERT_SRC, blitFragSrc);
		} catch (err) {
			console.error(err);
			return;
		}

		const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, -1, 1, 1, -1, 1]);
		const buf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buf);
		gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

		function bindQuad(program: WebGLProgram) {
			const aPos = gl!.getAttribLocation(program, "aPos");
			gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
			gl!.enableVertexAttribArray(aPos);
			gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);
		}

		const kf = buildKeyframeArrays(KEYFRAMES);

		gl.useProgram(cloudProgram);
		const u: CloudUniformLocations = {
			uResolution: gl.getUniformLocation(cloudProgram, "uResolution"),
			uTime: gl.getUniformLocation(cloudProgram, "uTime"),
			uHour: gl.getUniformLocation(cloudProgram, "uHour"),
			uDriftPhase: gl.getUniformLocation(cloudProgram, "uDriftPhase"),
			uDissipationPhase: gl.getUniformLocation(
				cloudProgram,
				"uDissipationPhase",
			),
			uCoverageMul: gl.getUniformLocation(cloudProgram, "uCoverageMul"),
			uIridescence: gl.getUniformLocation(cloudProgram, "uIridescence"),
			uShadowAmount: gl.getUniformLocation(cloudProgram, "uShadowAmount"),
			uKCount: gl.getUniformLocation(cloudProgram, "uKCount"),
			uKt: gl.getUniformLocation(cloudProgram, "uKt"),
			uKSkyTop: gl.getUniformLocation(cloudProgram, "uKSkyTop"),
			uKSkyBottom: gl.getUniformLocation(cloudProgram, "uKSkyBottom"),
			uKCloudDark: gl.getUniformLocation(cloudProgram, "uKCloudDark"),
			uKCloudLight: gl.getUniformLocation(cloudProgram, "uKCloudLight"),
			uKCloudCover: gl.getUniformLocation(cloudProgram, "uKCloudCover"),
			uKCloudTint: gl.getUniformLocation(cloudProgram, "uKCloudTint"),
			uKLightColor: gl.getUniformLocation(cloudProgram, "uKLightColor"),
			uKLightDir: gl.getUniformLocation(cloudProgram, "uKLightDir"),
			uKSkyTint: gl.getUniformLocation(cloudProgram, "uKSkyTint"),
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

		gl.useProgram(blitProgram);
		const ub: BlitUniformLocations = {
			uCloudTexture: gl.getUniformLocation(blitProgram, "uCloudTexture"),
			uResolution: gl.getUniformLocation(blitProgram, "uResolution"),
			uTime: gl.getUniformLocation(blitProgram, "uTime"),
			uStarBrightness: gl.getUniformLocation(blitProgram, "uStarBrightness"),
			uStarScale: gl.getUniformLocation(blitProgram, "uStarScale"),
			uSkyDarkness: gl.getUniformLocation(blitProgram, "uSkyDarkness"),
		};
		gl.uniform1i(ub.uCloudTexture, 0);

		const cloudTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, cloudTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		const cloudFramebuffer = gl.createFramebuffer();

		let cloudTexWidth = 0;
		let cloudTexHeight = 0;

		function resize(): boolean {
			const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
			const w = Math.round(canvas.clientWidth * dpr);
			const h = Math.round(canvas.clientHeight * dpr);
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}

			const renderScale = quantizeRenderScale(
				props.renderScale ?? DEFAULT_RENDER_SCALE,
			);
			const tw = Math.max(1, Math.round(w * renderScale));
			const th = Math.max(1, Math.round(h * renderScale));
			if (tw !== cloudTexWidth || th !== cloudTexHeight) {
				cloudTexWidth = tw;
				cloudTexHeight = th;
				gl!.bindTexture(gl!.TEXTURE_2D, cloudTexture);
				gl!.texImage2D(
					gl!.TEXTURE_2D,
					0,
					gl!.RGBA8,
					tw,
					th,
					0,
					gl!.RGBA,
					gl!.UNSIGNED_BYTE,
					null,
				);
				return true;
			}
			return false;
		}

		let lastFrameTime = performance.now();
		let fpsFrames = 0;
		let fpsLastReport = performance.now();

		let driftPhase = 0;
		let dissipationPhase = 0;
		let lastPhaseTime = performance.now();

		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				lastPhaseTime = performance.now();
			}
		};
		document.addEventListener("visibilitychange", handleVisibilityChange);
		onCleanup(() =>
			document.removeEventListener("visibilitychange", handleVisibilityChange),
		);

		let lastCloudRenderTime = 0;

		function renderCloudPass(t: number) {
			if (!gl) return;
			gl.bindFramebuffer(gl.FRAMEBUFFER, cloudFramebuffer);
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0,
				gl.TEXTURE_2D,
				cloudTexture,
				0,
			);
			gl.viewport(0, 0, cloudTexWidth, cloudTexHeight);

			gl.useProgram(cloudProgram);
			bindQuad(cloudProgram);

			gl.uniform2f(u.uResolution, cloudTexWidth, cloudTexHeight);
			gl.uniform1f(u.uTime, t);
			gl.uniform1f(u.uHour, hour());
			gl.uniform1f(u.uDriftPhase, driftPhase);
			gl.uniform1f(u.uDissipationPhase, dissipationPhase);
			gl.uniform1f(
				u.uCoverageMul,
				props.cloudCoverage ?? DEFAULT_CLOUD_COVERAGE,
			);
			gl.uniform1f(u.uIridescence, IRIDESCENCE);
			gl.uniform1f(u.uShadowAmount, CLOUD_SHADOW_AMOUNT);
			gl.drawArrays(gl.TRIANGLES, 0, 6);

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		}

		function renderBlitPass(t: number) {
			if (!gl) return;
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.useProgram(blitProgram);
			bindQuad(blitProgram);
			gl.uniform2f(ub.uResolution, canvas.width, canvas.height);
			gl.uniform1f(ub.uTime, t);
			gl.uniform1f(
				ub.uStarBrightness,
				props.starBrightness ?? DEFAULT_STAR_BRIGHTNESS,
			);
			gl.uniform1f(ub.uStarScale, props.starScale ?? DEFAULT_STAR_SCALE);
			gl.uniform1f(ub.uSkyDarkness, interpolateSkyDarkness(hour()));
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, cloudTexture);
			gl.drawArrays(gl.TRIANGLES, 0, 6);
		}

		function render(now: number) {
			const capValue = props.fpsCap ?? DEFAULT_FPS_CAP;
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

			const phaseDt = Math.min((now - lastPhaseTime) / 1000, MAX_PHASE_DT_SEC);
			lastPhaseTime = now;
			driftPhase += phaseDt * (props.driftSpeed ?? DEFAULT_DRIFT_SPEED) * 0.006;
			dissipationPhase +=
				phaseDt * (props.dissipationSpeed ?? DEFAULT_DISSIPATION_SPEED) * 0.14;

			const wasReallocated = resize();
			const t = (performance.now() - startTime) / 1000;

			const isDue = now - lastCloudRenderTime >= CLOUD_RERENDER_INTERVAL_MS;
			if (isDue || wasReallocated) {
				renderCloudPass(t);
				lastCloudRenderTime = now;
			}

			renderBlitPass(t);

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
			<canvas ref={canvasRef} class="absolute block inset-0 size-full" />

			{import.meta.env.DEV && (
				<Portal mount={document.body}>
					<span class="absolute top-14 left-2 z-10 w-18 rounded-md text-center font-mono text-xs text-white bg-black/50 border p-px px-2 pointer-events-none">
						{fps()} fps
					</span>
				</Portal>
			)}
		</div>
	);
};

export default SkyBackground;
