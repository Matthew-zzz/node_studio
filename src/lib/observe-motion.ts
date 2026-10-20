/** Observe visibility, tab state and the system motion preference with one cleanup. */
export function observeMotion(element: Element, onChange: (active: boolean) => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  const sync = () => onChange(visible && !document.hidden && !preference.matches);
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
