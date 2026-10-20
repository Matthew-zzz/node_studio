import type { CSSProperties } from "react";
import { HeroAtmosphereMotion } from "@/features/home/components/hero-atmosphere-motion";

export function HeroAtmosphere() {
  return (
    <HeroAtmosphereMotion>
      <div className="intro-atmosphere-plane">
        <div className="intro-aura intro-aura-blue" />
        <div className="intro-aura intro-aura-violet" />
        <svg
          className="intro-flow-map"
          viewBox="0 0 1600 680"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="intro-flow-ink"
              x1="240"
              y1="0"
              x2="1520"
              y2="520"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#5a87f6" stopOpacity=".04" />
              <stop offset=".46" stopColor="#6489ed" stopOpacity=".3" />
              <stop offset=".76" stopColor="#9c7cf0" stopOpacity=".5" />
              <stop offset="1" stopColor="#7365d8" stopOpacity=".08" />
            </linearGradient>
            <linearGradient
              id="intro-flow-light"
              x1="220"
              y1="0"
              x2="1600"
              y2="400"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#517bf4" />
              <stop offset=".5" stopColor="#83a8ff" />
              <stop offset="1" stopColor="#ab8cf4" />
            </linearGradient>
            <pattern
              id="intro-flow-grid"
              x="16"
              y="4"
              width="64"
              height="64"
              patternUnits="userSpaceOnUse"
            >
              <path d="M64 0H0V64" stroke="#8b9ad1" strokeOpacity=".055" />
              <path d="M61 4H67M64 1V7" stroke="#8b9ad1" strokeOpacity=".13" />
            </pattern>
          </defs>
          <rect width="1600" height="680" fill="url(#intro-flow-grid)" />
          <g className="intro-flow-routes">
            <g className="intro-flow-route" style={{ "--route-time": "7s", "--route-delay": "0s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M-80 60H620C716 60 716 132 812 132H1096C1176 132 1176 56 1256 56H1680" />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 60H620C716 60 716 132 812 132H1096C1176 132 1176 56 1256 56H1680"
                transform="translate(0 8)"
              />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 60H620C716 60 716 132 812 132H1096C1176 132 1176 56 1256 56H1680"
                transform="translate(0 -8)"
              />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 60H620C716 60 716 132 812 132H1096C1176 132 1176 56 1256 56H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 60H620C716 60 716 132 812 132H1096C1176 132 1176 56 1256 56H1680"
              />
            </g>
            <g className="intro-flow-route" style={{ "--route-time": "7.8s", "--route-delay": "-1.7s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M-80 112H484C604 112 604 228 724 228H1104C1268 228 1268 360 1432 360H1680" />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 112H484C604 112 604 228 724 228H1104C1268 228 1268 360 1432 360H1680"
                transform="translate(0 8)"
              />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 112H484C604 112 604 228 724 228H1104C1268 228 1268 360 1432 360H1680"
                transform="translate(0 -8)"
              />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 112H484C604 112 604 228 724 228H1104C1268 228 1268 360 1432 360H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 112H484C604 112 604 228 724 228H1104C1268 228 1268 360 1432 360H1680"
              />
            </g>
            <g className="intro-flow-route" style={{ "--route-time": "8.6s", "--route-delay": "-3.4s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M-80 310H500C620 310 620 228 740 228H1104C1248 228 1248 512 1392 512H1680" />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 310H500C620 310 620 228 740 228H1104C1248 228 1248 512 1392 512H1680"
                transform="translate(0 8)"
              />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 310H500C620 310 620 228 740 228H1104C1248 228 1248 512 1392 512H1680"
                transform="translate(0 -8)"
              />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 310H500C620 310 620 228 740 228H1104C1248 228 1248 512 1392 512H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 310H500C620 310 620 228 740 228H1104C1248 228 1248 512 1392 512H1680"
              />
            </g>
            <g className="intro-flow-route" style={{ "--route-time": "9.4s", "--route-delay": "-5.1s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M-80 460H652C772 460 772 324 892 324H1268C1388 324 1388 220 1508 220H1680" />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 460H652C772 460 772 324 892 324H1268C1388 324 1388 220 1508 220H1680"
                transform="translate(0 8)"
              />
              <path
                className="intro-flow-fiber"
                stroke="url(#intro-flow-ink)"
                d="M-80 460H652C772 460 772 324 892 324H1268C1388 324 1388 220 1508 220H1680"
                transform="translate(0 -8)"
              />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 460H652C772 460 772 324 892 324H1268C1388 324 1388 220 1508 220H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M-80 460H652C772 460 772 324 892 324H1268C1388 324 1388 220 1508 220H1680"
              />
            </g>
            <g className="intro-flow-route" style={{ "--route-time": "10.2s", "--route-delay": "-6.8s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M820-80V-8C820 72 916 72 1012 72H1256C1352 72 1352 168 1448 168H1680" />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M820-80V-8C820 72 916 72 1012 72H1256C1352 72 1352 168 1448 168H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M820-80V-8C820 72 916 72 1012 72H1256C1352 72 1352 168 1448 168H1680"
              />
            </g>
            <g className="intro-flow-route" style={{ "--route-time": "11s", "--route-delay": "-8.5s" } as CSSProperties}>
              <path className="intro-flow-track" stroke="url(#intro-flow-ink)" d="M900 760V504C900 424 980 424 1060 424H1284C1364 424 1364 300 1444 300H1680" />
              <path
                className="intro-flow-beam intro-flow-beam-halo"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M900 760V504C900 424 980 424 1060 424H1284C1364 424 1364 300 1444 300H1680"
              />
              <path
                className="intro-flow-beam"
                stroke="url(#intro-flow-light)"
                pathLength="100"
                d="M900 760V504C900 424 980 424 1060 424H1284C1364 424 1364 300 1444 300H1680"
              />
            </g>
            <g className="intro-flow-node" transform="translate(1096 132)" style={{ "--node-delay": "0s" } as CSSProperties}>
              <rect
                className="intro-flow-node-ring"
                x="-12"
                y="-12"
                width="24"
                height="24"
                rx="7"
              />
              <rect
                className="intro-flow-node-body"
                x="-6"
                y="-6"
                width="12"
                height="12"
                rx="3"
              />
              <circle className="intro-flow-node-core" r="2" />
            </g>
            <g className="intro-flow-node" transform="translate(1104 228)" style={{ "--node-delay": "-2.2s" } as CSSProperties}>
              <rect
                className="intro-flow-node-ring"
                x="-12"
                y="-12"
                width="24"
                height="24"
                rx="7"
              />
              <rect
                className="intro-flow-node-body"
                x="-6"
                y="-6"
                width="12"
                height="12"
                rx="3"
              />
              <circle className="intro-flow-node-core" r="2" />
            </g>
            <g className="intro-flow-node" transform="translate(1268 324)" style={{ "--node-delay": "-4.4s" } as CSSProperties}>
              <rect
                className="intro-flow-node-ring"
                x="-12"
                y="-12"
                width="24"
                height="24"
                rx="7"
              />
              <rect
                className="intro-flow-node-body"
                x="-6"
                y="-6"
                width="12"
                height="12"
                rx="3"
              />
              <circle className="intro-flow-node-core" r="2" />
            </g>
            <g className="intro-flow-node" transform="translate(1060 424)" style={{ "--node-delay": "-6.6000000000000005s" } as CSSProperties}>
              <rect
                className="intro-flow-node-ring"
                x="-12"
                y="-12"
                width="24"
                height="24"
                rx="7"
              />
              <rect
                className="intro-flow-node-body"
                x="-6"
                y="-6"
                width="12"
                height="12"
                rx="3"
              />
              <circle className="intro-flow-node-core" r="2" />
            </g>
          </g>
        </svg>
      </div>
      <div className="intro-atmosphere-veil" />
    </HeroAtmosphereMotion>
  );
}
