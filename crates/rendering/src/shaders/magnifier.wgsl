struct MagnifierUniforms {
    center: vec2<f32>,
    radius: f32,
    zoom_amount: f32,
    shape_type: f32,
    glass_strength: f32,
    glass_radius: f32,
    frame_size: vec2<f32>,
    texture_size: vec2<f32>,
    border_width: f32,
    border_color: vec4<f32>,
    feather: f32,
};

@group(0) @binding(0) var<uniform> uniforms: MagnifierUniforms;
@group(0) @binding(1) var texture: texture_2d<f32>;
@group(0) @binding(2) var sample: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(-1.0, 1.0),
        vec2<f32>(1.0, -1.0),
        vec2<f32>(1.0, 1.0),
        vec2<f32>(-1.0, 1.0)
    );

    var out: VertexOutput;
    out.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    out.uv = (positions[vertex_index] + 1.0) * 0.5;
    return out;
}

fn sdf_circle(p: vec2<f32>, r: f32) -> f32 {
    return length(p) - r;
}

fn sdf_ellipse(p: vec2<f32>, r: vec2<f32>) -> f32 {
    let q = p / r;
    return length(q) - 1.0;
}

fn sdf_rounded_rectangle(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r);
    return max(min(q.x, q.y) + r, length(max(q, vec2<f32>(0.0))));
}

fn sdf_shape(p: vec2<f32>, shape_type: f32, radius: f32) -> f32 {
    if shape_type < 0.5 {
        return sdf_circle(p, radius);
    } else if shape_type < 1.5 {
        return sdf_ellipse(p, vec2<f32>(radius, radius * 0.75));
    } else {
        return sdf_rounded_rectangle(p, vec2<f32>(radius, radius), radius * 0.2);
    }
}

fn glass_displacement(p: vec2<f32>, center: vec2<f32>, strength: f32, radius: f32) -> vec2<f32> {
    let to_center = center - p;
    let dist = length(to_center);

    if dist < radius {
        let falloff = 1.0 - (dist / radius);
        let displacement = normalize(to_center) * strength * falloff * falloff;
        return displacement;
    }

    return vec2<f32>(0.0);
}

@fragment
fn fs_main(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = frag_coord.xy / uniforms.frame_size;
    let center_uv = uniforms.center / uniforms.frame_size;

    let to_center = uv - center_uv;
    let dist = length(to_center);

    let shape_dist = sdf_shape(to_center * uniforms.frame_size, uniforms.shape_type, uniforms.radius);
    let shape_mask = 1.0 - smoothstep(-uniforms.feather, uniforms.feather, shape_dist);

    if shape_mask < 0.001 {
        discard;
    }

    let glass_offset = glass_displacement(frag_coord.xy, uniforms.center, uniforms.glass_strength, uniforms.glass_radius);
    let displaced_uv = uv + glass_offset / uniforms.texture_size;

    var magnified_uv = center_uv + (displaced_uv - center_uv) / uniforms.zoom_amount;

    magnified_uv = clamp(magnified_uv, vec2<f32>(0.0), vec2<f32>(1.0));

    var color = textureSample(texture, sample, magnified_uv);

    let border_dist = abs(shape_dist);
    let border_mask = 1.0 - smoothstep(uniforms.border_width - uniforms.feather, uniforms.border_width + uniforms.feather, border_dist);

    if border_mask > 0.001 {
        color = mix(color, uniforms.border_color, border_mask * uniforms.border_color.a);
    }

    color.a *= shape_mask;

    return color;
}
