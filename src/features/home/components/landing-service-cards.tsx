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
    const updatePhases = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const viewportHeight = window.innerHeight || 1;
        const enterAt = viewportHeight * 0.9;
        const centerAt = viewportHeight * 0.22;
        const exitAt = -viewportHeight * 0.65;

        for (const card of cardRefs.current) {
          if (!card) continue;
          const top = card.getBoundingClientRect().top;
          let progress = 0;

          if (top < enterAt && top > centerAt) progress = (enterAt - top) / (enterAt - centerAt);
          else if (top <= centerAt && top > exitAt) progress = (top - exitAt) / (centerAt - exitAt);

          const phase = progress <= 0 ? 0 : progress < 0.34 ? 1 : progress < 0.68 ? 2 : 3;
          if (card.dataset.phase === String(phase)) continue;
          card.dataset.phase = String(phase);
          const panel = card.querySelector<HTMLElement>(".landing-service-panel");
          panel?.setAttribute("aria-hidden", String(phase < 2));
          panel?.toggleAttribute("inert", phase < 3);
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
            data-phase="0"
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
