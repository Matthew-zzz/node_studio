import { DeviceFrame } from "@/components/ui/device-frame";
import { Screenshot } from "@/features/projects/components/screenshot";
import { getScreenshot } from "@/features/projects/data/screenshots";
import { screenshotSizes } from "@/features/projects/lib/screenshot-sizes";
import type { Project } from "@/features/projects/model/types";
import { ShowcaseImage } from "@/features/projects/components/showcase-image";

export function ProjectPresentation({ project, mode = "card" }: { project: Project; mode?: "card" | "cover" }) {
  if (project.coverShowcase) {
    return (
      <div className="project-showcase-cover">
        <ShowcaseImage
          name={project.coverShowcase}
          alt={project.coverAlt}
          priority={mode === "cover"}
          {...(mode === "cover" ? { sizes: "(max-width: 360px) calc(100vw - 8px), (max-width: 760px) calc(100vw - 16px), (max-width: 1150px) calc(100vw - 64px), min(960px, calc(100vw - 96px))" } : {})}
        />
      </div>
    );
  }

  if (project.slug === "autoparts" && mode === "card") {
    return (
      <div className="project-stage project-stage-autoparts-empty stage-card stage-adaptive" aria-hidden="true">
        <video autoPlay loop muted playsInline preload="metadata">
          <source src="/assets/animelove-presentation.mp4" type="video/mp4" />
        </video>
      </div>
    );
  }

  const paths = project.mobileOnly ? (project.showcase ?? [project.cover]).slice(0, mode === "cover" ? 3 : 2) : [project.cover];

  return (
    <div className={`project-stage project-stage-${project.slug} stage-${mode} ${project.mobileOnly ? "stage-portrait" : "stage-adaptive"}`}>
      <div className="presentation-screens">
        {paths.map((path, index) => {
          const screen = project.gallery.find((item) => item.src === path);
          const image = getScreenshot(path);
          const picture = <Screenshot image={image} alt={screen ? `${screen.title}. ${screen.description}` : project.coverAlt} sizes={image.portrait ? screenshotSizes.portraitCover : screenshotSizes.cover} priority={mode === "cover" && index === 0} />;
          return <div className={`presentation-screen presentation-screen-${index + 1}`} key={path}>{image.deviceFrame === "iphone" ? <DeviceFrame>{picture}</DeviceFrame> : picture}</div>;
        })}
      </div>
    </div>
  );
}
