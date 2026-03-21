import { children, ComponentProps, JSX, ParentProps, splitProps } from "solid-js";
import { createDerivedSpring, createSpring } from "@solid-primitives/spring";
import { cx } from "cva";
import { createWindowFocus } from "~/routes/debug-library";
import { createSignal } from "solid-js";
import { motion } from "motion-solid";

export function MaterialLayer(props: ParentProps<{
  class: string,
}>) {
  const resolved = children(() => props.children);
  const focused = createWindowFocus();
  return (
    <div
      data-tauri-drag-region
      class={cx(props.class, focused() ? "apple-glass-adaptive" : "apple-glass-subdued")}>
      {resolved()}
    </div>
  );
}

type GlassMaterialKind = "normal" | "clear" | "subdued" | "adaptive";

export function GlassEffectContainer(props: ParentProps<{
  as?: keyof JSX.HTMLElementTags;
  kind?: GlassMaterialKind,
  focusAware?: boolean,
  elasticity?: boolean,
  class: string,
}>) {
  const resolved = children(() => props.children);
  const focused = createWindowFocus();

  return (
    <ElasticSurface
      class={cx(props.class, focused() ? "apple-glass-adaptive" : "apple-glass-subdued")}>
      {resolved()}
    </ElasticSurface>
  );
}

export function ElasticSurface(props: ComponentProps<typeof motion.div>) {
  let ref!: HTMLDivElement;

  const [target, setTarget] = createSignal({
    tx: 0,
    ty: 0,
    sx: 1,
    sy: 1,
  });
  const [hovering, setHovering] = createSignal(false);

  const tx = createDerivedSpring(() => target().tx, { stiffness: 300, damping: 25 });
  const sx = createDerivedSpring(() => target().sx, { stiffness: 300, damping: 20 });
  const ty = createDerivedSpring(() => target().ty, { stiffness: 300, damping: 25 });
  const sy = createDerivedSpring(() => target().sy, { stiffness: 300, damping: 20 });

  function onMove(e: PointerEvent) {
    if (!hovering) return;
    const { x, y, nx, ny } = getRelative(ref, e);

    // 🧲 translation (magnetic pull)
    const tx = nx * 10;
    const ty = ny * 10;

    // 🧠 directional stretch
    const stretch = 0.06;

    const sx = 1 + Math.abs(nx) * stretch;
    const sy = 1 + Math.abs(ny) * stretch;

    setTarget({ tx, ty, sx, sy });
  }

  function reset() {
    setTarget({ tx: 0, ty: 0, sx: 1, sy: 1 });
    setHovering(false);
  }

  return (
    <motion.div
      {...props}
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerUp={reset}
      onPointerDown={() => {
        setHovering(true);
        setTarget(t => ({
          ...t,
          sx: t.sx * 1.25,
          sy: t.sy * 1.25,
        }));
      }}
      style={{
        "will-change": "transform",
      }}
      animate={{
        transform: `translate(${tx()}px, ${ty()}px) scale(${sx()}, ${sy()})`,
      }}
    >
    </motion.div>
  );
}

function getRelative(el: HTMLElement, e: PointerEvent) {
  const r = el.getBoundingClientRect();

  const x = e.clientX - (r.left + r.width / 2);
  const y = e.clientY - (r.top + r.height / 2);

  return {
    x,
    y,
    nx: x / (r.width / 2),   // normalized (-1 → 1)
    ny: y / (r.height / 2),
  };
}