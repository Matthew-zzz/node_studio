import Image from "next/image";
import { showcaseImages } from "@/features/projects/data/showcase-images";
import styles from "./projects-section.module.css";

// Match the single-column breakpoint, container gutters and capped two-column grid.
const sizes = "(max-width: 360px) calc(100vw - 32px), (max-width: 640px) calc(100vw - 40px), (max-width: 760px) calc(46vw - 20px), (max-width: 1150px) calc(46vw - 32px), (max-width: 1216px) calc(46vw - 48px), (max-width: 1500px) calc(560px - 4vw), 500px";

export function ShowcaseImage({ name, alt }: { name: keyof typeof showcaseImages; alt: string }) {
  const image = showcaseImages[name];

  return (
    <picture className={styles.picture}>
      <source type="image/webp" srcSet={image.srcSet} sizes={sizes} />
      <Image src={image.fallback} alt={alt} fill sizes={sizes} loading="lazy" decoding="async" />
    </picture>
  );
}
