import Link from "next/link";

export function BrandMark() {
  return (
    <span className="brand-symbol" data-brand-mark="" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

export function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <Link className="brand" href="/" aria-label="Node Studio — главная" {...(onNavigate ? { onNavigate } : {})}>
      <BrandMark />
      <span>
        Node
        <span className="brand-studio">studio</span>
      </span>
    </Link>
  );
}
