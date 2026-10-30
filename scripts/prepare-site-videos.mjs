import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const assets = new URL("../public/assets/", import.meta.url);
const output = new URL("video/", assets);
const jobs = [
  { source: "node-studio-home-hero.mp4", file: "hero-desktop.mp4", crf: 23 },
  { source: "node-studio-home-hero.mp4", file: "hero-mobile.mp4", crf: 24, width: 1280 },
  { source: "nodestudio-ai-showcase.mp4", file: "ai-showcase.mp4", crf: 23 },
];

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
  });
}

await mkdir(output, { recursive: true });
const manifest = [];
for (const job of jobs) {
  const input = new URL(job.source, assets);
  const destination = new URL(job.file, output);
  console.log(`Preparing ${job.file}...`);
  await run([
    "-i", fileURLToPath(input), "-map", "0:v:0", "-an", "-sn", "-dn",
    ...(job.width ? ["-vf", `scale=${job.width}:-2:flags=lanczos`] : []),
    "-c:v", "libx264", "-preset", "slow", "-crf", String(job.crf),
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2",
    fileURLToPath(destination),
  ]);
  const sourceBytes = await readFile(input);
  const bytes = (await stat(destination)).size;
  manifest.push({ source: job.source, sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"), sourceBytes: sourceBytes.length, file: `video/${job.file}`, bytes, crf: job.crf, ...(job.width ? { width: job.width } : {}), audio: false });
  console.log(`${job.file}: ${(bytes / 1024 / 1024).toFixed(2)} MiB`);
}

// The last short segment is written to one JPEG; the final decoded frame remains.
await run(["-sseof", "-0.15", "-i", fileURLToPath(new URL("hero-desktop.mp4", output)), "-map", "0:v:0", "-an", "-update", "1", "-q:v", "2", "-threads", "2", fileURLToPath(new URL("hero-last.jpg", output))]);
await run(["-i", fileURLToPath(new URL("ai-showcase.mp4", output)), "-map", "0:v:0", "-an", "-frames:v", "1", "-q:v", "2", "-threads", "2", fileURLToPath(new URL("ai-poster.jpg", output))]);
await writeFile(new URL("../docs/asset-generation/site-videos.json", import.meta.url), JSON.stringify({ command: "npm run assets:videos", codec: "H.264 / yuv420p", frameRate: "Source frame rates preserved", fastStart: true, videos: manifest }, null, 2) + "\n");
