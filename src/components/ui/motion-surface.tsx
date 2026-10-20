"use client";

import { useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { observeMotion } from "@/lib/observe-motion";

interface MotionSurfaceProps extends ComponentPropsWithoutRef<"div"> {
  atmosphere?: boolean;
  marquee?: boolean;
}

function bindAtmospherePointer(element: HTMLElement) {
  const hero = element.closest<HTMLElement>(".studio-intro");
  const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  let frame = 0;

  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    element.style.removeProperty("--atmosphere-x");
    element.style.removeProperty("--atmosphere-y");
  }

  function move(event: PointerEvent) {
    if (element.dataset.active !== "true" || !pointer.matches || event.pointerType === "touch") return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (element.dataset.active !== "true") return;
      const bounds = element.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom) { reset(); return; }
      const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5));
      element.style.setProperty("--atmosphere-x", `${x * 16}px`);
      element.style.setProperty("--atmosphere-y", `${y * 10}px`);
    });
  }

  hero?.addEventListener("pointermove", move, { passive: true });
  hero?.addEventListener("pointerleave", reset);
  pointer.addEventListener("change", reset);

  return () => {
    hero?.removeEventListener("pointermove", move);
    hero?.removeEventListener("pointerleave", reset);
    pointer.removeEventListener("change", reset);
    reset();
  };
}

/** Geometry and animation attributes are scoped to this surface and cleaned up on unmount. */
export function MotionSurface({ atmosphere = false, marquee = false, children, ...props }: MotionSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const stopMotion = observeMotion(element, (active) => {
      element.dataset[atmosphere ? "active" : "playing"] = String(active);
      if (marquee) element.dataset.static = String(!active);
      if (atmosphere && !active) {
        element.style.removeProperty("--atmosphere-x");
        element.style.removeProperty("--atmosphere-y");
      }
    });
    const stopPointer = atmosphere ? bindAtmospherePointer(element) : undefined;

    let frame = 0;
    // Animated Beam geometry adapted from Magic UI; public/licenses/magic-ui-MIT.txt.
    const updateBeams = () => {
      frame = 0;
      const bounds = element.getBoundingClientRect();
      element.querySelectorAll<SVGGElement>("[data-beam-from]").forEach((beam) => {
        const from = element.querySelector<HTMLElement>(`[data-beam-point="${beam.dataset.beamFrom}"]`);
        const to = element.querySelector<HTMLElement>(`[data-beam-point="${beam.dataset.beamTo}"]`);
        if (!from || !to) return;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.left - bounds.left + a.width / 2;
        const y1 = a.top - bounds.top + a.height / 2;
        const x2 = b.left - bounds.left + b.width / 2;
        const y2 = b.top - bounds.top + b.height / 2;
        const controlY = y1 - Number(beam.dataset.beamCurvature ?? 0);
        beam.querySelectorAll("path").forEach((path) => path.setAttribute("d", `M ${x1},${y1} Q ${(x1 + x2) / 2},${controlY} ${x2},${y2}`));
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(updateBeams); };
    const resize = new ResizeObserver(schedule);
    if (element.querySelector("[data-beam-from]")) resize.observe(element);
    schedule();

    return () => {
      stopMotion();
      stopPointer?.();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [atmosphere, marquee]);

  return (
    <div
      {...props}
      ref={ref}
      data-active={atmosphere ? "false" : undefined}
      data-playing="false"
      data-static={marquee ? "true" : undefined}
    >
      {children}
    </div>
  );
}
