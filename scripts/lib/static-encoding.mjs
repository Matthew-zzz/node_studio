export const compressibleExtensions = new Set([".html", ".css", ".js", ".json", ".txt", ".xml", ".svg", ".webmanifest"]);

export function encodingPreferences(header = "") {
  const weights = new Map();
  for (const entry of header.toLowerCase().split(",")) {
    const [encoding, ...parameters] = entry.trim().split(/\s*;\s*/);
    if (!encoding) continue;
    const quality = parameters.find((parameter) => /^q\s*=/.test(parameter));
    const value = quality ? quality.slice(quality.indexOf("=") + 1).trim() : "1";
    weights.set(encoding, /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(value) ? Number(value) : 0);
  }
  return {
    gzip: weights.get("gzip") ?? weights.get("*") ?? 0,
    identity: weights.get("identity") ?? (weights.get("*") === 0 ? 0 : 1),
  };
}
