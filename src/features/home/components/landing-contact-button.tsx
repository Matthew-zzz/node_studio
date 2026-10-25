"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { site } from "@/config/site";

export function LandingContactButton() {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    let inViewport = false;
    const updateAnimationState = () => {
      button.dataset.motionActive = String(inViewport && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.05);
      updateAnimationState();
    }, { threshold: 0.05 });
    const onVisibilityChange = () => updateAnimationState();

    observer.observe(button);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (rippleTimer.current) clearTimeout(rippleTimer.current);
    };
  }, []);

  const trackPointer = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    event.currentTarget.style.setProperty("--pointer-x", `${x}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${y}%`);
    event.currentTarget.style.setProperty("--pull-x", `${Math.max(-2, Math.min(2, (x - 50) * 0.04))}px`);
    event.currentTarget.style.setProperty("--pull-y", `${Math.max(-2, Math.min(2, (y - 50) * 0.04))}px`);
  };

  const startRipple = (event: PointerEvent<HTMLAnchorElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--ripple-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--ripple-y", `${event.clientY - rect.top}px`);
    event.currentTarget.dataset.rippling = "true";
    if (rippleTimer.current) clearTimeout(rippleTimer.current);
    rippleTimer.current = setTimeout(() => {
      if (buttonRef.current) delete buttonRef.current.dataset.rippling;
    }, 520);
  };

  return (
    <a
      ref={buttonRef}
      className="button button-primary landing-impulse-button"
      href={site.contact}
      target="_blank"
      rel="noopener noreferrer"
      onPointerMove={trackPointer}
      onPointerDown={startRipple}
    >
      <span className="landing-impulse-cursor-light" aria-hidden="true" />
      <svg className="landing-impulse-ribbon" viewBox="0 0 360 80" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="landing-impulse-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#9cecff" stopOpacity="0" />
            <stop offset=".25" stopColor="#8be9ff" stopOpacity=".72" />
            <stop offset=".72" stopColor="#b8a7ff" stopOpacity=".95" />
            <stop offset="1" stopColor="#fff" stopOpacity=".98" />
          </linearGradient>
        </defs>
        <path className="landing-impulse-ribbon-soft" d="M-20 74 C38 47 57 69 112 43 S191 7 247 30 S302 51 352 18" />
        <path className="landing-impulse-ribbon-core" d="M-20 74 C38 47 57 69 112 43 S191 7 247 30 S302 51 352 18" />
      </svg>
      <span className="landing-impulse-arrow-orb" aria-hidden="true" />
      <span className="landing-impulse-ripple" aria-hidden="true" />
      <span className="landing-impulse-content">
        <span>Обсудить задачу</span>
        <span className="landing-impulse-arrow-drift"><Icon name="diagonal" /></span>
      </span>
    </a>
  );
}
