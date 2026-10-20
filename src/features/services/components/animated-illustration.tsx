"use client";

import { useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { observeMotion } from "@/lib/observe-motion";

/** Activate a service illustration and keep any SVG connectors aligned to its nodes. */
export function AnimatedIllustration({ children, ...props }: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const stopMotion = observeMotion(element, ({ active }) => {
      element.dataset.playing = String(active);
    });

    const beams = [...element.querySelectorAll<SVGGElement>("[data-beam-from]")];
    if (!beams.length) return stopMotion;

    let frame = 0;
    // Animated Beam geometry adapted from Magic UI; public/licenses/magic-ui-MIT.txt.
    function updateBeams() {
      frame = 0;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      beams.forEach((beam) => {
        const from = element.querySelector<HTMLElement>(`[data-beam-point="${beam.dataset.beamFrom}"]`);
        const to = element.querySelector<HTMLElement>(`[data-beam-point="${beam.dataset.beamTo}"]`);
        if (!from || !to) return;
        const start = from.getBoundingClientRect();
        const end = to.getBoundingClientRect();
        const x1 = start.left - bounds.left + start.width / 2;
        const y1 = start.top - bounds.top + start.height / 2;
        const x2 = end.left - bounds.left + end.width / 2;
        const y2 = end.top - bounds.top + end.height / 2;
        const controlY = y1 - Number(beam.dataset.beamCurvature ?? 0);
        beam.querySelectorAll("path").forEach((path) => path.setAttribute("d", `M ${x1},${y1} Q ${(x1 + x2) / 2},${controlY} ${x2},${y2}`));
      });
    }

    const schedule = () => { if (!frame) frame = requestAnimationFrame(updateBeams); };
    const resize = new ResizeObserver(schedule);
    resize.observe(element);
    schedule();

    return () => {
      stopMotion();
      resize.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div {...props} ref={ref} data-playing="false">
      {children}
    </div>
  );
}
