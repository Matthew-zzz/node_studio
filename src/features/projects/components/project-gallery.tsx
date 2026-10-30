import { DeviceFrame } from "@/components/ui/device-frame";
import { Screenshot } from "@/features/projects/components/screenshot";
import { getScreenshot } from "@/features/projects/data/screenshots";
import { AnimeLoveCarousel } from "@/features/projects/components/anime-love-carousel";
import { screenshotSizes } from "@/features/projects/lib/screenshot-sizes";
import type { Project } from "@/features/projects/model/types";

const galleryHeadings: Readonly<Record<string, string>> = {
  vectra: "Подключить. Загрузить. Спросить.",
  "anime-love": "Выбрать. Смотреть. Настроить.",
  autoparts: "Каталог. Подбор. Контроль.",
};

export function ProjectGallery({ project }: { project: Project }) {
  if (!project.gallery.length) return null;
  if (project.slug === "anime-love") return <AnimeLoveCarousel slides={project.gallery} />;
  const hasMobile = project.gallery.some((screen) => getScreenshot(screen.src).mobile);

  return (
    <section className={`case-gallery section container structured-gallery portfolio-gallery gallery-${project.slug}${project.mobileOnly ? " gallery-portrait" : ""}`}>
      <div className="section-head reveal"><div><h2>{galleryHeadings[project.slug] ?? "Как устроен проект"}</h2></div></div>
      <div className="screen-stories">
        {project.gallery.map((screen, index) => {
          const image = getScreenshot(screen.src);
          const picture = <Screenshot image={image} alt={`${image.concept ? "Визуализация интерфейса. " : ""}${screen.description}`} sizes={image.portrait ? screenshotSizes.portraitGallery : screenshotSizes.gallery} />;
          return (
            <figure className={`screen-story reveal${hasMobile && !image.mobile ? " screen-desktop-only" : ""}`} id={`screen-${index + 1}`} key={screen.src}>
              <div className="screen-frame">{image.deviceFrame === "iphone" ? <DeviceFrame>{picture}</DeviceFrame> : picture}</div>
              <figcaption className="screen-story-note">
                <h3>{screen.title}</h3>
                <p>{screen.description}</p>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
