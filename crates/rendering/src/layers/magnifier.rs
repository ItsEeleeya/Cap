use bytemuck::{Pod, Zeroable};
use cap_project::{MagnifierShape, XY};
use wgpu::util::DeviceExt;

use crate::ProjectUniforms;

pub struct MagnifierLayer {
    pipeline: MagnifierPipeline,
    sampler: wgpu::Sampler,
    uniform_buffer: wgpu::Buffer,
    cached_uniforms: Option<MagnifierUniforms>,
    pub active_magnifiers: Vec<MagnifierUniforms>,
}

impl MagnifierLayer {
    pub fn new(device: &wgpu::Device) -> Self {
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let uniform_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("Magnifier Uniform Buffer"),
            contents: bytemuck::cast_slice(&[MagnifierUniforms::default()]),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        Self {
            pipeline: MagnifierPipeline::new(device),
            sampler,
            uniform_buffer,
            cached_uniforms: None,
            active_magnifiers: Vec::new(),
        }
    }

    pub fn prepare(&mut self, queue: &wgpu::Queue, uniforms: &ProjectUniforms, time: f64) {
        self.active_magnifiers.clear();

        let magnifier_segments = uniforms
            .project
            .timeline
            .as_ref()
            .map(|t| t.magnifier_segments.as_slice())
            .unwrap_or(&[]);

        for segment in magnifier_segments {
            if !segment.enabled || time < segment.start || time > segment.end {
                continue;
            }

            let center_px = XY::new(
                segment.center.x * uniforms.output_size.0 as f64,
                segment.center.y * uniforms.output_size.1 as f64,
            );

            let radius_px = segment.radius * (uniforms.output_size.0 as f64).min(uniforms.output_size.1 as f64);
            let glass_radius_px = segment.glass_radius * (uniforms.output_size.0 as f64).min(uniforms.output_size.1 as f64);

            let border_color = parse_hex_color(&segment.border_color).unwrap_or([1.0, 1.0, 1.0, 1.0]);

            let magnifier_uniform = MagnifierUniforms {
                center: [center_px.x as f32, center_px.y as f32],
                radius: radius_px as f32,
                zoom_amount: segment.zoom_amount as f32,
                shape_type: shape_to_float(segment.shape),
                glass_strength: segment.glass_strength as f32,
                glass_radius: glass_radius_px as f32,
                frame_size: [uniforms.output_size.0 as f32, uniforms.output_size.1 as f32],
                texture_size: [uniforms.output_size.0 as f32, uniforms.output_size.1 as f32],
                border_width: segment.border_width,
                border_color,
                feather: segment.feather,
            };

            self.active_magnifiers.push(magnifier_uniform);
        }

        if !self.active_magnifiers.is_empty() {
            let first_uniform = self.active_magnifiers[0];
            if self.cached_uniforms.as_ref() != Some(&first_uniform) {
                queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[first_uniform]));
                self.cached_uniforms = Some(first_uniform);
            }
        }
    }

    pub fn render(
        &mut self,
        pass: &mut wgpu::RenderPass<'_>,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        source_texture: &wgpu::TextureView,
    ) {
        if self.active_magnifiers.is_empty() {
            return;
        }

        pass.set_pipeline(&self.pipeline.render_pipeline);
        
        for uniform in &self.active_magnifiers {
            queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(uniform));
            
            pass.set_bind_group(
                0,
                &self.pipeline.bind_group(
                    device,
                    &self.uniform_buffer,
                    source_texture,
                    &self.sampler,
                ),
                &[],
            );
            pass.draw(0..6, 0..1);
        }
    }
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable, Default, PartialEq)]
pub struct MagnifierUniforms {
    center: [f32; 2],
    radius: f32,
    zoom_amount: f32,
    shape_type: f32,
    glass_strength: f32,
    glass_radius: f32,
    frame_size: [f32; 2],
    texture_size: [f32; 2],
    border_width: f32,
    border_color: [f32; 4],
    feather: f32,
}

pub struct MagnifierPipeline {
    pub bind_group_layout: wgpu::BindGroupLayout,
    pub render_pipeline: wgpu::RenderPipeline,
}

impl MagnifierPipeline {
    pub fn new(device: &wgpu::Device) -> Self {
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Magnifier Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Magnifier Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("../shaders/magnifier.wgsl").into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Magnifier Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Magnifier Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions {
                    constants: &[],
                    zero_initialize_workgroup_memory: false,
                },
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8UnormSrgb,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions {
                    constants: &[],
                    zero_initialize_workgroup_memory: false,
                },
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            bind_group_layout,
            render_pipeline,
        }
    }

    pub fn bind_group(
        &self,
        device: &wgpu::Device,
        uniform_buffer: &wgpu::Buffer,
        texture_view: &wgpu::TextureView,
        sampler: &wgpu::Sampler,
    ) -> wgpu::BindGroup {
        device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Magnifier Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(texture_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(sampler),
                },
            ],
        })
    }
}

fn shape_to_float(shape: MagnifierShape) -> f32 {
    match shape {
        MagnifierShape::Circle => 0.0,
        MagnifierShape::Ellipse => 1.0,
        MagnifierShape::RoundedRectangle => 2.0,
    }
}

fn parse_hex_color(hex: &str) -> Option<[f32; 4]> {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 && hex.len() != 8 {
        return None;
    }

    let r = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let g = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let b = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
    let a = if hex.len() == 8 {
        u8::from_str_radix(&hex[6..8], 16).ok()? as f32 / 255.0
    } else {
        1.0
    };

    Some([r, g, b, a])
}