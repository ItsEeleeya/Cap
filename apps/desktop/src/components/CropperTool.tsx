import { Component, createSignal, onMount, onCleanup } from 'solid-js';

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Handle {
  position: [number, number];
  constraints: [number, number, number, number];
  direction: string;
  cursor: string;
  isHovered: boolean;
}

const HANDLES: Omit<Handle, 'isHovered'>[] = [
  { position: [0.0, 0.0], constraints: [1, 0, 0, 1], direction: 'nw', cursor: 'nw-resize' },
  { position: [0.5, 0.0], constraints: [1, 0, 0, 0], direction: 'n', cursor: 'n-resize' },
  { position: [1.0, 0.0], constraints: [1, 1, 0, 0], direction: 'ne', cursor: 'ne-resize' },
  { position: [1.0, 0.5], constraints: [0, 1, 0, 0], direction: 'e', cursor: 'e-resize' },
  { position: [1.0, 1.0], constraints: [0, 1, 1, 0], direction: 'se', cursor: 'se-resize' },
  { position: [0.5, 1.0], constraints: [0, 0, 1, 0], direction: 's', cursor: 's-resize' },
  { position: [0.0, 1.0], constraints: [0, 0, 1, 1], direction: 'sw', cursor: 'sw-resize' },
  { position: [0.0, 0.5], constraints: [0, 0, 0, 1], direction: 'w', cursor: 'w-resize' }
];

interface Props {
  width?: number;
  height?: number;
  aspectRatio?: number;
  class?: string;
}

function createBox(x1: number, y1: number, x2: number, y2: number) {
  return {
    x1,
    y1,
    x2,
    y2,
    width() {
      return Math.abs(this.x2 - this.x1);
    },
    height() {
      return Math.abs(this.y2 - this.y1);
    },
    move(x: number | null, y: number | null) {
      if (x !== null) {
        const width = this.width();
        this.x1 = x;
        this.x2 = x + width;
      }
      if (y !== null) {
        const height = this.height();
        this.y1 = y;
        this.y2 = y + height;
      }
    },
    resize(newWidth: number, newHeight: number, origin = [0, 0]) {
      const fromX = this.x1 + (this.width() * origin[0]);
      const fromY = this.y1 + (this.height() * origin[1]);
      this.x1 = fromX - (newWidth * origin[0]);
      this.y1 = fromY - (newHeight * origin[1]);
      this.x2 = this.x1 + newWidth;
      this.y2 = this.y1 + newHeight;
    },
    constrainToBoundary(boundaryWidth: number, boundaryHeight: number, origin = [0, 0]) {
      const [originX, originY] = [
        this.x1 + this.width() * origin[0],
        this.y1 + this.height() * origin[1]
      ];
      
      const maxIfLeft = originX;
      const maxIfTop = originY;
      const maxIfRight = boundaryWidth - originX;
      const maxIfBottom = boundaryHeight - originY;
      
      const directionX = -2 * origin[0] + 1;
      const directionY = -2 * origin[1] + 1;
      
      let maxWidth = 0, maxHeight = 0;
      
      switch (directionX) {
        case -1: maxWidth = maxIfLeft; break;
        case 0: maxWidth = Math.min(maxIfLeft, maxIfRight) * 2; break;
        case +1: maxWidth = maxIfRight; break;
      }
      switch (directionY) {
        case -1: maxHeight = maxIfTop; break;
        case 0: maxHeight = Math.min(maxIfTop, maxIfBottom) * 2; break;
        case +1: maxHeight = maxIfBottom; break;
      }
      
      if (this.width() > maxWidth) {
        const factor = maxWidth / this.width();
        this.scale(factor, origin);
      }
      if (this.height() > maxHeight) {
        const factor = maxHeight / this.height();
        this.scale(factor, origin);
      }
    },
    scale(factor: number, origin = [0, 0]) {
      const newWidth = this.width() * factor;
      const newHeight = this.height() * factor;
      this.resize(newWidth, newHeight, origin);
    },
    constrainToRatio(ratio: number, origin = [0, 0], grow = 'height') {
      if (ratio === null) return;
      switch (grow) {
        case 'height':
          this.resize(this.width(), this.width() / ratio, origin);
          break;
        case 'width':
          this.resize(this.height() * ratio, this.height(), origin);
          break;
        default:
          this.resize(this.width(), this.width() / ratio, origin);
      }
    }
  };
}

