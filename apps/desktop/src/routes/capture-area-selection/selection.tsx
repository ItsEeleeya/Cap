import { createSignal, onCleanup, For, onMount } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

type Position = { x: number; y: number };
type Size = { width: number; height: number };
type Direction = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

export default function () {
  const [position, setPosition] = createSignal<Position>({
    x: window.innerWidth / 4,
    y: window.innerHeight / 4,
  });
  const [size, setSize] = createSignal<Size>({
    width: window.innerWidth / 2,
    height: window.innerHeight / 2,
  });
  const [isDragging, setIsDragging] = createSignal(false);
  const [isResizing, setIsResizing] = createSignal(false);
  const [resizeDirection, setResizeDirection] = createSignal<Direction | null>(null);

  let selectionRef: HTMLDivElement | undefined;

  // dragging and resizing
  const onMouseMove = (e: MouseEvent) => {
    if (isDragging()) {
      setPosition((prev) => ({
        x: clamp(prev.x + e.movementX, 0, window.innerWidth - size().width),
        y: clamp(prev.y + e.movementY, 0, window.innerHeight - size().height),
      }));
    } else if (isResizing() && resizeDirection()) {
      const dir = resizeDirection();
      setSize((prevSize) => {
        const newSize = { ...prevSize };
        const { x, y } = position();

        if (dir?.includes("e")) newSize.width = clamp(newSize.width + e.movementX, 10, window.innerWidth - x);
        if (dir?.includes("s")) newSize.height = clamp(newSize.height + e.movementY, 10, window.innerHeight - y);

        if (dir?.includes("w")) {
          const newWidth = clamp(newSize.width - e.movementX, 10, x + newSize.width);
          setPosition((prev) => ({ ...prev, x: prev.x + (newSize.width - newWidth) }));
          newSize.width = newWidth;
        }
        if (dir?.includes("n")) {
          const newHeight = clamp(newSize.height - e.movementY, 10, y + newSize.height);
          setPosition((prev) => ({ ...prev, y: prev.y + (newSize.height - newHeight) }));
          newSize.height = newHeight;
        }

        return newSize;
      });
    }
  };

  // reset drag and resize states
  const onMouseUp = () => {
    setIsDragging(false);
    setIsResizing(false);
    setResizeDirection(null);
  };

  onMount(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    onCleanup(() => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    });
  });

  return (
    <div
      ref={selectionRef}
      style={{
        position: "absolute",
        left: `${position().x}px`,
        top: `${position().y}px`,
        width: `${size().width}px`,
        height: `${size().height}px`,
        border: "2px dashed #4A90E2",
        cursor: isDragging() ? "move" : "default",
        background: "rgba(74, 144, 226, 0.2)",
      }}
      onMouseDown={(e) => {
        if (e.target === selectionRef) setIsDragging(true);
      }}
    >
      {/* Resizing handles */}
      <For each={resizeHandles}>
        {(dir, _idx) => <div
          style={{
            position: "absolute",
            ...handleStyle[dir],
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsResizing(true);
            setResizeDirection(dir);
          }}
        />}
      </For>
    </div>
  );
};

const handleStyle: Record<Direction, JSX.CSSProperties> = {
  nw: { top: "-7px", left: "-7px", width: "14px", height: "14px", cursor: "nw-resize", background: "#4A90E2" },
  ne: { top: "-7px", right: "-7px", width: "14px", height: "14px", cursor: "ne-resize", background: "#4A90E2" },
  se: { bottom: "-7px", right: "-7px", width: "14px", height: "14px", cursor: "se-resize", background: "#4A90E2" },
  sw: { bottom: "-7px", left: "-7px", width: "14px", height: "14px", cursor: "sw-resize", background: "#4A90E2" },
  n: { top: "-7px", left: "50%", transform: "translateX(-50%)", width: "14px", height: "7px", cursor: "n-resize", background: "#4A90E2" },
  e: { top: "50%", right: "-7px", transform: "translateY(-50%)", width: "7px", height: "14px", cursor: "e-resize", background: "#4A90E2" },
  s: { bottom: "-7px", left: "50%", transform: "translateX(-50%)", width: "14px", height: "7px", cursor: "s-resize", background: "#4A90E2" },
  w: { top: "50%", left: "-7px", transform: "translateY(-50%)", width: "7px", height: "14px", cursor: "w-resize", background: "#4A90E2" },
};

const resizeHandles: Direction[] = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
