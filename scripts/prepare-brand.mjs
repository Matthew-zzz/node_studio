import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const source = process.argv[2] ?? "public/assets/brand/node-monogram-transparent.png";
const input = await readFile(resolve(source));
const metadata = await sharp(input).metadata();
const stats = await sharp(input).stats();
if (!metadata.hasAlpha || stats.isOpaque || metadata.width !== metadata.height) throw new Error("Expected a square NS master with genuine transparency.");
const previous = JSON.parse(await readFile("docs/asset-generation/node-studio-avatar.json", "utf8"));
const image = () => sharp(input);
const directory = resolve("public/assets/brand");
await mkdir(directory, { recursive: true });
await image().resize(192, 192).webp({ quality: 94, effort: 6 }).toFile(resolve(directory, "node-monogram.webp"));
await image().resize(32, 32).png({ compressionLevel: 9 }).toFile(resolve(directory, "favicon-32.png"));
await image().resize(180, 180).png({ compressionLevel: 9 }).toFile(resolve(directory, "apple-touch-icon.png"));
await image().resize(512, 512).png({ compressionLevel: 9 }).toFile(resolve("public/assets/node-studio-avatar.png"));
const icon = await image().resize(64, 64).png({ compressionLevel: 9 }).toBuffer();
await writeFile("public/assets/favicon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><clipPath id="rounded"><rect width="64" height="64" rx="14"/></clipPath></defs><image width="64" height="64" clip-path="url(#rounded)" href="data:image/png;base64,${icon.toString("base64")}"/></svg>\n`);
const previewLogo = await image().resize(192, 192).png({ compressionLevel: 9 }).toBuffer();
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="brand-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop stop-color="#00def4"/><stop offset="50%" stop-color="#4730ff"/><stop offset="100%" stop-color="#ed80fb"/></linearGradient></defs><rect width="1200" height="630" fill="#080b19"/><path d="M1040 0v630M940 0v630M840 0v630M740 0v630M640 0v630M540 0v630M0 130h1200M0 230h1200M0 330h1200M0 430h1200M0 530h1200" stroke="#1c2033"/><image x="72" y="30" width="96" height="96" href="data:image/png;base64,${previewLogo.toString("base64")}"/><text x="190" y="98" fill="#f1f3fb" font-family="Arial,sans-serif" font-size="38" font-weight="700">Node / studio</text><text x="80" y="240" fill="#f1f3fb" font-family="Arial,sans-serif" font-size="66" font-weight="700">Свяжем ваши сервисы.</text><text x="80" y="325" fill="#f1f3fb" font-family="Arial,sans-serif" font-size="66" font-weight="700">Автоматизируем рутину.</text><text x="80" y="410" fill="#f1f3fb" font-family="Arial,sans-serif" font-size="66" font-weight="700">Запустим ваш продукт.</text><text x="80" y="485" fill="#a6abc3" font-family="Arial,sans-serif" font-size="28">Разработка · Автоматизация · ИИ</text><path d="M1050 510v-90h-90m90 0-110 110" fill="none" stroke="url(#brand-gradient)" stroke-width="12"/></svg>`;
await writeFile("public/assets/og-cover.svg", preview + "\n");
await sharp(Buffer.from(preview)).png({ compressionLevel: 9 }).toFile(resolve("public/assets/og-cover.png"));
await writeFile("docs/asset-generation/node-studio-avatar.json", JSON.stringify({
  asset: "public/assets/node-studio-avatar.png", brand: "Node Studio", source: basename(source),
  sourceSha256: createHash("sha256").update(input).digest("hex"),
  sourcePath: source,
  sourceDimensions: { width: metadata.width, height: metadata.height }, transparent: true,
  originalSource: previous.originalSource ?? { source: previous.source, sourceSha256: previous.sourceSha256, sourceDimensions: previous.sourceDimensions, crop: previous.crop },
  preparation: "Background removed with built-in image_gen; sharp exports preserve the generated alpha channel.",
  backgroundRemoval: {
    tool: "built-in image_gen",
    prompt: "Удали только чёрный/тёмно-синий фон вокруг и внутри просветов монограммы NS. Сохрани в точности форму, пропорции, положение, гладкие края, блики и существующий градиент циан—синий—фиолетовый—розовый. Не перерисовывай и не меняй знак. Результат — PNG с настоящей прозрачностью (alpha=0 вне букв), без подложки, шахматного узора, теней и тёмного ореола.",
  },
  command: "node scripts/prepare-brand.mjs [transparent-logo.png]",
  exports: ["public/assets/brand/node-monogram-transparent.png", "public/assets/brand/node-monogram.webp", "public/assets/brand/favicon-32.png", "public/assets/brand/apple-touch-icon.png", "public/assets/node-studio-avatar.png", "public/assets/favicon.svg", "public/assets/og-cover.svg", "public/assets/og-cover.png"],
}, null, 2) + "\n");
console.log("NS monogram exports prepared.");
