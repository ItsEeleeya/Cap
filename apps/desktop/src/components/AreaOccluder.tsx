import { XY } from "~/utils/tauri";
import { Size } from "./Cropper";

export default function AreaOccluder(props: {
  position: XY<number>;
  size: Size;
  containerSize: Size;
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
          height: `${size.height}px`,
          width: `${position.x}px`,
        }}
      />
      {/* Right Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          top: `${position.y}px`,
          left: `${position.x + size.width}px`,
          height: `${size.height}px`,
          width: `${containerSize.width - (position.x + size.width)}px`,
        }}
      />
      {/* Bottom Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          left: 0,
          right: 0,
          top: `${position.y + size.height}px`,
          height: `${containerSize.height - (position.y + size.height)}px`,
        }}
      />
    </>
  );
}