import type { ReactNode } from "react";

export function DeviceFrame({ children }: { children: ReactNode }) {
  return (
    <div className="iphone-frame">
      <div className="iphone-display">
        <div className="iphone-statusbar" aria-hidden="true">
          <span className="iphone-time">9:41</span>
          <span className="iphone-island" />
          <span className="iphone-status-icons">
            <svg viewBox="0 0 20 14" fill="currentColor"><path d="M1 10h3v4H1zm5-3h3v7H6zm5-3h3v10h-3zm5-3h3v13h-3z" /></svg>
            <svg
              viewBox="0 0 20 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M2 4.5a12 12 0 0 1 16 0M5 8a7.5 7.5 0 0 1 10 0M8 11.2a3 3 0 0 1 4 0" />
            </svg>
            <svg className="iphone-battery" viewBox="0 0 28 14" fill="none">
              <rect
                x=".75"
                y=".75"
                width="23.5"
                height="12.5"
                rx="3"
                stroke="currentColor"
                strokeOpacity=".55"
                strokeWidth="1.5"
              />
              <rect
                x="3"
                y="3"
                width="18.5"
                height="8"
                rx="1.5"
                fill="currentColor"
              />
              <path d="M26 4.5v5c1.1-.35 1.7-1.15 1.7-2.5S27.1 4.85 26 4.5Z" fill="currentColor" fillOpacity=".65" />
            </svg>
          </span>
        </div>
        {children}
        <div className="iphone-home-area" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
