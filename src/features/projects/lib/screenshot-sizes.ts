// Match the existing container gutters, stage padding, phone frames and carousel.
// These are CSS display widths; the browser also accounts for device pixel density.
export const screenshotSizes = {
  cover: "(max-width: 360px) calc(100vw - 62px), (max-width: 380px) calc(100vw - 70px), (max-width: 760px) min(420px, calc(100vw - 86px)), (max-width: 1150px) calc(89vw - 66px), (max-width: 1310px) calc(89vw - 98px), (max-width: 1376px) calc(100vw - 242px), 1134px",
  portraitCover: "(max-width: 360px) calc(100vw - 72px), (max-width: 760px) min(428px, calc(100vw - 80px)), (max-width: 1000px) 282px, 311px",
  gallery: "(max-width: 360px) calc(100vw - 64px), (max-width: 457px) calc(100vw - 72px), (max-width: 760px) min(440px, calc(93vw - 40px)), (max-width: 1150px) calc(93vw - 64px), (max-width: 1257px) calc(93vw - 96px), (max-width: 1376px) calc(100vw - 184px), 1192px",
  portraitGallery: "(max-width: 360px) calc(100vw - 76px), (max-width: 457px) calc(100vw - 84px), (max-width: 760px) min(428px, calc(93vw - 52px)), (max-width: 1150px) calc(39.5vw - 44px), min(428px, calc(39.5vw - 60px))",
  carousel: "(max-width: 360px) calc(86vw - 44px), (max-width: 760px) calc(86vw - 51px), (max-width: 1150px) calc(78vw - 72px), min(920px, calc(78vw - 97px))",
} as const;
