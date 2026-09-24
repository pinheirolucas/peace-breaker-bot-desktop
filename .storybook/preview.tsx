import type { Decorator, Preview } from "@storybook/react-vite";
import { useLayoutEffect } from "react";
import { THEMES } from "../src/themes";

// Components that call useTranslation() (the card, the rename dialog) render
// bare keys until the app's global i18next singleton is initialised.
import "../src/i18n";

import "@fontsource-variable/archivo";
import "../src/styles/tokens.css";
import "../src/styles/base.css";

// Three toolbar dropdowns turn every story into 48 verifiable renderings
// (8 palettes x light/dark x 3 platforms). That is the only practical way to
// keep eight themes honest, and it is the reason this is Storybook rather
// than something with a faster cold start.
export const globalTypes = {
  theme: {
    description: "Paleta",
    toolbar: {
      title: "Tema",
      icon: "paintbrush",
      items: THEMES.map((theme) => ({ value: theme.id, title: theme.name })),
      dynamicTitle: true
    }
  },
  mode: {
    description: "Claro ou escuro",
    toolbar: {
      title: "Modo",
      icon: "mirror",
      items: [
        { value: "light", title: "Claro" },
        { value: "dark", title: "Escuro" }
      ],
      dynamicTitle: true
    }
  },
  os: {
    description: "Sistema operacional",
    toolbar: {
      title: "Sistema",
      icon: "browser",
      items: [
        { value: "mac", title: "macOS" },
        { value: "win", title: "Windows" },
        { value: "linux", title: "Linux" }
      ],
      dynamicTitle: true
    }
  },
  desktop: {
    description: "Desktop Linux (só vale com o sistema em Linux)",
    toolbar: {
      title: "Desktop",
      icon: "component",
      items: [
        { value: "gnome", title: "GNOME" },
        { value: "kde", title: "KDE Plasma" }
      ],
      dynamicTitle: true
    }
  }
};

export const initialGlobals = { theme: "esmalte", mode: "dark", os: "mac", desktop: "gnome" };

// tokens.css uses bare attribute selectors rather than :root[...] so a
// subtree can be themed, and the story root is that subtree. But Radix
// portals dialogs, menus, toasts and tooltips into document.body — outside
// any subtree — where the tokens resolve to nothing and [data-os="win"]
// never matches. So the attributes go on <html> as well, exactly as
// index.html's guard stamps them in the app. useLayoutEffect, not
// useEffect: the portal mounts in the same commit and must not paint once
// unthemed.
const withTokens: Decorator = (Story, { globals }) => {
  // Components that ask usePlatform() (the palette's footer, a Keys hint)
  // read the preload bridge before the user agent, so the Sistema toolbar
  // has to be the bridge too, or a key hint would follow the machine that
  // runs Storybook and not the toolbar. Set in render, before the story reads it.
  window.instantsPlatform = {
    ...window.instantsPlatform,
    os: globals.os,
    desktop: globals.os === "linux" ? globals.desktop : undefined
  };

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = globals.theme;
    root.dataset.mode = globals.mode;
    root.dataset.os = globals.os;
    // Only Linux has one: GNOME's header bar or KDE's toolbar under the
    // window manager's own bar.
    if (globals.os === "linux") {
      root.dataset.desktop = globals.desktop;
    } else {
      delete root.dataset.desktop;
    }
  }, [globals.theme, globals.mode, globals.os, globals.desktop]);

  return (
  <div
    data-theme={globals.theme}
    data-mode={globals.mode}
    data-os={globals.os}
    data-desktop={globals.os === "linux" ? globals.desktop : undefined}
    style={{
      background: "var(--bg)",
      color: "var(--fg)",
      padding: 28,
      minHeight: "100vh",
      boxSizing: "border-box"
    }}
  >
    <Story />
  </div>
  );
};

const preview: Preview = {
  decorators: [withTokens],
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true }
  }
};

export default preview;
