import Link from "next/link";
import { AutopartsBrandStory } from "@/features/projects/components/autoparts-brand-story";
import { ExternalLink } from "@/components/ui/external-link";
import { Icon } from "@/components/ui/icon";
import { ProjectGallery } from "@/features/projects/components/project-gallery";
import { ProjectPresentation } from "@/features/projects/components/project-presentation";
import { getNextProject } from "@/features/projects/lib/projects";
import type { Project } from "@/features/projects/model/types";

export function ProjectDetail({ project }: { project: Project }) {
  const next = getNextProject(project.slug);
  const showcaseCover = Boolean(project.coverShowcase || project.coverVideo);
  const story = [
    { label: "Задача", text: project.context, icon: "search" },
    { label: "Решение", text: project.solution, icon: "code" },
    { label: "Итог", text: project.result, icon: "check" },
  ] as const;

  return (
    <div className="case-page">
      <section className="case-hero container">
        <Link className="back-link" href="/#projects">← Все проекты</Link>
        <h1>{project.title}</h1>
        <p className="case-subtitle">{project.subtitle}</p>
        <div className="case-meta">
          <span>{project.kind}</span>
          {project.timing && (
            <span>
              <Icon name="clock" />
              {project.timing}
              {' '}
              на реализацию
            </span>
          )}
          {project.demo && (
            <ExternalLink href={project.demo}>
              {project.demoLabel ?? "Открыть в Telegram"}
              <Icon name="diagonal" />
            </ExternalLink>
          )}
        </div>
        {project.accessNote && (
          <p className="case-access-note">
            <Icon name="flow" />
            {project.accessNote}
          </p>
        )}
        {project.presentationNote && <p className="case-presentation-note">{project.presentationNote}</p>}
        <div className={`case-cover portfolio-cover reveal${showcaseCover ? " case-showcase-cover" : ""}`} style={project.coverVideo ? { maxWidth: project.coverVideo.width } : undefined}><ProjectPresentation project={project} mode="cover" /></div>
      </section>
      {project.slug === "autoparts" && <AutopartsBrandStory />}
      <section className="case-story case-summary section container" aria-labelledby="case-summary-title">
        <h2 id="case-summary-title" className="sr-only">Задача, решение и результат</h2>
        <div className="case-summary-grid">
          {story.map((beat) => (
            <article className="case-beat reveal" key={beat.label}>
              <div className="case-beat-heading">
                <span className="case-beat-icon" aria-hidden="true"><Icon name={beat.icon} /></span>
                <h3>{beat.label}</h3>
              </div>
              <p>{beat.text}</p>
            </article>
          ))}
        </div>
      </section>
      {project.featuresHeading && (
        <section className="case-features section container" aria-labelledby="case-features-title">
          <div className="case-features-layout">
            <h2 id="case-features-title" className="reveal">{project.featuresHeading}</h2>
            <div className="case-features-list">
              {project.features.map(([title, description], index) => (
                <article className="case-feature reveal" key={title}>
                  <span className="case-feature-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
      <ProjectGallery project={project} />
      {next && (
        <section className="next-project container">
          <Link href={`/projects/${next.slug}/`}>
            <h2>{next.shortTitle}</h2>
            <Icon name="diagonal" />
          </Link>
        </section>
      )}
    </div>
  );
}
