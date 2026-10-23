"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { navigation } from "@/config/navigation";

/** Progressive decoration only: page content stays visible when JavaScript is unavailable. */
export function SiteEffects() {
  const pathname = usePathname();

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal.unobserve(entry.target);
        if (motion.matches) return;
        const animation = entry.target.animate([{ opacity: 0.35, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 450, easing: "ease-out" });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }, { threshold: 0.06 });
    document.querySelectorAll(".reveal").forEach((element) => reveal.observe(element));

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const distance = document.documentElement.scrollHeight - window.innerHeight;
      document.documentElement.style.setProperty("--read-progress", String(distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(updateProgress); };
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    updateProgress();

    const sections = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        document.querySelectorAll<HTMLAnchorElement>(".desktop-nav a").forEach((link) => {
          const active = link.hash === `#${entry.target.id}`;
          link.classList.toggle("current", active);
          if (active) link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-15% 0px -65% 0px" });
    const sectionSelectors = navigation.map(({ href }) => new URL(href, window.location.origin).hash).filter(Boolean).join(",");
    if (sectionSelectors) document.querySelectorAll(sectionSelectors).forEach((element) => sections.observe(element));
    const cancelAnimations = () => { if (motion.matches) animations.forEach((animation) => animation.cancel()); };
    motion.addEventListener("change", cancelAnimations);

    return () => {
      reveal.disconnect();
      sections.disconnect();
      resize.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", cancelAnimations);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      document.querySelectorAll(".desktop-nav a").forEach((link) => { link.classList.remove("current"); link.removeAttribute("aria-current"); });
    };
  }, [pathname]);

  return null;
}
