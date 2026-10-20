import { ResponsiveCopy } from "@/components/ui/responsive-copy";
import { ProjectCard } from "@/features/projects/components/project-card";
import { projects } from "@/features/projects/data/projects";

export function ProjectsSection() {
  return (
    <section className="projects-section section" id="projects">
      <div className="container">
        <div className="section-head reveal">
          <div>
            <h2>
              <ResponsiveCopy
                wide={<>
                  Вот как это реализовано
                  <br />
                  <span className="muted">в наших проектах.</span>
                </>}
                compact="Наши проекты."
              />
            </h2>
          </div>
        </div>
        <div className="projects-grid">{projects.map((project) => <ProjectCard key={project.slug} project={project} />)}</div>
      </div>
    </section>
  );
}
