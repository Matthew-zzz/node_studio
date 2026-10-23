export interface TelegramWebApp {
  initData?: string;
  platform: string;
  colorScheme: "light" | "dark";
  viewportStableHeight: number;
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  onEvent(event: string, callback: () => void): void;
  offEvent(event: string, callback: () => void): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  BackButton: { show(): void; hide(): void; onClick(callback: () => void): void; offClick(callback: () => void): void };
}

declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

// Presentation fields remain untrusted. Only server-validated initData can scope an email login.
export function telegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const app = window.Telegram?.WebApp;
  return app && app.platform !== "unknown" ? app : null;
}
