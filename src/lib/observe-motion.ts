export interface MotionState {
  readonly active: boolean;
  readonly reducedMotion: boolean;
}

/** Visibility pauses playback; only the motion preference should change presentation. */
export function observeMotion(element: Element, onChange: (state: MotionState) => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  const sync = () => onChange({
    active: visible && !document.hidden && !preference.matches,
    reducedMotion: preference.matches,
  });
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    sync();
  }, { rootMargin: "60px" });

  observer.observe(element);
  preference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  sync();

  return () => {
    observer.disconnect();
    preference.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
  };
}
