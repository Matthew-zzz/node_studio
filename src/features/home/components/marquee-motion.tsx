"use client";

import { useEffect, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { observeMotion } from "@/lib/observe-motion";

export function MarqueeMotion({ children, ...props }: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return observeMotion(element, ({ active, reducedMotion }) => {
      element.dataset.playing = String(active);
      element.dataset.static = String(reducedMotion);
    });
  }, []);

  return (
    <div {...props} ref={ref} data-playing="false" data-static="true">
      {children}
    </div>
  );
}
