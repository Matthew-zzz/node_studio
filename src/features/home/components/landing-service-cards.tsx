"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { LandingServiceArtwork } from "@/features/home/components/landing-service-artwork";
import { serviceOfferings } from "@/features/services/data/services";
import { formatServicePrice } from "@/features/services/lib/pricing";
import { serviceCardStarts, serviceCardState, type ServiceCardHeight } from "@/features/home/lib/service-card-timeline";

export function LandingServiceCards() {
  const services = serviceOfferings.filter((service) => service.id !== "individual");
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    let visible = false;
    let disposed = false;
    let needsMeasure = true;
    let width = 0;
    let heights: ServiceCardHeight[] = [];
    let starts: number[] = [];
    const cards = cardRefs.current.filter((card): card is HTMLElement => card !== null);
    const panels = cards.map((card) => card.querySelector<HTMLElement>(".landing-service-panel"));
    const states = cards.map(() => ({ height: -1, phase: -1 }));

    const updatePhases = () => {
      if (disposed || document.hidden) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (disposed || document.hidden) return;
        const scrollY = window.scrollY;
        if (needsMeasure) {
          // Read geometry together, only after layout changes; never after card writes.
          const top = list.getBoundingClientRect().top + scrollY;
          const gap = Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
          heights = cards.map((card) => {
            const styles = window.getComputedStyle(card);
            return {
              collapsed: Number.parseFloat(styles.getPropertyValue("--service-collapsed-height")) || 124,
              expanded: Number.parseFloat(styles.getPropertyValue("--service-expanded-height")) || 310,
            };
          });
          starts = serviceCardStarts(heights, gap, top, window.innerHeight);
          needsMeasure = false;
        }
        cards.forEach((card, index) => {
          const next = index === 0 ? { height: heights[index]!.expanded, phase: 3 } : serviceCardState(heights[index]!, starts[index]!, scrollY);
          const previous = states[index]!;
          if (previous.height !== next.height) {
            card.style.setProperty("height", `${next.height}px`);
          }
          if (previous.phase !== next.phase) {
            card.dataset.phase = String(next.phase);
            panels[index]?.setAttribute("aria-hidden", String(next.phase < 2));
            panels[index]?.toggleAttribute("inert", next.phase < 3);
          }
          states[index] = next;
        });
      });
    };
    const invalidate = () => { needsMeasure = true; updatePhases(); };
    const onScroll = () => {
      const first = heights[1];
      const last = heights.at(-1);
      const scrollY = window.scrollY;
      // A direct jump can cross the list without an intersecting observer entry.
      const jumpedBefore = first && scrollY < starts[1]! && states[1]?.height !== first.collapsed;
      const jumpedAfter = last && scrollY >= starts.at(-1)! + last.expanded - last.collapsed && states.at(-1)?.height !== last.expanded;
      if (visible || jumpedBefore || jumpedAfter) updatePhases();
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else invalidate();
    };
    const visibility = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      // Settle to open/closed when a large scroll crosses the entire section.
      updatePhases();
    });
    visibility.observe(list);
    const resize = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (entry.target !== list) changed = true;
        else if (width !== entry.contentRect.width) {
          width = entry.contentRect.width;
          changed = true;
        }
      }
      if (changed) invalidate();
    });
    resize.observe(list);
    const section = list.closest("section");
    for (let sibling = section?.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      resize.observe(sibling);
    }

    updatePhases();
    void document.fonts.ready.then(() => { if (!disposed) invalidate(); });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", invalidate);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      visibility.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", invalidate);
      document.removeEventListener("visibilitychange", onVisibility);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="landing-service-list" ref={listRef}>
      {services.map((service, index) => {
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
              <LandingServiceArtwork serviceId={service.id} />
            </div>
            <div className="landing-service-trigger">
              <h3 id={titleId}>
                {service.title}
                {service.priceFromRub !== undefined && <span className="landing-service-price">{formatServicePrice(service.priceFromRub)}</span>}
              </h3>
              <span className="landing-service-number">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <div className="landing-service-panel" id={panelId} aria-hidden={index !== 0} inert={index !== 0}>
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
