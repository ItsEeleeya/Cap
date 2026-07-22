#version 300 es

// Cheap full-resolution pass: samples the low-res cloud/sky texture
// (rendered by sky-clouds.frag.glsl into an offscreen framebuffer at
// renderScale) with bilinear filtering, stretching it to the actual
// canvas size, and composites stars on top at full display resolution.
//
// Stars live here rather than in the cloud pass specifically so they stay
// crisp regardless of renderScale - they're cheap (a hash + radial
// falloff, no fBm), so there's no reason to pay for them at the cloud
// pass's low internal resolution and have them blurred in the upscale
// along with the expensive noise. This also means renderScale can be
// pushed much lower on secondary pages for a strong blur without stars
// degrading at all.

precision mediump float;

uniform sampler2D uCloudTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStarBrightness;
uniform float uStarScale;
// Precomputed CPU-side (see interpolateSkyDarkness in SkyBackground.tsx)
// from the same keyframe data the cloud shader's palette uses - this pass
// only has the cloud texture to sample, not the full palette, so this one
// scalar is passed in directly instead.
uniform float uSkyDarkness;

out vec4 fragColor;

// Scrambled hash for point grids (stars) - avoids the visible diagonal
// correlation a naive dot-product hash shows when sampled directly on an
// integer lattice.
float starHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec4 cloud = texture(uCloudTexture, uv);
    vec3 result = cloud.rgb;
    // Alpha carries "openness" (1 - cloud coverage) from the cloud pass, so
    // stars can be hidden under cloud cover without this pass needing any
    // cloud-density data of its own.
    float openness = cloud.a;

    // stars: small soft dots, sparse, night only, upper sky. Most are a
    // single point; a minority render larger by filling more of their cell,
    // using a radial falloff from the cell center rather than a flat
    // per-cell fill. Always at true display resolution (the base cell size
    // is a fixed pixel count, no renderScale compensation needed here) since
    // this pass runs at full canvas size regardless of the cloud texture's
    // resolution. uStarScale multiplies the cell size directly, so it scales
    // spacing and dot size together (a star's radius is defined relative to
    // its cell) rather than just inflating dots within a fixed grid, which
    // would look like overlapping or oddly-sparse stars at extreme values.
    if (uSkyDarkness > 0.05) {
        float starCell = 2.0 * uStarScale;
        vec2 cellCoord = gl_FragCoord.xy / starCell;
        vec2 gi = floor(cellCoord);
        vec2 cellUv = fract(cellCoord) - 0.5; // -0.5..0.5 within the cell

        float sh = starHash(gi);
        float sizeSeed = starHash(gi + 91.7);
        float starMask = step(0.978, sh);

        // most stars are tiny (radius ~0.18 of the cell), a rarer subset are a
        // bit bigger (~0.45), giving visible size variation instead of
        // uniform dots.
        float isBig = step(0.85, sizeSeed);
        float starRadius = mix(0.18, 0.45, isBig);
        float dot = 1.0 - smoothstep(starRadius * 0.4, starRadius, length(cellUv));

        float twinkle = 0.7 + 0.3 * sin(uTime * (0.35 + sh * 0.6) + sh * 80.0);
        float starB = starMask * dot * twinkle * uSkyDarkness * smoothstep(0.05, 0.4, uv.y) * openness * uStarBrightness;
        result += vec3(starB);
    }

    fragColor = vec4(result, 1.0);
}
