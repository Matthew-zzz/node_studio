type LandingServiceArtworkProps = {
  serviceId: string;
};

export function LandingServiceArtwork({ serviceId }: LandingServiceArtworkProps) {
  const line = `landing-art-line-${serviceId}`;
  const glow = `landing-art-glow-${serviceId}`;

  return (
    <svg className="landing-service-illustration" viewBox="0 0 600 300" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={line} x1="70" y1="250" x2="535" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00DEF4" stopOpacity=".12" />
          <stop offset=".42" stopColor="#5178FF" stopOpacity=".78" />
          <stop offset="1" stopColor="#ED80FB" stopOpacity=".88" />
        </linearGradient>
        <linearGradient id={glow} x1="78" y1="264" x2="524" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00DEF4" />
          <stop offset=".5" stopColor="#315BFF" />
          <stop offset="1" stopColor="#B747FF" />
        </linearGradient>
        <radialGradient id={`${glow}-mist`} cx="0" cy="0" r="1" gradientTransform="matrix(0 177 -305 0 380 188)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7448F4" stopOpacity=".24" />
          <stop offset="1" stopColor="#121629" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path d="M150 300C226 205 300 141 382 111c70-25 140-20 218 12v177H150Z" fill={`url(#${glow}-mist)`} />

      {serviceId === "website" && (
        <g>
          <path d="M283 298c21-57 35-116 66-165 27-43 67-79 134-114" stroke={`url(#${glow})`} strokeWidth="20" opacity=".12" />
          <path d="M283 298c21-57 35-116 66-165 27-43 67-79 134-114" stroke={`url(#${line})`} strokeWidth="1.2" pathLength="1" />
          <path d="M345 300c10-55 22-107 51-150 29-44 71-78 133-108" stroke={`url(#${line})`} strokeWidth="1.1" strokeOpacity=".7" pathLength="1" />
          <path d="M407 300c1-48 8-91 32-127 25-39 62-69 112-94" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".52" pathLength="1" />
          <path d="M467 300c-6-42-3-77 17-108 17-27 42-49 76-69" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".34" pathLength="1" />
          <path d="M281 276c50-5 94-1 130 14" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".45" pathLength="1" />
        </g>
      )}

      {serviceId === "new-product" && (
        <g>
          <path d="M364 48 524 136v90l-160 92-160-92v-90l160-88Z" stroke={`url(#${glow})`} strokeWidth="18" opacity=".1" />
          <path d="M364 48 524 136v90l-160 92-160-92v-90l160-88Z" stroke={`url(#${line})`} strokeWidth="1.2" pathLength="1" />
          <path d="m364 88 121 67v58l-121 70-121-70v-58l121-67Z" stroke={`url(#${line})`} strokeWidth="1.1" strokeOpacity=".74" pathLength="1" />
          <path d="m364 128 82 45v20l-82 48-82-48v-20l82-45Z" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".56" pathLength="1" />
          <circle cx="364" cy="184" r="8" fill="#8A72FF" fillOpacity=".3" />
          <circle cx="364" cy="184" r="3" fill="#D9D5FF" fillOpacity=".8" />
        </g>
      )}

      {serviceId === "improve" && (
        <g>
          <path d="M417 38c72 0 130 58 130 130s-58 130-130 130-130-58-130-130S345 38 417 38Z" stroke={`url(#${glow})`} strokeWidth="22" opacity=".1" />
          <circle cx="417" cy="168" r="130" stroke={`url(#${line})`} strokeWidth="1.2" pathLength="1" />
          <circle cx="417" cy="168" r="100" stroke={`url(#${line})`} strokeWidth="1.1" strokeOpacity=".76" pathLength="1" />
          <circle cx="417" cy="168" r="70" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".58" pathLength="1" />
          <path d="M417 38v260M287 168h260M325 76l184 184M509 76 325 260" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".28" pathLength="1" />
          <circle cx="417" cy="168" r="9" fill="#C6B8FF" fillOpacity=".72" />
        </g>
      )}

      {serviceId === "integrations" && (
        <g>
          <path d="M260 220c57-122 108-143 158-72s88 67 142-22" stroke={`url(#${glow})`} strokeWidth="22" opacity=".12" />
          <path d="M260 220c57-122 108-143 158-72s88 67 142-22" stroke={`url(#${line})`} strokeWidth="1.4" pathLength="1" />
          <path d="M255 230c74 8 112-18 155-61s83-48 148-35" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".62" pathLength="1" />
          <path d="M294 90c28 34 51 68 70 105 20 39 47 67 104 78" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".44" pathLength="1" />
          <circle cx="260" cy="220" r="6" fill="#9A8BFF" />
          <circle cx="418" cy="148" r="6" fill="#79BCFF" />
          <circle cx="560" cy="126" r="6" fill="#DC89FF" />
          <circle cx="468" cy="273" r="4" fill="#00DEF4" fillOpacity=".72" />
        </g>
      )}

      {serviceId === "telegram" && (
        <g>
          <path d="M373 45h106c21 0 38 17 38 38v169c0 21-17 38-38 38H373c-21 0-38-17-38-38V83c0-21 17-38 38-38Z" stroke={`url(#${glow})`} strokeWidth="20" opacity=".1" />
          <rect x="335" y="45" width="182" height="245" rx="37" stroke={`url(#${line})`} strokeWidth="1.2" pathLength="1" />
          <rect x="354" y="68" width="144" height="197" rx="23" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".72" pathLength="1" />
          <path d="m298 155 78-30-26 74-15-24-37-20Zm37 20 18 24 11-35" stroke={`url(#${line})`} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
          <circle cx="426" cy="276" r="3" fill="#C7B7FF" fillOpacity=".72" />
        </g>
      )}

      {serviceId === "automation" && (
        <g>
          <path d="M226 218c52-96 86-128 132-105s65 97 108 79 57-102 114-121" stroke={`url(#${glow})`} strokeWidth="24" opacity=".11" />
          <path d="M226 218c52-96 86-128 132-105s65 97 108 79 57-102 114-121" stroke={`url(#${line})`} strokeWidth="1.4" pathLength="1" />
          <path d="M226 242c60-58 99-78 141-54s67 67 112 48 61-70 101-87" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".66" pathLength="1" />
          <path d="M246 267c61-31 100-36 137-17s75 37 119 18 59-44 79-57" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".4" pathLength="1" />
          <circle cx="358" cy="113" r="5" fill="#8D9DFF" />
          <circle cx="466" cy="192" r="5" fill="#9C83FF" />
        </g>
      )}

      {serviceId === "ai" && (
        <g>
          <path d="M424 20c75 43 119 94 119 149s-44 106-119 149c-75-43-119-94-119-149S349 63 424 20Z" stroke={`url(#${glow})`} strokeWidth="22" opacity=".11" />
          <path d="M424 20c75 43 119 94 119 149s-44 106-119 149c-75-43-119-94-119-149S349 63 424 20Z" stroke={`url(#${line})`} strokeWidth="1.2" pathLength="1" />
          <path d="M424 45c48 39 76 81 76 124s-28 85-76 124c-48-39-76-81-76-124s28-85 76-124Z" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".76" pathLength="1" />
          <path d="M307 169h234M329 112c63 38 127 38 190 0M329 226c63-38 127-38 190 0" stroke={`url(#${line})`} strokeWidth="1" strokeOpacity=".42" pathLength="1" />
          <circle cx="424" cy="169" r="8" fill="#B19BFF" fillOpacity=".62" />
        </g>
      )}
    </svg>
  );
}
