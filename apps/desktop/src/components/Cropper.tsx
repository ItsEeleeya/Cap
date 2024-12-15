import { createEventListenerMap } from "@solid-primitives/event-listener";
import { createSignal, For, createMemo, createRoot, batch, onMount, JSX, onCleanup, createEffect } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { Crop, XY } from "~/utils/tauri";
import AreaOccluder from "./AreaOccluder";

export type Direction = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
export type HandleSide = Partial<{
  x: "l" | "r" | "c", y: "t" | "b" | "c", cursor: string
}>;

export function createCropStore(initial: Crop = {
  position: { x: 0, y: 0 },
  size: { x: 100, y: 100 }
}): [get: Crop, set: SetStoreFunction<Crop>] {
  return createStore<Crop>(initial);
}

type Props = {
  cropStore: [crop: Crop, setCrop: SetStoreFunction<Crop>];
  initialSize?: XY<number>;
  minSize?: XY<number>;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

function handleToDirection(handle: HandleSide): Direction {
  const directionX = handle.x === "l" ? "w" : handle.x === "r" ? "e" : "";
  const directionY = handle.y === "t" ? "n" : handle.y === "b" ? "s" : "";
  return (directionY + directionX) as Direction;
}

export default function Cropper(props: Props) {
  const minSize: XY<number> = props.minSize || { x: 100, y: 50 };
  const [crop, setCrop] = props.cropStore;

  let cropAreaRef: HTMLDivElement | null = null;
  let cropTargetRef: HTMLDivElement | null = null;

  const [containerSize, setContainerSize] = createSignal<XY<number>>({ x: 1000, y: 100 });

  onMount(() => {
    if (!cropAreaRef || !cropTargetRef) {
      console.error("Refs are not properly set");
      return;
    }

    const areaRect = cropAreaRef.getBoundingClientRect();
    console.log(`target client rect: ${JSON.stringify(areaRect)}`);
    
    setContainerSize({ x: areaRect.width, y: areaRect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === cropAreaRef) {
          const { width, height } = entry.contentRect;
          setContainerSize({ x: width, y: height });
        }
      }
    })
    resizeObserver.observe(cropAreaRef);
    onCleanup(() => resizeObserver.disconnect());

    if (props.initialSize) {
      const initial = props.initialSize!;
      batch(() => {
        setCrop("size", {
          x: clamp(initial.x, minSize.x, areaRect.width),
          y: clamp(initial.y, minSize.y, areaRect.height),
        });
        setCrop("position", {
          x: (areaRect.width - initial.x) / 2,
          y: (areaRect.height - initial.y) / 2,
        });
      });
    } else {
      batch(() => {
        setCrop("size", {
          x: areaRect.width / 2,
          y: areaRect.height / 2,
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
    left: `${(crop.position.x / containerSize().x) * 100}%`,
    top: `${(crop.position.y / containerSize().y) * 100}%`,
    width: `${(crop.size.x / containerSize().x) * 100}%`,
    height: `${(crop.size.y / containerSize().y) * 100}%`,
    cursor: isDragging() ? "grabbing" : "grab",
  }));

  const handleMouseMove = (e: MouseEvent) => batch(() => {
    const areaSize = containerSize();

    if (isDragging()) {
      setCrop("position", ({
        x: clamp(crop.position.x + e.movementX, 0, areaSize.x - crop.size.x),
        y: clamp(crop.position.y + e.movementY, 0, areaSize.y - crop.size.y),
      }));
    } else if (isResizing() && resizeDirection()) {
      const dir = resizeDirection()!;
      const { x: pos_x, y: pos_y } = crop.position;
      let newSize = { ...crop.size };
  
      if (dir.includes("e")) newSize.x = clamp(newSize.x + e.movementX, minSize.x, areaSize.x - pos_x);
      if (dir.includes("s")) newSize.y = clamp(newSize.y + e.movementY, minSize.y, areaSize.y - pos_y);
      if (dir.includes("w")) {
        const newWidth = clamp(newSize.x - e.movementX, minSize.x, pos_x + newSize.x);
        setCrop("position", { x: pos_x + (newSize.x - newWidth) });
        newSize.x = newWidth;
      }
      if (dir.includes("n")) {
        const newHeight = clamp(newSize.y - e.movementY, minSize.y, pos_y + newSize.y);
        setCrop("position", { y: pos_y + (newSize.y - newHeight) });
        newSize.y = newHeight;
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
                  x: ((moveEvent.clientX - downEvent.clientX) / cropAreaRef!.clientWidth) * areaSize.x,
                  y: ((moveEvent.clientY - downEvent.clientY) / cropAreaRef!.clientHeight) * areaSize.y,
                };

                setCrop("position", {
                  x: clamp(original.position.x + diff.x, 0, areaSize.x - crop.size.x),
                  y: clamp(original.position.y + diff.y, 0, areaSize.y - crop.size.y),
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