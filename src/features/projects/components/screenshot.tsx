import Image from "next/image";
import { responsiveScreenshots } from "@/features/projects/data/responsive-screenshots";
import type { Screenshot as ScreenshotData } from "@/features/projects/model/types";

interface ScreenshotProps {
  image: ScreenshotData;
  alt: string;
  sizes: string;
  priority?: boolean;
  useMobile?: boolean;
  draggable?: boolean;
}

export function Screenshot({ image, alt, sizes, priority = false, useMobile = true, draggable }: ScreenshotProps) {
  const mobile = useMobile ? image.mobile : undefined;
  const desktopSource = responsiveScreenshots[image.src];
  const mobileSource = mobile ? responsiveScreenshots[mobile.src] : undefined;
  if (!desktopSource || (mobile && !mobileSource)) throw new Error(`Run npm run assets:screenshots for ${image.src}`);

  return (
    <picture className="responsive-picture">
      {mobile && mobileSource && (
        <>
          <source
            type="image/webp"
            media="(max-width: 760px)"
            srcSet={mobileSource.srcSet}
            sizes={sizes}
            width={mobile.width}
            height={mobile.height}
          />
          <source media="(max-width: 760px)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />
        </>
      )}
      <source type="image/webp" srcSet={desktopSource.srcSet} sizes={sizes} />
      <Image
        src={image.src}
        alt={alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={draggable}
      />
    </picture>
  );
}
