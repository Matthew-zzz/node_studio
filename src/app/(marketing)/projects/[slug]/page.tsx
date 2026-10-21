import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetail } from "@/features/projects/components/project-detail";
import { projects } from "@/features/projects/data/projects";
import { getProject } from "@/features/projects/lib/projects";
import { createMetadata } from "@/lib/metadata";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return createMetadata({ title: `${project.shortTitle} — кейс Node Studio`, description: project.description, path: `/projects/${project.slug}/` });
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const project = getProject((await params).slug);
  if (!project) notFound();
  return <ProjectDetail project={project} />;
}
