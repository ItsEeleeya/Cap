import { createEventListenerMap } from "@solid-primitives/event-listener";
import { createSignal, For, createMemo, createRoot, batch, onMount, onCleanup, type ParentProps, type JSX } from "solid-js";
import { createStore, SetStoreFunction } from "solid-js/store";
import { commands, type Crop, type XY } from "~/utils/tauri";
import AreaOccluder from "./AreaOccluder";
import { type as ostype } from "@tauri-apps/plugin-os";

type Direction = "n" | "e" | "s" | "w" | "nw" | "ne" | "se" | "sw";
type HandleSide = Partial<{
  x: "l" | "r" | "c", y: "t" | "b" | "c", cursor: string
}>;

export function createCropStore(initial: Crop = {
  position: { x: 0, y: 0 },
  size: { x: 100, y: 100 }
}): [get: Crop, set: SetStoreFunction<Crop>] {
  return createStore<Crop>(initial);
}

export function cropFloor({ position, size }: Crop): Crop {
  return {
    position: Object.fromEntries(Object.entries(position).map(([key, value]) => [key, Math.floor(value)])) as XY<number>,
    size: Object.fromEntries(Object.entries(size).map(([key, value]) => [key, Math.floor(value)])) as XY<number>,
  };
}

type Props = {
  cropStore: [crop: Crop, setCrop: SetStoreFunction<Crop>];
  gridLines?: boolean;
  mappedSize?: XY<number>; // Virtual size (like display or image size)
  aspectRatio?: number; // New prop for the aspect ratio
  initialSize?: XY<number>;
  minSize?: XY<number>;
};

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

function handleToDirection(handle: HandleSide): Direction {
  const directionX = handle.x === "l" ? "w" : handle.x === "r" ? "e" : "";
  const directionY = handle.y === "t" ? "n" : handle.y === "b" ? "s" : "";
  return (directionY + directionX) as Direction;
}

