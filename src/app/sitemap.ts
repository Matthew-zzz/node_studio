import type { MetadataRoute } from "next";
import { projects } from "@/features/projects/data/projects";
import { siteOrigin } from "@/lib/metadata";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/services/", "/terms/", "/privacy/", "/details/", ...projects.map((project) => `/projects/${project.slug}/`)].map((path) => ({ url: `${siteOrigin}${path}` }));
}
