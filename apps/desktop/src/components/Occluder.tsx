import { XY } from "~/utils/tauri";

export default function Occluder(props: { position: XY<number>; size: XY<number> }) {
  return (
    <>
      {/* Top Overlay */}
      <div
        class="bg-[#0000008F] absolute inset-x-0 top-0"
        style={{ height: `${props.position.y}px` }}
      />
      {/* Left Overlay */}
      <div
        class="bg-[#0000008F] absolute left-0"
        style={{
          top: `${props.position.y}px`,
          height: `${props.size.y}px`,
          width: `${props.position.x}px`,
        }}
      />
      {/* Right Overlay */}
      <div
        class="bg-[#0000008F] absolute right-0"
        style={{
          top: `${props.position.y}px`,
          height: `${props.size.y}px`,
          width: `calc(100vw - ${props.position.x + props.size.x}px)`,
        }}
      />
      {/* Bottom Overlay */}
      <div
        class="bg-[#0000008F] absolute inset-x-0 bottom-0"
        style={{
          height: `calc(100vh - ${props.position.y + props.size.y}px)`,
        }}
      />
    </>
  );
};
