"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { getScreenshot } from "@/features/projects/data/screenshots";
import type { GalleryScreen } from "@/features/projects/model/types";
import styles from "./anime-love-carousel.module.css";

function wrappedOffset(index: number, activeIndex: number, length: number) {
  const raw = (index - activeIndex + length) % length;
  return raw > length / 2 ? raw - length : raw;
}

export function AnimeLoveCarousel({ slides }: { slides: readonly GalleryScreen[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const count = slides.length;

  const move = useCallback((step: number) => {
    setActiveIndex((current) => (current + step + count) % count);
  }, [count]);

  useEffect(() => {
    if (paused || count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => move(1), 6200);
    return () => window.clearInterval(timer);
  }, [count, move, paused]);

  if (!count) return null;
  const current = slides[activeIndex];

  return (
    <section className={`case-gallery section container ${styles.section}`} aria-labelledby="anime-carousel-heading">
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
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
      >
        <div className={styles.lightOrb} aria-hidden="true" />
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
          onPointerMove={(event) => {
            if (event.pointerType !== "mouse" || startX.current !== null) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = (event.clientX - bounds.left) / bounds.width - 0.5;
            const y = (event.clientY - bounds.top) / bounds.height - 0.5;
            viewport.current?.style.setProperty("--tilt-x", `${x * 3.5}deg`);
            viewport.current?.style.setProperty("--tilt-y", `${y * -2.5}deg`);
          }}
          onPointerLeave={() => {
            viewport.current?.style.setProperty("--tilt-x", "0deg");
            viewport.current?.style.setProperty("--tilt-y", "0deg");
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
            const offset = wrappedOffset(index, activeIndex, count);
            const distance = Math.abs(offset);
            return (
              <div
                className={styles.slide}
                key={slide.src}
                data-active={offset === 0}
                aria-hidden={offset !== 0}
                role="group"
                aria-roledescription="слайд"
                aria-label={`${index + 1} из ${count}: ${slide.title}`}
                style={{
                  transform: `translate3d(calc(-50% + ${offset * 76}%), -50%, ${-distance * 120}px) ${offset === 0 ? "rotateX(var(--tilt-y, 0deg)) rotateY(var(--tilt-x, 0deg)) " : ""}rotateY(${offset * -22}deg) scale(${1 - distance * 0.14})`,
                  opacity: distance > 1 ? 0 : 1 - distance * 0.2,
                  zIndex: count - distance,
                }}
              >
                <div className={styles.imageFrame}>
                  <Image
                    src={image.src}
                    alt={`${slide.title}. ${slide.description}`}
                    width={image.width}
                    height={image.height}
                    sizes="(max-width: 760px) 86vw, (max-width: 1200px) 76vw, 940px"
                    priority={distance < 2}
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
