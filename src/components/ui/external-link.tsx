import type { ComponentPropsWithoutRef } from "react";

export function ExternalLink({ children, ...props }: ComponentPropsWithoutRef<"a">) {
  return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
}
