import { ViewportVideo } from "@/components/ui/viewport-video";

export function LandingHeroVideo() {
  return (
    <ViewportVideo
      className="landing-hero-video"
      src="/assets/video/hero-desktop.mp4"
      mobileSrc="/assets/video/hero-mobile.mp4"
      poster="/assets/video/hero-last.jpg"
      playOnce
      aria-hidden="true"
    />
  );
}
