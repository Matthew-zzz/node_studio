import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const source = new URL("../docs/asset-generation/site-icon-source.png", import.meta.url);
const input = await readFile(source);
const mark = await sharp(input)
  .rotate()
  .trim({ background: "#ffffff", threshold: 35 })
  .png()
  .toBuffer();

async function icon(size) {
  const padding = Math.max(1, Math.round(size / 16));
  const innerSize = size - padding * 2;
  return sharp(mark)
    .resize(innerSize, innerSize, { fit: "contain", background: "#ffffff" })
    .extend({ top: padding, bottom: padding, left: padding, right: padding, background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

for (const [size, filename] of [[32, "favicon-32x32.png"], [96, "favicon-96x96.png"], [180, "apple-touch-icon.png"]]) {
  await writeFile(new URL(`../public/${filename}`, import.meta.url), await icon(size));
}

// ICO supports multiple PNG frames, allowing browsers to select their native size.
const sizes = [16, 32, 48];
const frames = await Promise.all(sizes.map(icon));
const header = Buffer.alloc(6 + frames.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  header[entry] = sizes[index];
  header[entry + 1] = sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
const destination = new URL("../public/favicon.ico", import.meta.url);
await writeFile(destination, Buffer.concat([header, ...frames]));
console.log(`Site icons prepared from ${fileURLToPath(source)}.`);
