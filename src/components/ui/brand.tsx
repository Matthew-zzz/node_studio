import Link from "next/link";
import Image from "next/image";

export function BrandMark({ size, className = "" }: { size?: number; className?: string | undefined } = {}) {
  return (
    <span className={`brand-symbol ${className}`} data-brand-mark="" aria-hidden="true" {...(size ? { style: { width: size, height: size } } : {})}>
      <Image className="brand-image" src="/assets/brand/node-monogram.webp?v=transparent" width={192} height={192} alt="" />
    </span>
  );
}

export function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <Link className="brand" href="/" aria-label="NodeStudio — главная" {...(onNavigate ? { onNavigate } : {})}>
      <span>NodeStudio</span>
    </Link>
  );
}
