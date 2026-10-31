import type { showcaseImages } from "@/features/projects/data/showcase-images";

export type ProjectCategory = "automation" | "telegram" | "ai" | "commerce";

export interface GalleryScreen {
  readonly src: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
}

export interface Project {
  readonly slug: string;
  readonly number: string;
  readonly title: string;
  readonly shortTitle: string;
  readonly cardTitle: string;
  readonly preview: readonly [string, string, string];
  readonly category: ProjectCategory;
  readonly categoryLabel: string;
  readonly subtitle: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly cover: string;
  readonly coverAlt: string;
  readonly coverShowcase?: keyof typeof showcaseImages;
  readonly coverVideo?: {
    readonly src: string;
    readonly poster: string;
    readonly width: number;
    readonly height: number;
  };
  readonly context: string;
  readonly solution: string;
  readonly result: string;
  readonly timing: string | null;
  readonly kind: string;
  readonly gallery: readonly GalleryScreen[];
  readonly features: readonly (readonly [string, string])[];
  readonly featuresHeading?: string;
  readonly demo?: string;
  readonly demoLabel?: string;
  readonly presentationNote?: string;
  readonly mobilePresentation?: string;
  readonly accessNote?: string;
  readonly mobileScreenshots?: boolean;
  readonly mobileOnly?: boolean;
  readonly showcase?: readonly string[];
}

export interface ImageSource {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly concept?: boolean;
  readonly placeholder?: boolean;
}

export interface Screenshot extends ImageSource {
  readonly original?: string;
  readonly originalWidth?: number;
  readonly originalHeight?: number;
  readonly enhanced?: boolean;
  readonly portrait?: boolean;
  readonly deviceFrame?: "iphone";
  readonly mobile?: ImageSource;
}
