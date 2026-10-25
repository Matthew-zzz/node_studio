"use client";

import { useEffect, useRef } from "react";

export function LandingHeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const finishPlayback = () => {
      video.pause();
      video.currentTime = video.duration;
      video.classList.add("is-finished");
    };

    video.addEventListener("ended", finishPlayback);
    const playback = video.play();
    playback?.catch(() => {
      // Keep the last frame visible when autoplay is blocked by browser policy.
      finishPlayback();
    });

    return () => video.removeEventListener("ended", finishPlayback);
  }, []);

  return (
    <video
      ref={videoRef}
      className="landing-hero-video"
      src="/assets/node-studio-home-hero.mp4"
      poster="/assets/node-studio-home-hero-poster.jpg"
      muted
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );
}
