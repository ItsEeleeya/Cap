import { createEventListenerMap } from "@solid-primitives/event-listener";
import { createSignal, For, createMemo, createRoot, batch, onMount, JSX, onCleanup, createEffect } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { XY } from "~/utils/tauri";
import AreaOccluder from "./AreaOccluder";

export type Size = { width: number, height: number };

export type Direction = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
export type HandleSide = Partial<{
  x: "l" | "r" | "c", y: "t" | "b" | "c", cursor: string
}>;
export type CropArea = { position: XY<number>; size: Size };

export function createCropAreaStore(initial: CropArea = {
  position: { x: 0, y: 0 },
  size: { width: 100, height: 100 }
}): [get: CropArea, set: SetStoreFunction<CropArea>] {
  return createStore<CropArea>(initial);
}

type Props = {
  cropStore: [crop: CropArea, setCrop: SetStoreFunction<CropArea>];
  initialSize?: Size;
  minSize?: Size;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

function handleToDirection(handle: HandleSide): Direction {
  const directionX = handle.x === "l" ? "w" : handle.x === "r" ? "e" : "";
  const directionY = handle.y === "t" ? "n" : handle.y === "b" ? "s" : "";
  return (directionY + directionX) as Direction;
}

export default function Cropper(props: Props) {
  const minSize = props.minSize || { width: 100, height: 50 };
  const [crop, setCrop] = props.cropStore;

  let cropAreaRef: HTMLDivElement | null = null;
  let cropTargetRef: HTMLDivElement | null = null;

  const [containerSize, setContainerSize] = createSignal<Size>({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  onMount(() => {
    if (!cropAreaRef || !cropTargetRef) {
      console.error("Refs are not properly set");
      return;
    }

    const areaRect = cropAreaRef.getBoundingClientRect();
    console.log(`target client rect: ${JSON.stringify(areaRect)}`);
    
    setContainerSize({ width: areaRect.width, height: areaRect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === cropAreaRef) {
          const { width, height } = entry.contentRect;
          setContainerSize({ width, height });
        }
      }
    })
    resizeObserver.observe(cropAreaRef);
    onCleanup(() => resizeObserver.disconnect());

    if (props.initialSize) {
      const initial = props.initialSize!;
      batch(() => {
        setCrop("size", {
          width: clamp(initial.width, minSize.width, areaRect.width),
          height: clamp(initial.height, minSize.height, areaRect.height),
        });
        setCrop("position", {
          x: (areaRect.width - initial.width) / 2,
          y: (areaRect.height - initial.height) / 2,
        });
      });
    } else {
      batch(() => {
        setCrop("size", {
          width: areaRect.width / 2,
          height: areaRect.height / 2,
        });
        setCrop("position", {
          x: areaRect.width / 4,
          y: areaRect.height / 4,
        });
      });
    }
  });
  
  const [isDragging, setIsDragging] = createSignal(false);
  const [isResizing, setIsResizing] = createSignal(false);
  const [resizeDirection, setResizeDirection] = createSignal<string | null>(null);

  const styles = createMemo<JSX.CSSProperties>(() => ({
    left: `${(crop.position.x / containerSize().width) * 100}%`,
    top: `${(crop.position.y / containerSize().height) * 100}%`,
    width: `${(crop.size.width / containerSize().width) * 100}%`,
    height: `${(crop.size.height / containerSize().height) * 100}%`,
    cursor: isDragging() ? "grabbing" : "grab",
  }));

  const handleMouseMove = (e: MouseEvent) => batch(() => {
    const areaSize = containerSize();

    if (isDragging()) {
      setCrop("position", ({
        x: clamp(crop.position.x + e.movementX, 0, areaSize.width - crop.size.width),
        y: clamp(crop.position.y + e.movementY, 0, areaSize.height - crop.size.height),
      }));
    } else if (isResizing() && resizeDirection()) {
      const dir = resizeDirection()!;
      const { x: pos_x, y: pos_y } = crop.position;
      let newSize = { ...crop.size };
  
      if (dir.includes("e")) newSize.width = clamp(newSize.width + e.movementX, minSize.width, areaSize.width - pos_x);
      if (dir.includes("s")) newSize.height = clamp(newSize.height + e.movementY, minSize.height, areaSize.height - pos_y);
      if (dir.includes("w")) {
        const newWidth = clamp(newSize.width - e.movementX, minSize.width, pos_x + newSize.width);
        setCrop("position", { x: pos_x + (newSize.width - newWidth) });
        newSize.width = newWidth;
      }
      if (dir.includes("n")) {
        const newHeight = clamp(newSize.height - e.movementY, minSize.height, pos_y + newSize.height);
        setCrop("position", { y: pos_y + (newSize.height - newHeight) });
        newSize.height = newHeight;
      }
      setCrop("size", newSize);
    }
  });

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
      <AreaOccluder position={crop.position} size={crop.size} containerSize={containerSize()} />
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
            const areaSize = containerSize();
            createEventListenerMap(window, {
              mouseup: () => {
                setIsDragging(false);
                dispose()
              },
              mousedown: () => setIsDragging(true),
              mousemove: (moveEvent) => {
                const diff = {
                  x: ((moveEvent.clientX - downEvent.clientX) / cropAreaRef!.clientWidth) * areaSize.width,
                  y: ((moveEvent.clientY - downEvent.clientY) / cropAreaRef!.clientHeight) * areaSize.height,
                };

                setCrop("position", {
                  x: clamp(original.position.x + diff.x, 0, areaSize.width - crop.size.width),
                  y: clamp(original.position.y + diff.y, 0, areaSize.height - crop.size.height),
                });
              },
            });
          });
        }}
      >
        <div class="w-full h-full border border-dashed border-black-transparent-40 p-2" />
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
                class={`absolute ${isCorner ? "w-[26px] h-[26px] z-10" : "w-[24px] h-[24px]"} flex items-center justify-center`}
                style={{
                  ...(handle.x === "l" ? { left: "-12px" } : handle.x === "r" ? { right: "-12px" } : { left: "50%", transform: "translateX(-50%)" }),
                  ...(handle.y === "t" ? { top: "-12px" } : handle.y === "b" ? { bottom: "-12px" } : { top: "50%", transform: "translateY(-50%)" }),
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