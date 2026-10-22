import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PortalError } from "./store.ts";

export function seal(content: string, key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new PortalError(503, "Не настроен ключ шифрования писем.");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function unseal(content: string, key: string): string {
  const data = Buffer.from(content, "base64"); const decipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
