import { PortalError } from "./store.ts";
import type { WorkStatus, Role } from "../src/features/portal/model/types.ts";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PortalError(400, "Некорректный запрос.");
  return value as Record<string, unknown>;
}

export function text(value: unknown, max = 8000, min = 1): string {
  if (typeof value !== "string" || value.trim().length < min || value.length > max || value.includes("\0")) {
    throw new PortalError(400, `Введите текст от ${min} до ${max} символов.`);
  }
  return value.trim();
}

export function integer(value: unknown, min = 1, max = 1_000_000_000): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new PortalError(400, "Некорректное число.");
  return Number(value);
}

export function passwordInput(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256 || value.includes("\0")) throw new PortalError(400, "Введите пароль до 256 символов.");
  return value;
}

export function status(value: unknown): WorkStatus {
  if (!["new", "in_progress", "done", "canceled"].includes(String(value))) throw new PortalError(400, "Неизвестный статус.");
  return value as WorkStatus;
}

export function optionalRole(value: unknown): Role | undefined {
  if (value === undefined || value === "") return undefined;
  if (!["client", "developer", "admin"].includes(String(value))) throw new PortalError(400, "Выберите роль аккаунта.");
  return value as Role;
}