function createFPSCounter() {
  let frames = 0;
  let lastTime = performance.now();
  let fps = 0;

  return {
    tick() {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = Math.round((frames * 1000) / (now - lastTime));
        frames = 0;
        lastTime = now;
      }
      return fps;
    }
  };
}

function createCanvasSelection(aspectRatio?: number) {
  const [box, setBox] = createSignal(createBox(100, 100, 300, 200));
  const [handles, setHandles] = createSignal<Handle[]>(
    HANDLES.map(h => ({ ...h, isHovered: false }))
  );
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal<{ x: number; y: number } | null>(null);
  const [activeHandle, setActiveHandle] = createSignal<Handle | null>(null);
  const [cursor, setCursor] = createSignal('default');
  const [fps, setFps] = createSignal(0);
  const fpsCounter = createFPSCounter();

  // Cache for handle animations
  const handleScales = new Map<string, number>();
  const HANDLE_ANIMATION_SPEED = 0.2;
  const HANDLE_HIT_AREA = 16; // Larger hit area
  const HANDLE_VISUAL_SIZE = 6; // Original visual size

  function updateHandleAnimations() {
    handles().forEach(handle => {
      const targetScale = handle.isHovered ? 1.5 : 1;
      const currentScale = handleScales.get(handle.direction) || 1;
      const newScale = currentScale + (targetScale - currentScale) * HANDLE_ANIMATION_SPEED;
      handleScales.set(handle.direction, newScale);
    });
  }

  function draw(ctx: CanvasRenderingContext2D) {
    const currentBox = box();
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    
    // Clear with composite operation for better performance
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw overlay with better performance
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Clear selection area
    ctx.clearRect(currentBox.x1, currentBox.y1, currentBox.width(), currentBox.height());
    
    // Draw selection border with glow and shadow
    // ctx.save();
    
    // Glow effect
    // ctx.strokeStyle = '#2196F3';
    // ctx.lineWidth = 2;
    // ctx.beginPath();
    // ctx.rect(currentBox.x1, currentBox.y1, currentBox.width(), currentBox.height());
    // ctx.stroke();
    
    // Inner glow
    ctx.strokeStyle = 'rgba(33, 150, 243, 0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // ctx.restore();

    // Draw handles with animations
    updateHandleAnimations();
    handles().forEach(handle => {
      const x = currentBox.x1 + handle.position[0] * currentBox.width();
      const y = currentBox.y1 + handle.position[1] * currentBox.height();
      const scale = handleScales.get(handle.direction) || 1;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      
      // Handle fill
      ctx.fillStyle = handle.isHovered ? '#1E88E5' : '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, HANDLE_VISUAL_SIZE, 0, Math.PI * 2);
      ctx.fill();
      
      // Handle border
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      ctx.restore();
    });

    // Rule of thirds (only when not dragging for performance)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      
      for (let i = 1; i < 3; i++) {
        const x = currentBox.x1 + (currentBox.width() * i) / 3;
        const y = currentBox.y1 + (currentBox.height() * i) / 3;
        
        ctx.beginPath();
        ctx.moveTo(x, currentBox.y1);
        ctx.lineTo(x, currentBox.y2);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(currentBox.x1, y);
        ctx.lineTo(currentBox.x2, y);
        ctx.stroke();
    }

    // Draw FPS counter when dragging
      const currentFps = fpsCounter.tick();
      setFps(currentFps);
      
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 70, 30);
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.fillText(`FPS: ${fps()}`, 20, 28);
      ctx.restore();

  }

  function getHandleAtPosition(x: number, y: number): Handle | null {
    const currentBox = box();
    
    for (const handle of handles()) {
      const hx = currentBox.x1 + handle.position[0] * currentBox.width();
      const hy = currentBox.y1 + handle.position[1] * currentBox.height();
      
      if (
        x >= hx - HANDLE_HIT_AREA &&
        x <= hx + HANDLE_HIT_AREA &&
        y >= hy - HANDLE_HIT_AREA &&
        y <= hy + HANDLE_HIT_AREA
      ) {
        return handle;
      }
    }
    return null;
  }

  function isPointInBox(x: number, y: number): boolean {
    const currentBox = box();
    return (
      x >= currentBox.x1 &&
      x <= currentBox.x2 &&
      y >= currentBox.y1 &&
      y <= currentBox.y2
    );
  }

  const handleMouseDown = (e: MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const handle = getHandleAtPosition(x, y);
    if (handle) {
      setActiveHandle(handle);
      setIsDragging(true);
      setDragStart({ x, y });
      return;
    }
    
    if (isPointInBox(x, y)) {
      setIsDragging(true);
      setDragStart({ x, y });
      setCursor('move');
    }
  };

  const handleMouseMove = (e: MouseEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (isDragging()) {
      const start = dragStart();
      if (!start) return;

      const deltaX = x - start.x;
      const deltaY = y - start.y;
      
      const currentBox = box();
      const newBox = createBox(currentBox.x1, currentBox.y1, currentBox.x2, currentBox.y2);
      
      const handle = activeHandle();
      if (handle) {
        let { x1, y1, x2, y2 } = currentBox;
        
        if (handle.constraints[0]) y1 = Math.min(y2 - 20, y1 + deltaY);
        if (handle.constraints[1]) x2 = Math.max(x1 + 20, x2 + deltaX);
        if (handle.constraints[2]) y2 = Math.max(y1 + 20, y2 + deltaY);
        if (handle.constraints[3]) x1 = Math.min(x2 - 20, x1 + deltaX);
        
        newBox.x1 = x1;
        newBox.y1 = y1;
        newBox.x2 = x2;
        newBox.y2 = y2;

        if (aspectRatio) {
          const isVerticalMovement = handle.constraints[0] || handle.constraints[2];
          newBox.constrainToRatio(aspectRatio, [0.5, 0.5], isVerticalMovement ? 'width' : 'height');
        }
      } else {
        newBox.move(
          Math.max(0, Math.min(canvas.width - newBox.width(), currentBox.x1 + deltaX)),
          Math.max(0, Math.min(canvas.height - newBox.height(), currentBox.y1 + deltaY))
        );
      }
      
      newBox.constrainToBoundary(canvas.width, canvas.height, [0.5, 0.5]);
      setBox(newBox);
      setDragStart({ x, y });
      return;
    }
    
    const hoveredHandle = getHandleAtPosition(x, y);
    setHandles(handles().map(h => ({
      ...h,
      isHovered: h.direction === hoveredHandle?.direction
    })));
    
    if (hoveredHandle) {
      setCursor(hoveredHandle.cursor);
    } else if (isPointInBox(x, y)) {
      setCursor('move');
    } else {
      setCursor('default');
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
    setActiveHandle(null);
    setCursor('default');
  };

  return {
    box,
    cursor,
    draw,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  };
}

export function CanvasSelection(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  const selection = createCanvasSelection(props.aspectRatio);

  onMount(() => {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    function render() {
      selection.draw(ctx!);
      animationFrame = requestAnimationFrame(render);
    }
    
    render();

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (canvasRef) selection.handleMouseMove(e, canvasRef);
    };
    const handleGlobalMouseUp = selection.handleMouseUp;

    document.addEventListener('mousemove', handleGlobalMouseMove);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    onCleanup(() => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    });
  });

  return (
    <canvas
      ref={canvasRef}
      width={props.width || 800}
      height={props.height || 600}
      class={`cursor-${selection.cursor()} ${props.class || ''}`}
      onMouseDown={(e) => canvasRef && selection.handleMouseDown(e, canvasRef)}
    />
  );
}