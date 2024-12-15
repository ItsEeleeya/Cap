import { XY } from "~/utils/tauri";

export default function AreaOccluder(props: {
  position: XY<number>;
  size: XY<number>;
  containerSize: XY<number>;
}) {
  const { position, size, containerSize } = props;

  return (
    <>
      {/* Top Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: `${position.y}px`,
        }}
      />
      {/* Left Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          top: `${position.y}px`,
          left: 0,
          height: `${size.y}px`,
          width: `${position.x}px`,
        }}
      />
      {/* Right Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          top: `${position.y}px`,
          left: `${position.x + size.x}px`,
          height: `${size.y}px`,
          width: `${containerSize.x - (position.x + size.x)}px`,
        }}
      />
      {/* Bottom Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          left: 0,
          right: 0,
          top: `${position.y + size.y}px`,
          height: `${containerSize.y - (position.y + size.y)}px`,
        }}
      />
    </>
  );
}