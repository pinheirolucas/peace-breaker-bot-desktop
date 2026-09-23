// The native menus speak the app's language, not the OS's: the renderer
// reports which one is active and main resolves the same catalogues the
// renderer does, through its own i18next instance (the renderer's is a
// global singleton that only exists there).
import i18next from "i18next";
import enUS from "../src/i18n/en-US.json";
import ptBR from "../src/i18n/pt-BR.json";
import type { MenuLanguage } from "./menuState";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

const cache = new Map<MenuLanguage, Translate>();

export function translatorFor(language: MenuLanguage): Translate {
  const cached = cache.get(language);
  if (cached) return cached;

  const instance = i18next.createInstance();
  void instance.init({
    resources: { "pt-BR": { translation: ptBR }, "en-US": { translation: enUS } },
    lng: language,
    fallbackLng: "en-US",
    initAsync: false,
    interpolation: { escapeValue: false }
  });

  const translate: Translate = (key, options) => String(instance.t(key, options));
  cache.set(language, translate);
  return translate;
}
