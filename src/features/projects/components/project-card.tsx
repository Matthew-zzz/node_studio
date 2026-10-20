import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { ProjectPresentation } from "@/features/projects/components/project-presentation";
import type { Project } from "@/features/projects/model/types";

const storyLabels = ["Задача", "Решение", "Итог"] as const;

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className={`project-card reveal${project.slug === "autoparts" ? " project-featured" : ""}`}>
      <div className="project-layout">
        <div className={`project-media ${project.slug}`}><ProjectPresentation project={project} /></div>
        <Link className="project-content project-link" href={`/projects/${project.slug}/`}>
          <div className="project-heading">
            <h3>{project.cardTitle}</h3>
            <Icon name="diagonal" />
          </div>
          <dl className="project-story-preview">
            {project.preview.map((text, index) => (
              <div key={text}>
                <dt>{storyLabels[index]}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </Link>
      </div>
    </article>
  );
}
