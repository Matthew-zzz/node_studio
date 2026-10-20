import { DeviceFrame } from "@/components/ui/device-frame";
import { Screenshot } from "@/features/projects/components/screenshot";
import { getScreenshot } from "@/features/projects/data/screenshots";
import type { Project } from "@/features/projects/model/types";

export function ProjectPresentation({ project, mode = "card" }: { project: Project; mode?: "card" | "cover" }) {
  const paths = project.mobileOnly ? (project.showcase ?? [project.cover]).slice(0, mode === "cover" ? 3 : 2) : [project.cover];

  return (
    <div className={`project-stage project-stage-${project.slug} stage-${mode} ${project.mobileOnly ? "stage-portrait" : "stage-adaptive"}`}>
      <div className="presentation-screens">
        {paths.map((path, index) => {
          const screen = project.gallery.find((item) => item.src === path);
          const image = getScreenshot(path);
          const picture = <Screenshot image={image} alt={screen ? `${screen.title}. ${screen.description}` : project.coverAlt} priority={mode === "cover" && index === 0} />;
          return <div className={`presentation-screen presentation-screen-${index + 1}`} key={path}>{image.deviceFrame === "iphone" ? <DeviceFrame>{picture}</DeviceFrame> : picture}</div>;
        })}
      </div>
    </div>
  );
}
