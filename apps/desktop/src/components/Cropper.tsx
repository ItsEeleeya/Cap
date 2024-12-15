import { createEventListenerMap } from "@solid-primitives/event-listener";
import { createSignal, For, createMemo, createRoot, batch, onMount, JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { XY } from "~/utils/tauri";
import Occluder from "./Occluder";

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export default function Cropper() {
  const [crop, setCrop] = createStore<{ position: XY<number>; size: XY<number> }>({
    position: { x: 0, y: 0 },
    size: { x: 100, y: 100 },
  });

  const size = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  let cropAreaRef: HTMLDivElement | null = null;
  let cropTargetRef: HTMLDivElement | null = null;

  onMount(() => {
    if (!cropAreaRef || !cropTargetRef) console.error("Refs are not properly set");
  });

  const MIN_SIZE = 100;

  type Direction = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
  type HandleSide = Partial<{
    x: "l" | "r" | "c", y: "t" | "b" | "c", cursor: string
  }>;

  const [isDragging, setIsDragging] = createSignal(false);
  const [isResizing, setIsResizing] = createSignal(false);
  const [resizeDirection, setResizeDirection] = createSignal<string | null>(null);

  const styles = createMemo<JSX.CSSProperties>(() => ({
    left: `${(crop.position.x / size.width) * 100}%`,
    top: `${(crop.position.y / size.height) * 100}%`,
    width: `${(crop.size.x / size.width) * 100}%`,
    height: `${(crop.size.y / size.height) * 100}%`,
    cursor: isDragging() ? "grabbing" : "grab",
  }));

  function handleToDirection(handle: HandleSide): Direction {
    const directionX = handle.x === "l" ? "w" : handle.x === "r" ? "e" : "";
    const directionY = handle.y === "t" ? "n" : handle.y === "b" ? "s" : "";
    return (directionY + directionX) as Direction;
  }

  function handleMouseMove(e: MouseEvent) {
    if (isDragging()) {
      setCrop("position", ({
        x: clamp(crop.position.x + e.movementX, 0, size.width - crop.size.x),
        y: clamp(crop.position.y + e.movementY, 0, size.height - crop.size.y),
      }));
    } else if (isResizing() && resizeDirection()) {
      const dir = resizeDirection()!;
      const { x: pos_x, y: pos_y } = crop.position;
      let newSize = { ...crop.size };

      if (dir.includes("e")) newSize.x = clamp(newSize.x + e.movementX, MIN_SIZE, window.innerWidth - pos_x);
      if (dir.includes("s")) newSize.y = clamp(newSize.y + e.movementY, MIN_SIZE, window.innerHeight - pos_y);
      if (dir.includes("w")) {
        const newWidth = clamp(newSize.x - e.movementX, MIN_SIZE, pos_x + newSize.x);
        setCrop("position", { x: pos_x + (newSize.x - newWidth) });
        newSize.x = newWidth;
      }
      if (dir.includes("n")) {
        const newHeight = clamp(newSize.y - e.movementY, MIN_SIZE, pos_y + newSize.y);
        setCrop("position", { y: pos_y + (newSize.y - newHeight) });
        newSize.y = newHeight;
      }

      setCrop("size", newSize);
    }
  }

  onMount(() => {
    createEventListenerMap(window, {
      mousemove: handleMouseMove,
      mouseup: () => {
        setResizeDirection(null);
        setIsDragging(false);
        setIsResizing(false);
      },
    });
  });

  return (
    <div ref={(el) => (cropAreaRef = el)} class="relative w-full h-full">
      <Occluder position={crop.position} size={crop.size} />
      <div
        class="bg-transparent absolute cursor-grab"
        ref={(el) => (cropTargetRef = el)}
        style={styles()}
        onMouseDown={(downEvent) => {
          const original = {
            position: { ...crop.position },
            size: { ...crop.size },
          };

          createRoot((dispose) => {
            createEventListenerMap(window, {
              mouseup: () => {
                setIsDragging(false);
                dispose()
              },
              mousedown: () => setIsDragging(true),
              mousemove: (moveEvent) => {
                const diff = {
                  x: ((moveEvent.clientX - downEvent.clientX) / cropAreaRef!.clientWidth) * size.width,
                  y: ((moveEvent.clientY - downEvent.clientY) / cropAreaRef!.clientHeight) * size.height,
                };

                setCrop("position", {
                  x: clamp(original.position.x + diff.x, 0, size.width - crop.size.x),
                  y: clamp(original.position.y + diff.y, 0, size.height - crop.size.y),
                });
              },
            });
          });
        }}
      >
        <div class="w-full h-full border border-dashed border-black-transparent-10 p-2" />
        {/* Resize handles */}
        <For
          each={[
            { x: "l", y: "t", cursor: "nwse-resize" },
            { x: "r", y: "t", cursor: "nesw-resize" },
            { x: "l", y: "b", cursor: "nesw-resize" },
            { x: "r", y: "b", cursor: "nwse-resize" },
            { x: "c", y: "t", cursor: "ns-resize" },
            { x: "c", y: "b", cursor: "ns-resize" },
            { x: "l", y: "c", cursor: "ew-resize" },
            { x: "r", y: "c", cursor: "ew-resize" },
          ] satisfies HandleSide[]}
        >
          {(handle) => {
            const isCorner = handle.x !== "c" && handle.y !== "c";

            return (
              <div
                class={`absolute ${isCorner ? "w-[24px] h-[24px] z-10" : "w-[20px] h-[20px]"} flex items-center justify-center`}
                style={{
                  ...(handle.x === "l" ? { left: "-10px" } : handle.x === "r" ? { right: "-10px" } : { left: "50%", transform: "translateX(-50%)" }),
                  ...(handle.y === "t" ? { top: "-10px" } : handle.y === "b" ? { bottom: "-10px" } : { top: "50%", transform: "translateY(-50%)" }),
                  cursor: handle.cursor,
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setIsResizing(true);
                  setResizeDirection(handleToDirection(handle));
                }}
              >
                <div class={`${isCorner ? "w-[8px] h-[8px]" : "w-[6px] h-[6px]"} bg-[#929292] border border-[#FFFFFF] rounded-full`} />
              </div>
            );
          }}
        </For>

        {/* Side Handles */}
        <For
          each={[
            { x: "l", cursor: "ew-resize" }, // Left
            { x: "r", cursor: "ew-resize" }, // Right
            { y: "t", cursor: "ns-resize" }, // Top
            { y: "b", cursor: "ns-resize" }, // Bottom
          ]}
        >
          {(side) => (
            <div
              class="absolute"
              style={{
                ...(side.x === "l" ? { left: "0", width: "12px" } : side.x === "r" ? { right: "0", width: "12px" } : { left: "0", right: "0" }),
                ...(side.y === "t" ? { top: "0", height: "12px" } : side.y === "b" ? { bottom: "0", height: "12px" } : { top: "0", bottom: "0" }),
                cursor: side.cursor,
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                setIsResizing(true);
                setResizeDirection(
                  side.x === "l" ? "w" : side.x === "r" ? "e" : side.y === "t" ? "n" : side.y === "b" ? "s" : null
                );
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}