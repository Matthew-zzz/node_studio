import { technologyPaths } from "@/features/home/data/technology-icons";
import type { TechnologyIconName } from "@/features/home/data/technology-icons";

export function TechnologyIcon({ name }: { name: TechnologyIconName }) {
  return (
    <svg viewBox="0 0 24 24" width={32} height={32} fill="currentColor" aria-hidden="true" focusable="false">
      {technologyPaths[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
