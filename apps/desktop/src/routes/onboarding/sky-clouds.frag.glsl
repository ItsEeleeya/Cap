#version 300 es

// Ported from "2D Clouds" by drift (Shadertoy 4tdSWr) - technique
// reimplemented (simplex noise, layered ridged/soft fBm with domain
// advection) and rewired to our time-of-day palette + tunable uniforms
// instead of fixed constants.
//
// Octave counts below (5/6/6/4/4, ~25 noise samples/pixel total) are cut
// down from the original port (7/8/8/7/7, ~37/pixel) - full-resolution
// rendering was too expensive for a background element on an M1 GPU. Cut
// proportionally more from the shading-detail passes (c/c1) than the
// shape-defining ones (r/f) since they matter less to the silhouette. The
// bigger cost reduction comes from SkyBackground.tsx rendering this shader
// into a small offscreen texture (renderScale) and reusing it across
// several display frames rather than rendering at full res every frame -
// see that file for details.

precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uHour;
uniform float uDriftPhase;
uniform float uDissipationPhase;
uniform float uCoverageMul;
uniform float uIridescence;
uniform float uShadowAmount;

#define MAXK 12
uniform int uKCount;
uniform float uKt[MAXK];
uniform vec3 uKSkyTop[MAXK];
uniform vec3 uKSkyBottom[MAXK];
uniform float uKCloudDark[MAXK];
uniform float uKCloudLight[MAXK];
uniform float uKCloudCover[MAXK];
uniform vec3 uKCloudTint[MAXK];
uniform vec3 uKLightColor[MAXK];
uniform vec2 uKLightDir[MAXK];
uniform float uKSkyTint[MAXK];

out vec4 fragColor;

struct Palette {
    vec3 skyTop;
    vec3 skyBottom;
    float cloudDark;
    float cloudLight;
    float cloudCover;
    vec3 cloudTint;
    vec3 lightColor;
    vec2 lightDir;
    float skyTint;
};

Palette getPalette(float hour) {
    float h = clamp(hour, 0.0, 24.0);
    int i0 = 0;
    for (int i = 0; i < MAXK - 1; i++) {
        if (i >= uKCount - 1) break;
        if (h >= uKt[i] && h <= uKt[i + 1]) {
            i0 = i;
            break;
        }
    }
    int i1 = i0 + 1;
    float span = max(uKt[i1] - uKt[i0], 0.0001);
    float f = smoothstep(0.0, 1.0, clamp((h - uKt[i0]) / span, 0.0, 1.0));
    Palette p;
    p.skyTop = mix(uKSkyTop[i0], uKSkyTop[i1], f);
    p.skyBottom = mix(uKSkyBottom[i0], uKSkyBottom[i1], f);
    p.cloudDark = mix(uKCloudDark[i0], uKCloudDark[i1], f);
    p.cloudLight = mix(uKCloudLight[i0], uKCloudLight[i1], f);
    p.cloudCover = mix(uKCloudCover[i0], uKCloudCover[i1], f);
    p.cloudTint = mix(uKCloudTint[i0], uKCloudTint[i1], f);
    p.lightColor = mix(uKLightColor[i0], uKLightColor[i1], f);
    p.lightDir = normalize(mix(uKLightDir[i0], uKLightDir[i1], f) + 1e-5);
    p.skyTint = mix(uKSkyTint[i0], uKSkyTint[i1], f);
    return p;
}

const float cloudscale = 1.1;
const float cloudalpha = 8.0;

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

// Cheap spectral ramp for faking thin-film iridescence - not physically
// accurate, just a smooth multi-hue gradient driven by a 0..1 phase.
vec3 spectral(float t) {
    vec3 c = vec3(
            abs(t * 6.0 - 3.0) - 1.0,
            2.0 - abs(t * 6.0 - 2.0),
            2.0 - abs(t * 6.0 - 4.0)
        );
    return clamp(c, 0.0, 1.0);
}

vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
}

float fbm(vec2 n) {
    float total = 0.0, amplitude = 0.1;
    for (int i = 0; i < 5; i++) {
        total += noise(n) * amplitude;
        n = m * n;
        amplitude *= 0.4;
    }
    return total;
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 p = fragCoord.xy / uResolution.xy;
    vec2 uv = p * vec2(uResolution.x / uResolution.y, 1.0);

    Palette pal = getPalette(uHour);

    // uDriftPhase is pre-integrated on the JS side (accumulated speed * dt
    // each frame), NOT derived here as uTime * speed. Multiplying raw
    // elapsed time by a live-changing speed would make the cloud position
    // jump whenever speed changes - e.g. after a fast burst settles back to
    // a low resting speed, uTime * speed would suddenly produce a *smaller*
    // value than the previous frame, which reads as clouds reversing
    // direction even though speed never went negative. Integrating speed
    // over time instead means position only ever moves smoothly, matching
    // whatever speed was in effect at each instant.
    float time = uDriftPhase;
    float q = fbm(uv * cloudscale * 0.5);

    // ridged noise shape
    float r = 0.0;
    vec2 uvR = uv * cloudscale;
    uvR -= q - time;
    float weight = 0.8;
    for (int i = 0; i < 6; i++) {
        r += abs(weight * noise(uvR));
        uvR = m * uvR + time;
        weight *= 0.7;
    }

    // soft noise shape
    float f = 0.0;
    vec2 uvF = p * vec2(uResolution.x / uResolution.y, 1.0);
    uvF *= cloudscale;
    uvF -= q - time;
    weight = 0.7;
    for (int i = 0; i < 6; i++) {
        f += weight * noise(uvF);
        uvF = m * uvF + time;
        weight *= 0.6;
    }

    f *= r + f;

    // colour detail noise
    float c = 0.0;
    float time2 = uDriftPhase * 1.6;
    vec2 uvC = p * vec2(uResolution.x / uResolution.y, 1.0);
    uvC *= cloudscale * 2.0;
    uvC -= q - time2;
    weight = 0.4;
    for (int i = 0; i < 4; i++) {
        c += weight * noise(uvC);
        uvC = m * uvC + time2;
        weight *= 0.6;
    }

    // ridge colour detail noise
    float c1 = 0.0;
    float time3 = uDriftPhase * 2.2;
    vec2 uvC1 = p * vec2(uResolution.x / uResolution.y, 1.0);
    uvC1 *= cloudscale * 3.0;
    uvC1 -= q - time3;
    weight = 0.4;
    for (int i = 0; i < 4; i++) {
        c1 += abs(weight * noise(uvC1));
        uvC1 = m * uvC1 + time3;
        weight *= 0.6;
    }

    c += c1;

    vec3 skycolour = mix(pal.skyBottom, pal.skyTop, p.y);

    // directional light lean: bias colour detail toward the light-facing side
    // so the cloud mass reads as lit from the current sun/moon direction.
    vec2 dirUv = (p - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
    float lightLean = clamp(dot(normalize(dirUv + 1e-5), pal.lightDir) * 0.5 + 0.5, 0.0, 1.0);

    // uShadowAmount controls how deep the gray/shadow side of clouds gets:
    // 1.0 = as designed, lower values lift the dark floor toward the lit
    // color (less gray), higher values deepen shadow further.
    float shadedDark = mix(pal.cloudLight * 0.92, pal.cloudDark, uShadowAmount);
    vec3 cloudBaseColour = pal.cloudTint * clamp((shadedDark + pal.cloudLight * c), 0.0, 1.0);
    vec3 cloudcolour = mix(cloudBaseColour, cloudBaseColour + pal.lightColor * 0.25, lightLean * 0.6);

    // vertical composition bias: push cloud mass toward the bottom of frame,
    // leaving open sky up top, like a towering cumulus reference photo rather
    // than a uniform overcast layer. p.y is 0 at bottom, 1 at top.
    float verticalBias = smoothstep(0.62, 0.08, p.y);
    verticalBias = mix(0.12, 1.35, verticalBias);

    float fFinal = ((pal.cloudCover * uCoverageMul) + cloudalpha * mix(1.0, uCoverageMul, 0.6) * f * r) * verticalBias;
    float coverage = clamp(fFinal + c * verticalBias, 0.0, 1.0);

    // edge dissipation: only near the cloud boundary (coverage close to the
    // threshold band), erode the mask with fast-scrolling fine noise so edges
    // visibly fray and dissolve rather than fading smoothly like the rest of
    // the cloud body. Uses its own phase (independent of uDriftPhase) so edges
    // can fray faster than the overall cloud drift.
    float edgeBand = 1.0 - abs(coverage - 0.5) * 2.0; // ~1 right at the boundary, ~0 deep inside/outside
    edgeBand = clamp(edgeBand, 0.0, 1.0);
    edgeBand = pow(edgeBand, 1.6);

    // Same integration fix as drift above: uDissipationPhase is pre-integrated
    // on the JS side rather than computed as uTime * uDissipationSpeed here.
    float erodeTime = uDissipationPhase;
    vec2 erodeUv = uv * cloudscale * 5.5 + vec2(erodeTime * 1.4, -erodeTime * 0.9);
    float erodeNoise = noise(erodeUv) * 0.5 + 0.5;
    float erosion = smoothstep(0.30, 0.75, erodeNoise);

    coverage = mix(coverage, coverage * erosion, edgeBand * 0.85);

    vec3 result = mix(skycolour, clamp(pal.skyTint * skycolour + cloudcolour, 0.0, 1.0), coverage);

    // iridescence: thin, subtle rainbow sheen right at the cloud boundary,
    // strongest on the light-facing edge (like real corona/iridescent clouds).
    // uIridescence is a 0..1(ish) intensity slider, 0 = fully off. Kept to a
    // narrow band right on the edge so it reads as a sheen, not a wide glow.
    if (uIridescence > 0.001) {
        float phase = fract(erodeNoise * 2.3 + c1 * 0.6 + uTime * 0.02);
        vec3 iri = spectral(phase);
        float tightBand = pow(edgeBand, 3.2);
        float iriMask = tightBand * clamp(lightLean * 1.3, 0.0, 1.0) * smoothstep(0.10, 0.30, coverage) * smoothstep(0.85, 0.45, coverage);
        result += iri * iriMask * uIridescence * 0.22;
    }

    // sun/moon shine: soft glow toward the light direction, visible through
    // open sky and gently haloing behind thin cloud. No hard disc.
    vec2 lightPoint = pal.lightDir * 0.62;
    float distLight = length(dirUv - lightPoint);
    float glowCore = exp(-distLight * 3.4) * 0.85;
    float glowHalo = exp(-distLight * 0.9) * 0.30;
    float glowTotal = (glowCore + glowHalo) * mix(1.0, 0.35, coverage);
    result += pal.lightColor * glowTotal;

    // Stars are intentionally NOT rendered here. They're cheap (no fBm, just
    // a hash + radial falloff) so there's no reason to pay for them at this
    // pass's low internal renderScale and blur them in the upscale along
    // with the expensive cloud noise - they're rendered separately in the
    // blit pass instead, at full display resolution, so they stay crisp
    // even when clouds are heavily downscaled/blurred (e.g. on secondary
    // pages where renderScale drops for performance). See
    // sky-clouds.blit.frag.glsl.
    //
    // "openness" (how clear the sky is at this pixel, i.e. not covered by
    // cloud) is written to the alpha channel so the blit pass - which only
    // has this texture to sample, not the palette or cloud density - can
    // still occlude stars under clouds and dim them appropriately.
    float openness = 1.0 - coverage;
    fragColor = vec4(result, openness);
}
