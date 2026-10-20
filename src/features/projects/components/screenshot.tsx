import Image from "next/image";
import type { Screenshot as ScreenshotData } from "@/features/projects/model/types";

interface ScreenshotProps {
  image: ScreenshotData;
  alt: string;
  priority?: boolean;
}

export function Screenshot({ image, alt, priority = false }: ScreenshotProps) {
  return (
    <picture className="responsive-picture">
      {image.mobile && (
        <source
          media="(max-width: 760px)"
          srcSet={image.mobile.src}
          width={image.mobile.width}
          height={image.mobile.height}
        />
      )}
      <Image
        src={image.src}
        alt={alt}
        width={image.width}
        height={image.height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}
