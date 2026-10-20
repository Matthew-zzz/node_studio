"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { observeMotion } from "@/lib/observe-motion";

/** Keep pointer interaction beside the hero while its artwork stays server rendered. */
export function HeroAtmosphereMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = ref.current;
    if (!scene) return;
    const hero = scene.closest<HTMLElement>(".studio-intro");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame = 0;

    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      scene?.style.removeProperty("--atmosphere-x");
      scene?.style.removeProperty("--atmosphere-y");
    }

    const stopMotion = observeMotion(scene, ({ active }) => {
      scene.dataset.active = String(active);
      if (!active) reset();
    });

    function move(event: PointerEvent) {
      if (!scene || scene.dataset.active !== "true" || !pointer.matches || event.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (scene.dataset.active !== "true") return;
        const bounds = scene.getBoundingClientRect();
        if (event.clientY < bounds.top || event.clientY > bounds.bottom) { reset(); return; }
        const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / Math.max(1, bounds.width) - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / Math.max(1, bounds.height) - 0.5));
        scene.style.setProperty("--atmosphere-x", `${x * 16}px`);
        scene.style.setProperty("--atmosphere-y", `${y * 10}px`);
      });
    }

    hero?.addEventListener("pointermove", move, { passive: true });
    hero?.addEventListener("pointerleave", reset);
    pointer.addEventListener("change", reset);

    return () => {
      stopMotion();
      hero?.removeEventListener("pointermove", move);
      hero?.removeEventListener("pointerleave", reset);
      pointer.removeEventListener("change", reset);
      reset();
    };
  }, []);

  return (
    <div className="intro-atmosphere" ref={ref} data-active="false" aria-hidden="true">
      {children}
    </div>
  );
}
