import { useEffect, useState } from "react";
import type { Mode } from "../types";

export interface Settings {
  displayName: string;
  defaultMode: Mode;
  theme: "light" | "dark";
  compactCode: boolean;
  showRetrievalByDefault: boolean;
}

const STORAGE_KEY = "codebase-settings-v1";
const THEME_KEY = "codebase-theme";

export const DEFAULT_SETTINGS: Settings = {
  displayName: "You",
  defaultMode: "hybrid",
  theme: "light",
  compactCode: false,
  showRetrievalByDefault: false,
};

function readSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const existingTheme =
      (localStorage.getItem(THEME_KEY) as "light" | "dark") ||
      parsed.theme ||
      DEFAULT_SETTINGS.theme;

    return {
      displayName:
        typeof parsed.displayName === "string" && parsed.displayName.trim()
          ? parsed.displayName
          : DEFAULT_SETTINGS.displayName,
      defaultMode:
        parsed.defaultMode === "adaptive" ||
        parsed.defaultMode === "hybrid" ||
        parsed.defaultMode === "semantic" ||
        parsed.defaultMode === "baseline"
          ? parsed.defaultMode
          : DEFAULT_SETTINGS.defaultMode,
      theme: existingTheme === "dark" ? "dark" : "light",
      compactCode: Boolean(parsed.compactCode),
      showRetrievalByDefault: Boolean(parsed.showRetrievalByDefault),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(readSettings);

  const updateSettings = (updates: Partial<Settings>) => {
    setSettings((prev) => {
      const next: Settings = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        if (updates.theme !== undefined) {
          localStorage.setItem(THEME_KEY, next.theme);
          document.documentElement.dataset.theme = next.theme;
        }
      } catch {
        // Ignore storage write errors
      }
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    localStorage.setItem(THEME_KEY, settings.theme);
  }, [settings.theme]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === "light" ? "dark" : "light" });
  };

  const clearAllLocalData = () => {
    try {
      localStorage.removeItem("codebase-chats-v1");
      localStorage.removeItem("codebase-demo-repos-v1");
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(THEME_KEY);
    } catch {
      // Ignore
    }
    setSettings(DEFAULT_SETTINGS);
    document.documentElement.dataset.theme = DEFAULT_SETTINGS.theme;
  };

  const userInitial = settings.displayName.trim().charAt(0).toUpperCase() || "U";

  return {
    settings,
    updateSettings,
    toggleTheme,
    clearAllLocalData,
    userInitial,
  };
}
