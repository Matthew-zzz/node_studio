"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "nodo.portal.theme";
const CHANGE_EVENT = "nodo-theme";
let memoryTheme: Theme | undefined;

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Private browsers can keep the preference in memory. */ }
  return memoryTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function subscribe(listener: () => void) {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  const storage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) { memoryTheme = undefined; listener(); }
  };
  window.addEventListener("storage", storage);
  window.addEventListener(CHANGE_EVENT, listener);
  preference.addEventListener("change", listener);
  return () => {
    window.removeEventListener("storage", storage);
    window.removeEventListener(CHANGE_EVENT, listener);
    preference.removeEventListener("change", listener);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "light");
  function setTheme(next: Theme) {
    memoryTheme = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Persistence is optional. */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
  return { theme, setTheme };
}
