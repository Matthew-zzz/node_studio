"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { navigation } from "@/config/navigation";
import { cancelSectionNavigation, scrollToSection } from "@/lib/section-navigation";

/** Section navigation and reveal effects; native links/content remain usable without JavaScript. */
export function SiteEffects() {
  const pathname = usePathname();

  useEffect(() => {
    // Cross-page links and direct fragment URLs use the same destination as
    // clicks within the homepage. Ordinary scroll is never corrected or locked.
    const navigateToHash = () => scrollToSection(window.location.hash);
    navigateToHash();
    window.addEventListener("hashchange", navigateToHash);
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
      cancelSectionNavigation();
      window.removeEventListener("hashchange", navigateToHash);
      reveal.disconnect();
      sections.disconnect();
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", cancelAnimations);
      document.querySelectorAll(".desktop-nav a").forEach((link) => { link.classList.remove("current"); link.removeAttribute("aria-current"); });
    };
  }, [pathname]);

  return null;
}
