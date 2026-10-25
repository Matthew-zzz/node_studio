"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <div className="landing-service-list">
      {services.map((service, index) => {
        const active = activeIndex === index;
        const image = getScreenshot(artworkByService[service.id] ?? "/assets/autoparts-catalog.jpg");
        const panelId = `landing-service-panel-${service.id}`;

        return (
          <article
            className={`landing-service-card landing-service-${service.id}${active ? " is-active" : ""}`}
            key={service.id}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse" || event.pointerType === "pen") setActiveIndex(index);
            }}
            onFocusCapture={() => setActiveIndex(index)}
          >
            <div className="landing-service-art" aria-hidden="true">
              <Image src={image.src} alt="" fill sizes="(max-width: 760px) 100vw, 42vw" />
            </div>
            <button
              className="landing-service-trigger"
              type="button"
              aria-expanded={active}
              aria-controls={panelId}
              onClick={() => setActiveIndex(active ? -1 : index)}
            >
              <span>{service.title}</span>
              <span className="landing-service-number">{String(index + 1).padStart(2, "0")}</span>
            </button>
            <div className="landing-service-panel" id={panelId} aria-hidden={!active} inert={!active}>
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
