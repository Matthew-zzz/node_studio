import type { SVGProps } from "react";

const paths = {
  arrow: (<>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </>),
  diagonal: (<>
    <path d="M6 18 18 6M6 6h12v12" />
  </>),
  code: (<>
    <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18" />
  </>),
  flow: (<>
    <rect x="3" y="3" width="6" height="6" rx="1.5" />
    <rect x="15" y="15" width="6" height="6" rx="1.5" />
    <path d="M6 9v7a2 2 0 0 0 2 2h7M9 6h7a2 2 0 0 1 2 2v7" />
  </>),
  spark: (<>
    <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" />
  </>),
  bot: (<>
    <rect x="4" y="7" width="16" height="13" rx="4" />
    <path d="M12 3v4M9 13h.01M15 13h.01M8 17h8M1 12v4m22-4v4" />
  </>),
  telegram: (<>
    <path d="m21 3-4 18-6-5-3 3 1-6 9-7-12 5-4-2 19-6Z" />
  </>),
  document: (<>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
    <path d="M14 2v6h6M8 12h8M8 16h6" />
  </>),
  check: (<>
    <path d="m5 12 4 4L19 6" />
  </>),
  plus: (<>
    <path d="M12 5v14M5 12h14" />
  </>),
  close: (<>
    <path d="m6 6 12 12M18 6 6 18" />
  </>),
  copy: (<>
    <rect x="8" y="8" width="12" height="13" rx="2" />
    <path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" />
  </>),
  search: (<>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m16 16 5 5" />
  </>),
  clock: (<>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>),
  menu: (<>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </>),
  more: (<>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </>),
  site: (<>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h5M7 16h9" />
  </>),
  table: (<>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M3 9h18M3 15h18M9 9v12M15 9v12" />
  </>),
  columns: (<>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M12 4v16" />
  </>),
  swap: (<>
    <path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" />
  </>),
  database: (<>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
  </>),
  service: (<>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </>),
  people: (<>
    <circle cx="9" cy="7" r="3" />
    <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2" />
  </>),
  trigger: (<>
    <path d="m13 2-9 12h7l-1 8 10-12h-7l1-8Z" />
  </>),
  mail: (<>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m4 7 8 6 8-6" />
  </>),
};

export type IconName = keyof typeof paths;
type IconProps = Omit<SVGProps<SVGSVGElement>, "name"> & { name: IconName };

export function Icon({ name, className = "icon", strokeWidth = 1.6, ...props }: IconProps) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
