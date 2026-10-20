import type { ReactNode } from "react";

export function ResponsiveCopy({ wide, compact }: { wide: ReactNode; compact: ReactNode }) {
  return (
    <>
      <span data-copy-wide="">{wide}</span>
      <span data-copy-compact="">{compact}</span>
    </>
  );
}
