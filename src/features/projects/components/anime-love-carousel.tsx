"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Screenshot } from "@/features/projects/components/screenshot";
import { getScreenshot } from "@/features/projects/data/screenshots";
import { screenshotSizes } from "@/features/projects/lib/screenshot-sizes";
import type { GalleryScreen } from "@/features/projects/model/types";
import styles from "./anime-love-carousel.module.css";

export function AnimeLoveCarousel({ slides }: { slides: readonly GalleryScreen[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const startX = useRef<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const count = slides.length;

  const move = useCallback((step: number) => {
    setActiveIndex((current) => (current + step + count) % count);
  }, [count]);

  useEffect(() => {
    const element = viewport.current;
    if (!element || hovered || focused || count < 2 || !("IntersectionObserver" in window)) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    let timer: number | undefined;
    const canAdvance = () => visible && !document.hidden && !reducedMotion.matches;
    const stop = () => {
      window.clearInterval(timer);
      timer = undefined;
    };
    const syncAutoplay = () => {
      stop();
      if (canAdvance()) {
        // Returning to the carousel starts a full interval, without skipping slides.
        timer = window.setInterval(() => { if (canAdvance()) move(1); }, 6200);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.01 && entry.boundingClientRect.width > 0 && entry.boundingClientRect.height > 0);
      syncAutoplay();
    }, { threshold: [0, 0.01] });

    observer.observe(element);
    document.addEventListener("visibilitychange", syncAutoplay);
    reducedMotion.addEventListener("change", syncAutoplay);
    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncAutoplay);
      reducedMotion.removeEventListener("change", syncAutoplay);
    };
  }, [count, move, hovered, focused]);

  if (!count) return null;
  const current = slides[activeIndex];

  return (
    <section
      className={`case-gallery section container ${styles.section}`}
      aria-labelledby="anime-carousel-heading"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className={styles.heading}>
        <div className={styles.intro}>
          <p className={styles.kicker}>
            <span aria-hidden="true" />
            ИНТЕРАКТИВНАЯ ГАЛЕРЕЯ · ANIMELOVE
          </p>
          <h2 id="anime-carousel-heading">Выбрать. Смотреть. Настроить.</h2>
          <p className={styles.lead}>Четыре экрана — один цельный сервис внутри Telegram.</p>
        </div>
        <div className={styles.controls} aria-label="Управление каруселью">
          <button className={styles.arrow} type="button" aria-label="Предыдущий экран" onClick={() => move(-1)}>
            <Icon name="arrow" />
          </button>
          <span className={styles.counter} aria-live="polite">
            {String(activeIndex + 1).padStart(2, "0")}
            <span> / </span>
            {String(count).padStart(2, "0")}
          </span>
          <button className={styles.arrow} type="button" aria-label="Следующий экран" onClick={() => move(1)}>
            <Icon name="arrow" />
          </button>
        </div>
      </div>

      <div
        className={styles.showcase}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className={styles.viewport}
          ref={viewport}
          role="region"
          aria-roledescription="карусель"
          aria-label="Экраны приложения AnimeLove"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
          }}
          onPointerDown={(event) => {
            startX.current = event.clientX;
            if (event.pointerType !== "mouse") event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (startX.current === null) return;
            const distance = event.clientX - startX.current;
            startX.current = null;
            if (Math.abs(distance) > 42) move(distance < 0 ? 1 : -1);
          }}
          onPointerCancel={() => { startX.current = null; }}
        >
          {slides.map((slide, index) => {
            const image = getScreenshot(slide.src);
            const active = index === activeIndex;
            return (
              <div
                className={styles.slide}
                key={slide.src}
                data-active={active}
                hidden={!active}
                aria-hidden={!active}
                role="group"
                aria-roledescription="слайд"
                aria-label={`${index + 1} из ${count}: ${slide.title}`}
              >
                <div className={styles.imageFrame}>
                  <Screenshot
                    image={image}
                    alt={`${slide.title}. ${slide.description}`}
                    sizes={screenshotSizes.carousel}
                    useMobile={false}
                    draggable={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.stageFoot}>
          <span className={styles.stageHint}>
            <span aria-hidden="true">↔</span>
            Перетяните, чтобы листать
          </span>
          <div className={styles.pagination} aria-label="Выбрать экран">
            {slides.map((slide, index) => (
              <button
                key={slide.src}
                type="button"
                className={styles.dot}
                data-active={index === activeIndex}
                aria-label={`Показать экран: ${slide.title}`}
                aria-current={index === activeIndex ? "true" : undefined}
                onClick={() => setActiveIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>

      {current && (
        <div className={styles.caption} aria-live="polite">
          <span className={styles.captionIndex}>{String(activeIndex + 1).padStart(2, "0")}</span>
          <div>
            <h3>{current.title}</h3>
            <p>{current.description}</p>
          </div>
          <span className={styles.category}>{current.category}</span>
        </div>
      )}
    </section>
  );
}
