import { Contact } from "@/components/sections/contact";
import { Faq } from "@/features/home/components/faq";
import { Hero } from "@/features/home/components/hero";
import { Marquee } from "@/features/home/components/marquee";
import { Process } from "@/features/home/components/process";
import { ProjectsSection } from "@/features/projects/components/projects-section";
import { ServicesSection } from "@/features/services/components/services-section";

export function HomePage() {
  return (
    <>
      <Hero />
      <Marquee kind="directions" />
      <ServicesSection />
      <Marquee kind="stack" />
      <ProjectsSection />
      <Process />
      <Faq />
      <Contact />
    </>
  );
}
