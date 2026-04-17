#include <metal_stdlib>
#include <metal_imageblocks>
using namespace metal;

constant ushort LAYER_COUNT [[function_constant(0)]];

struct FragData { half4 color [[color(0)]]; };
struct VsOut { float4 position [[position]]; };

inline half4 blend_over(half4 dst, half4 src) {
    half inv = 1.0h - src.a;
    return half4(src.rgb * src.a + dst.rgb * inv, src.a + dst.a * inv);
}

inline half4 fetch_layer(uint2 pos,
                         texture2d<half, access::sample> t0,
                         texture2d<half, access::sample> t1,
                         texture2d<half, access::sample> t2,
                         texture2d<half, access::sample> t3,
                         texture2d<half, access::sample> t4,
                         texture2d<half, access::sample> t5,
                         texture2d<half, access::sample> t6,
                         texture2d<half, access::sample> t7,
                         ushort index) {
    switch (index) {
        case 0: return t0.read(pos);
        case 1: return t1.read(pos);
        case 2: return t2.read(pos);
        case 3: return t3.read(pos);
        case 4: return t4.read(pos);
        case 5: return t5.read(pos);
        case 6: return t6.read(pos);
        default: return t7.read(pos);
    }
}

kernel void composite_tile(imageblock<FragData> block,
                           texture2d<half, access::sample> t0 [[texture(0)]],
                           texture2d<half, access::sample> t1 [[texture(1)]],
                           texture2d<half, access::sample> t2 [[texture(2)]],
                           texture2d<half, access::sample> t3 [[texture(3)]],
                           texture2d<half, access::sample> t4 [[texture(4)]],
                           texture2d<half, access::sample> t5 [[texture(5)]],
                           texture2d<half, access::sample> t6 [[texture(6)]],
                           texture2d<half, access::sample> t7 [[texture(7)]],
                           ushort2 tid [[thread_position_in_threadgroup]],
                           ushort2 tile_id [[threadgroup_position_in_grid]],
                           ushort2 tile_size [[threads_per_threadgroup]]) {
    uint2 pos = uint2(tile_id) * uint2(tile_size) + uint2(tid);
    half4 accum = half4(0.0h);
    for (ushort i = 0; i < LAYER_COUNT; ++i) {
        accum = blend_over(accum, fetch_layer(pos, t0, t1, t2, t3, t4, t5, t6, t7, i));
    }
    block.write(FragData{accum}, tid);
}

vertex VsOut fullscreen_vertex(uint vid [[vertex_id]]) {
    float2 p[3] = {{-1.0, -1.0}, {3.0, -1.0}, {-1.0, 3.0}};
    VsOut out;
    out.position = float4(p[vid], 0.0, 1.0);
    return out;
}

fragment half4 blend_fragment(VsOut in [[stage_in]], texture2d<half, access::sample> layer [[texture(0)]]) {
    return layer.read(uint2(in.position.xy));
}
