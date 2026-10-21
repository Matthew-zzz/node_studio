export type TelegramTag = "b" | "i" | "u" | "s" | "code" | "pre" | "blockquote" | "a";
export type TelegramNode = { text: string } | { tag: TelegramTag; href?: string; children: TelegramNode[] };
const aliases: Record<string, TelegramTag> = { b: "b", strong: "b", i: "i", em: "i", u: "u", ins: "u", s: "s", strike: "s", del: "s", code: "code", pre: "pre", blockquote: "blockquote", a: "a" };
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function decode(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[\da-f]{1,6});/gi, entity => {
    const names: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (names[entity.toLowerCase()]) return names[entity.toLowerCase()]!;
    const code = entity.toLowerCase().startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "�";
  });
}

/** One allowlist is shared by the Telegram adapter and React previews; no raw HTML reaches the DOM. */
export function parseTelegramHtml(input: string, maxChars = 4000): TelegramNode[] {
  const root: TelegramNode[] = [];
  const stack: { tag?: TelegramTag; children: TelegramNode[] }[] = [{ children: root }];
  let length = 0; let truncated = false;
  function append(raw: string) {
    let value = "";
    for (const char of decode(raw)) {
      if (length + char.length > maxChars - 1) { truncated = true; break; }
      value += char; length += char.length;
    }
    if (value) stack.at(-1)!.children.push({ text: value });
  }
  for (const token of input.slice(0, 64000).match(/<[^>]*>|[^<]+|</g) ?? []) {
    if (truncated) break;
    const match = token.match(/^<(\/)?([a-z][a-z0-9]*)\b([^>]*)>$/i);
    if (!match) { append(token); continue; }
    const closing = Boolean(match[1]); const name = match[2]!.toLowerCase(); const tag = Object.hasOwn(aliases, name) ? aliases[name] : undefined;
    if (name === "br" || (closing && ["p", "div", "li"].includes(name))) { append("\n"); continue; }
    if (name === "li" && !closing) { append("• "); continue; }
    if (!tag) { if (!["p", "div", "ul", "ol"].includes(name)) append(token); continue; }
    if (closing) {
      const index = stack.findLastIndex(entry => entry.tag === tag);
      if (index > 0) stack.length = index;
      continue;
    }
    if (stack.some(entry => entry.tag === "code" || entry.tag === "pre") && !(tag === "code" && stack.at(-1)?.tag === "pre")) { append(token); continue; }
    if (tag === "blockquote" && stack.some(entry => entry.tag === tag)) continue;
    if (tag === "code" || tag === "pre") {
      if (!(tag === "code" && stack.at(-1)?.tag === "pre")) stack.length = 1;
    }
    let href: string | undefined;
    if (tag === "a") {
      const target = match[3]!.match(/^\s+href\s*=\s*(["'])([^<>]*?)\1\s*$/i)?.[2];
      try {
        const url = new URL(decode(target ?? ""));
        if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password) continue;
        href = url.href;
      } catch { continue; }
      if (stack.some(entry => entry.tag === "a")) continue;
    }
    if (stack.length >= 12) continue;
    const node: TelegramNode = { tag, ...(href ? { href } : {}), children: [] };
    stack.at(-1)!.children.push(node); stack.push(node);
  }
  if (truncated) stack.at(-1)!.children.push({ text: "…" });
  return root;
}

export function formatTelegramHtml(input: string, maxChars = 4000): { html: string; text: string } {
  const nodes = parseTelegramHtml(input, maxChars);
  const plain = (items: TelegramNode[]): string => items.map(node => "text" in node ? node.text : plain(node.children)).join("");
  const html = (items: TelegramNode[]): string => items.map(node => "text" in node ? escapeHtml(node.text) : `<${node.tag}${node.href ? ` href="${escapeHtml(node.href)}"` : ""}>${html(node.children)}</${node.tag}>`).join("");
  return { html: html(nodes), text: plain(nodes) };
}
