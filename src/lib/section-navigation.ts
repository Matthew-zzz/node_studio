import { navigation } from "@/config/navigation";

const sectionIds = new Set(navigation.map(({ href }) => href.split("#")[1]));
let cancelCurrent: (() => void) | undefined;

export function cancelSectionNavigation() {
  cancelCurrent?.();
}

/** Follow a section's visible content, including layout changes during the trip. */
export function scrollToSection(hash: string) {
  cancelSectionNavigation();
  const id = hash.slice(1);
  if (!sectionIds.has(id)) return;
  const section = document.getElementById(id);
  const target = section?.querySelector<HTMLElement>("[data-section-anchor]") ?? section;
  if (!target) return;

  const header = document.querySelector(".header");
  const offset = (header?.getBoundingClientRect().height ?? 0) + 20;
  const from = window.scrollY;
  const destination = () => Math.max(0, Math.min(
    target.getBoundingClientRect().top + window.scrollY - offset,
    document.documentElement.scrollHeight - window.innerHeight,
  ));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const duration = reducedMotion.matches ? 0 : Math.min(1200, Math.max(360, Math.sqrt(Math.abs(destination() - from)) * 12));
  let frame = 0;
  let started: number | undefined;
  let previousDestination = Number.POSITIVE_INFINITY;
  let stableFrames = 0;
  const onKeyDown = (event: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Tab"].includes(event.key)) cancel();
  };

  const cancel = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("pointerdown", cancel);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", cancel);
    document.removeEventListener("visibilitychange", cancel);
    reducedMotion.removeEventListener("change", cancel);
    if (cancelCurrent === cancel) cancelCurrent = undefined;
  };
  const update = (time: number) => {
    if (!target.isConnected) { cancel(); return; }
    started ??= time;
    const elapsed = time - started;
    const progress = duration ? Math.min(1, elapsed / duration) : 1;
    const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
    const to = destination();
    // Native smooth scrolling retains its original destination when the service
    // cards grow. Read the current destination instead of landing above Contact.
    window.scrollTo({ top: from + (to - from) * eased, behavior: "instant" });
    if (progress === 1) {
      stableFrames = Math.abs(to - previousDestination) < 1 ? stableFrames + 1 : 0;
      // Allow pending card/layout frames to settle, including reduced motion.
      if (stableFrames >= 3 || elapsed > duration + 500) { cancel(); return; }
    }
    previousDestination = to;
    frame = requestAnimationFrame(update);
  };

  cancelCurrent = cancel;
  window.addEventListener("wheel", cancel, { passive: true });
  window.addEventListener("touchstart", cancel, { passive: true });
  window.addEventListener("pointerdown", cancel, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", cancel);
  document.addEventListener("visibilitychange", cancel);
  reducedMotion.addEventListener("change", cancel);
  frame = requestAnimationFrame(update);
}
