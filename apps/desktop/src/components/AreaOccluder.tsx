import { XY } from "~/utils/tauri";

export default function AreaOccluder(props: {
  position: XY<number>;
  size: XY<number>;
  containerSize: XY<number>;
}) {
  console.log(`Values: ${JSON.stringify(props)}`);

  return (
    <>
      {/* Top Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          left: 0,
          right: 0,
          top: 0,
          height: `${props.position.y}px`,
        }}
      />
      {/* Left Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          top: `${props.position.y}px`,
          left: 0,
          height: `${props.size.y}px`,
          width: `${props.position.x}px`,
        }}
      />
      {/* Right Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          top: `${props.position.y}px`,
          left: `${props.position.x + props.size.x}px`,
          height: `${props.size.y}px`,
          width: `${props.containerSize.x - (props.position.x + props.size.x)}px`,
        }}
      />
      {/* Bottom Overlay */}
      <div
        class="bg-[#0000008F] absolute"
        style={{
          left: 0,
          right: 0,
          top: `${props.position.y + props.size.y}px`,
          height: `${props.containerSize.y - (props.position.y + props.size.y)}px`,
        }}
      />
    </>
  );
}