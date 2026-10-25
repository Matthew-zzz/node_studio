"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { serviceOfferings } from "@/features/services/data/services";
import { getScreenshot } from "@/features/projects/data/screenshots";

const artworkByService: Readonly<Record<string, string>> = {
  website: "/assets/autoparts-catalog.jpg",
  "new-product": "/assets/anime-catalog.jpg",
  improve: "/assets/autoparts-analogs.png",
  integrations: "/assets/autoparts-stock.jpg",
  telegram: "/assets/anime-profile.jpg",
  automation: "/assets/autoparts-administration.jpg",
  ai: "/assets/vectra-knowledge.png",
};

export function LandingServiceCards() {
  const services = serviceOfferings.filter((service) => service.id !== "individual");
  const cardRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    const stageStarts = new Map<number, number>();
    const cards = cardRefs.current.filter((card): card is HTMLElement => card !== null);

    const setPhase = (card: HTMLElement, phase: number, openHeight: number) => {
      card.style.setProperty("--service-height", `${openHeight}px`);
      if (card.dataset.phase === String(phase)) return;
      card.dataset.phase = String(phase);
      const panel = card.querySelector<HTMLElement>(".landing-service-panel");
      panel?.setAttribute("aria-hidden", String(phase < 2));
      panel?.toggleAttribute("inert", phase < 3);
    };

    const firstCard = cards[0];
    if (!firstCard) return;

    const getHeights = (card: HTMLElement) => {
      const styles = window.getComputedStyle(card);
      return {
        collapsed: Number.parseFloat(styles.getPropertyValue("--service-collapsed-height")) || 110,
        expanded: Number.parseFloat(styles.getPropertyValue("--service-expanded-height")) || 250,
      };
    };

    // The first card is open on entry. Each next card grows by the same
    // number of pixels the page scrolls, keeping the following card at the
    // viewport's lower edge until the current card is fully open.
    const firstHeights = getHeights(firstCard);
    setPhase(firstCard, 3, firstHeights.expanded);

    const updatePhases = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const viewportHeight = window.innerHeight || 1;
        const scrollY = window.scrollY;

        // Reversing the page scroll also reverses the current card's opening.
        for (const [index, startY] of [...stageStarts.entries()].sort(([a], [b]) => b - a)) {
          if (scrollY < startY) {
            stageStarts.delete(index);
            const card = cards[index];
            if (card) {
              const heights = getHeights(card);
              setPhase(card, 0, heights.collapsed);
            }
          }
        }

        for (let index = 1; index < cards.length; index += 1) {
          const card = cards[index];
          if (!card) continue;
          const heights = getHeights(card);
          const startY = stageStarts.get(index);

          if (startY === undefined) {
            // Card N starts opening only when card N+1 is fully visible.
            const anchor = cards[index + 1];
            if (!anchor) {
              const cardRect = card.getBoundingClientRect();
              if (cardRect.top >= 0 && cardRect.bottom <= viewportHeight) {
                setPhase(card, 3, heights.expanded);
              }
              break;
            }
            const anchorRect = anchor.getBoundingClientRect();
            if (anchorRect.top < 0 || anchorRect.bottom > viewportHeight) break;
            // Account for scroll steps that crossed the viewport edge between
            // two animation frames; this keeps the anchor aligned to the edge.
            stageStarts.set(index, scrollY - Math.max(0, viewportHeight - anchorRect.bottom));
          }

          const stageStart = stageStarts.get(index) ?? scrollY;
          const distance = heights.expanded - heights.collapsed;
          const opened = Math.max(0, Math.min(distance, scrollY - stageStart));
          const progress = distance > 0 ? opened / distance : 1;
          const phase = progress === 0 ? 0 : progress < 0.34 ? 1 : progress < 0.68 ? 2 : 3;
          setPhase(card, phase, heights.collapsed + opened);

          if (progress < 1) break;
        }
      });
    };

    updatePhases();
    window.addEventListener("scroll", updatePhases, { passive: true });
    window.addEventListener("resize", updatePhases);
    return () => {
      window.removeEventListener("scroll", updatePhases);
      window.removeEventListener("resize", updatePhases);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing-service-list">
      {services.map((service, index) => {
        const image = getScreenshot(artworkByService[service.id] ?? "/assets/autoparts-catalog.jpg");
        const panelId = `landing-service-panel-${service.id}`;
        const titleId = `landing-service-title-${service.id}`;

        return (
          <article
            className={`landing-service-card landing-service-${service.id}`}
            data-phase={index === 0 ? "3" : "0"}
            aria-labelledby={titleId}
            ref={(element) => { cardRefs.current[index] = element; }}
            key={service.id}
          >
            <div className="landing-service-art" aria-hidden="true">
              <Image src={image.src} alt="" fill sizes="(max-width: 760px) 100vw, 42vw" />
            </div>
            <div className="landing-service-trigger">
              <h3 id={titleId}>{service.title}</h3>
              <span className="landing-service-number">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="landing-service-panel" id={panelId} aria-hidden="true" inert>
              <div className="landing-service-inner">
                <div className="landing-service-copy">
                  <p>{service.description}</p>
                  <Link href={service.proof?.href ?? "#contact"}>
                    {service.proof?.label ?? "Обсудить задачу"}
                    <span className="landing-service-arrow"><Icon name="diagonal" /></span>
                  </Link>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
