"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

type ViewportVideoProps = Pick<ComponentPropsWithoutRef<"video">, "className" | "aria-label" | "aria-hidden"> & {
  src: string;
  mobileSrc?: string;
  poster: string;
  playOnce?: boolean;
};

/** Load on first visibility, pause outside the viewport and release completed media. */
export function ViewportVideo({ src, mobileSrc, poster, playOnce = false, ...props }: ViewportVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !("IntersectionObserver" in window)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let completed = false;
    let disposed = false;
    const shouldPlay = () => !disposed && visible && !completed && !document.hidden && !reducedMotion.matches && !video.closest("[hidden]");

    const syncPlayback = () => {
      if (!shouldPlay()) {
        video.pause();
        return;
      }

      if (!video.getAttribute("src")) {
        // Keep the selected variant during playback to preserve position on resize.
        video.src = mobileSrc && window.matchMedia("(max-width: 760px)").matches ? mobileSrc : src;
      }
      void video.play().then(() => {
        if (!shouldPlay()) video.pause();
      }).catch(() => {
        // Autoplay restrictions and an interrupted play request leave the poster available.
      });
    };

    const finishPlayback = () => {
      if (!playOnce) return;
      completed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.01 && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0);
      syncPlayback();
    }, { threshold: [0, 0.01] });

    observer.observe(video);
    document.addEventListener("visibilitychange", syncPlayback);
    reducedMotion.addEventListener("change", syncPlayback);
    video.addEventListener("ended", finishPlayback);

    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      reducedMotion.removeEventListener("change", syncPlayback);
      video.removeEventListener("ended", finishPlayback);
      video.pause();
      if (video.hasAttribute("src")) {
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [src, mobileSrc, playOnce]);

  return <video {...props} ref={ref} poster={poster} muted playsInline loop={!playOnce} preload="none" />;
}