export default function Cropper(props: ParentProps<Props>) {
  const minSize: XY<number> = props.minSize || { x: 50, y: 50 };
  const [crop, setCrop] = props.cropStore;

  let cropAreaRef: HTMLDivElement | null = null;
  let cropTargetRef: HTMLDivElement | null = null;

  const [containerSize, setContainerSize] = createSignal<XY<number>>({ x: 0, y: 0 });
  const effectiveMappedSize = createMemo(() => props.mappedSize || containerSize());

  onMount(() => {
    if (!cropAreaRef || !cropTargetRef) {
      console.error("Refs are not properly set");
      return;
    }

    const areaRect = cropAreaRef.getBoundingClientRect();
    setContainerSize({ x: areaRect.width, y: areaRect.height });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === cropAreaRef) setContainerSize({
          x: entry.contentRect.width, y: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(cropAreaRef);
    onCleanup(() => resizeObserver.disconnect());

    const mappedSize = effectiveMappedSize();

    const initial = props.initialSize || { x: mappedSize.x / 2, y: mappedSize.y / 2 };
    let width = clamp(initial.x, minSize.x, mappedSize.x);
    let height = clamp(initial.y, minSize.y, mappedSize.y);

    const ratio = props.aspectRatio;
    if (ratio) {
      if (width / height > ratio) width = height * ratio;
      else height = width / ratio;
    }

    setCrop({
      size: { x: width, y: height },
      position: { x: (mappedSize.x - width) / 2, y: (mappedSize.y - height) / 2 }
    });
  });

  const [isDragging, setIsDragging] = createSignal(false);
  const [resizeDirection, setResizeDirection] = createSignal<Direction | null>(null);

  const scaledCrop = createMemo<Crop>(() => {
    const mappedSize = effectiveMappedSize();
    const container = containerSize();
    return {
      position: {
        x: (crop.position.x / mappedSize.x) * container.x,
        y: (crop.position.y / mappedSize.y) * container.y,
      },
      size: {
        x: (crop.size.x / mappedSize.x) * container.x,
        y: (crop.size.y / mappedSize.y) * container.y,
      },
    };
  });

  const styles = createMemo<JSX.CSSProperties>(() => {
    const mappedSize = effectiveMappedSize();
    return {
      left: `${(crop.position.x / mappedSize.x) * 100}%`,
      top: `${(crop.position.y / mappedSize.y) * 100}%`,
      width: `${(crop.size.x / mappedSize.x) * 100}%`,
      height: `${(crop.size.y / mappedSize.y) * 100}%`,
      cursor: isDragging() ? "grabbing" : "grab",
    };
  });

  let accumulatedChange = { x: 0, y: 0 };
  let hitEdge = { x: false, y: false };
  let hapticsEnabled = ostype() === "macos";

  const handleMouseMove = (e: MouseEvent) => batch(() => {
    const dir = resizeDirection();
    if (!dir) return;
    const mappedSize = effectiveMappedSize();
    const { x: posX, y: posY } = crop.position;
    let { x: newWidth, y: newHeight } = crop.size;
    const origin: XY<number> = { x: 0, y: 0 };

    if (dir.includes("w")) origin.x = 1;
    if (dir.includes("n")) origin.y = 1;
    if (dir.includes("e")) {
      newWidth = clamp(newWidth + (e.movementX / containerSize().x) * mappedSize.x, minSize.x, mappedSize.x - posX);
      if (newWidth >= mappedSize.x - posX) hitEdge.x = true;
      accumulatedChange.x += e.movementX;
    }
    if (dir.includes("s")) {
      newHeight = clamp(newHeight + (e.movementY / containerSize().y) * mappedSize.y, minSize.y, mappedSize.y - posY);
      accumulatedChange.y += e.movementY;
      if (newHeight >= mappedSize.y - posY) hitEdge.y = true;
    }
    if (dir.includes("w")) {
      const deltaWidth = (e.movementX / containerSize().x) * mappedSize.x;
      const adjustedWidth = clamp(newWidth - deltaWidth, minSize.x, posX + newWidth);
      newWidth = adjustedWidth;
      if (newWidth <= minSize.x) hitEdge.x = true;
    }
    if (dir.includes("n")) {
      const deltaHeight = (e.movementY / containerSize().y) * mappedSize.y;
      const adjustedHeight = clamp(newHeight - deltaHeight, minSize.y, posY + newHeight);
      newHeight = adjustedHeight;
      if (newHeight <= minSize.y) hitEdge.y = true;
      accumulatedChange.y += e.movementY;
    }

    if (props.aspectRatio) {
      constrainToRatio(props.aspectRatio, dir, { x: newWidth, y: newHeight }, origin);
      return;
    }

    // Ensure the selection remains within container boundaries
    const maxWidth = mappedSize.x - posX;
    const maxHeight = mappedSize.y - posY;
    newWidth = clamp(newWidth, minSize.x, maxWidth);
    newHeight = clamp(newHeight, minSize.y, maxHeight);

    resize(newWidth, newHeight, origin);

    if (hapticsEnabled) {
      const totalChange = Math.abs(accumulatedChange.x) + Math.abs(accumulatedChange.y);
      let shouldTrigger = false;
      if (totalChange >= 100) {
        shouldTrigger = true;
        accumulatedChange = { x: 0, y: 0 };
      }

      if (hitEdge.x || hitEdge.y) {
        shouldTrigger = true;
        hitEdge = { x: false, y: false };
      }

      if (shouldTrigger) commands.performHapticFeedback("Generic", "Now");
    }
  });

  function resize(newWidth: number, newHeight: number, origin: XY<number> = crop.position) {
    const fromX = crop.position.x + (crop.size.x * origin.x);
    const fromY = crop.position.y + (crop.size.y * origin.y);

    const newPosX = fromX - (newWidth * origin.x);
    const newPosY = fromY - (newHeight * origin.y);

    setCrop("position", { x: newPosX, y: newPosY });
    setCrop("size", { x: newWidth, y: newHeight });
  }

  function constrainToRatio(ratio: number, dir: Direction, size: XY<number>, origin: XY<number> = crop.position) {
    const growHeight = dir.includes("n") || dir.includes("s");
    if (growHeight) resize(size.x, size.x / ratio, origin);
    else resize(size.y, size.y / ratio, origin);
  };

  return (
    <div ref={(el) => (cropAreaRef = el)} class="relative w-full h-full overflow-hidden">
      <div class="-z-10">
        {props.children}
      </div>
      <AreaOccluder position={scaledCrop().position} size={scaledCrop().size} containerSize={containerSize()} />
      <div
        class="bg-transparent absolute cursor-grab"
        ref={(el) => (cropTargetRef = el)}
        style={styles()}
        onMouseDown={(event) => {
          event.stopPropagation();
          setIsDragging(true);
          const original = {
            position: { ...crop.position },
            size: { ...crop.size },
          };

          createRoot((dispose) => {
            const mappedSize = effectiveMappedSize();
            createEventListenerMap(window, {
              mouseup: () => {
                setIsDragging(false);
                dispose();
              },
              mousemove: (moveEvent) => {
                const diff = {
                  x: ((moveEvent.clientX - event.clientX) / cropAreaRef!.clientWidth) * mappedSize.x,
                  y: ((moveEvent.clientY - event.clientY) / cropAreaRef!.clientHeight) * mappedSize.y,
                };

                setCrop("position", {
                  x: clamp(original.position.x + diff.x, 0, mappedSize.x - crop.size.x),
                  y: clamp(original.position.y + diff.y, 0, mappedSize.y - crop.size.y),
                });
              },
            });
          });
        }}
      >
        <div class="absolute w-full h-full border border-dashed border-black-transparent-40" />
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
                class={`absolute ${isCorner ? "w-[26px] h-[26px]" : "w-[24px] h-[24px] pointer-events-none"} z-10 flex items-center justify-center group`}
                style={{
                  ...(handle.x === "l" ? { left: "-12px" } : handle.x === "r" ? { right: "-12px" } : { left: "50%", transform: "translateX(-50%)" }),
                  ...(handle.y === "t" ? { top: "-12px" } : handle.y === "b" ? { bottom: "-12px" } : { top: "50%", transform: "translateY(-50%)" }),
                  cursor: handle.cursor,
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setResizeDirection(handleToDirection(handle));

                  createRoot((dispose) => createEventListenerMap(window, {
                    mouseup: () => {
                      setResizeDirection(null);
                      dispose();
                    },
                    mousemove: handleMouseMove,
                  }));
                }}
              >
                <div class={`${isCorner ? "w-[8px] h-[8px]" : "w-[6px] h-[6px]"} bg-[#929292] border border-[#FFFFFF] rounded-full group-hover:scale-150 transition-transform duration-150`} />
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
              class="absolute hover:bg-black-transparent-10 transition-colors duration-300"
              style={{
                ...(side.x === "l" ? { left: "0", width: "12px" } : side.x === "r" ? { right: "0", width: "12px" } : { left: "0", right: "0" }),
                ...(side.y === "t" ? { top: "0", height: "12px" } : side.y === "b" ? { bottom: "0", height: "12px" } : { top: "0", bottom: "0" }),
                cursor: side.cursor,
              }}
              onMouseDown={(event) => {
                event.stopPropagation();
                setResizeDirection(
                  side.x === "l" ? "w" : side.x === "r" ? "e" : side.y === "t" ? "n" : side.y === "b" ? "s" : null
                );
                createRoot((dispose) => createEventListenerMap(window, {
                  mouseup: () => {
                    setResizeDirection(null);
                    dispose();
                  },
                  mousemove: handleMouseMove,
                }));
              }}
            />
          )}
        </For>
      </div>
    </div>
  );
}
