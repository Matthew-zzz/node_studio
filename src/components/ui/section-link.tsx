"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { scrollToSection } from "@/lib/section-navigation";

type SectionLinkProps = Omit<ComponentProps<typeof Link>, "href" | "scroll" | "onNavigate"> & { href: string };

export function SectionLink({ href, ...props }: SectionLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      scroll={false}
      onNavigate={() => {
        const url = new URL(href, window.location.href);
        if (url.pathname === window.location.pathname) scrollToSection(url.hash);
      }}
    />
  );
}
