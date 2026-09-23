import { useEffect, useRef, useState } from "react";
import type { MenuCommand, MenuState } from "../../electron/menuState";
import { isEditableTarget, overlayOpen } from "../lib/clipKeys";

type Bridge = NonNullable<Window["instantsMenu"]>;

/** The native menus' bridge, or null in a plain browser tab, where the page keeps its own key handlers and the browser its own context menu. */
export function menuBridge(): Bridge | null {
  const bridge = window.instantsMenu;
  return bridge && typeof bridge.setState === "function" ? bridge : null;
}

/** Runs `handler` for every command main sends. Subscribes once; the latest handler is always the one called. */
export function useMenuCommands(handler: (command: MenuCommand) => void): void {
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    const bridge = menuBridge();
    if (!bridge || typeof bridge.onCommand !== "function") {
      return undefined;
    }

    const unsubscribe = bridge.onCommand((command) => latest.current(command));
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);
}

/** Reports the state the menus are built from, only when it changes. */
export function useMenuState(state: MenuState): void {
  const signature = JSON.stringify(state);

  useEffect(() => {
    menuBridge()?.setState(JSON.parse(signature) as MenuState);
  }, [signature]);
}

/** Whether keyboard focus is on a card, which "Tocar no cartão em foco" acts on. */
export function useFocusedCard(): boolean {
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const inCard = (target: EventTarget | null) =>
      target instanceof Element && target.closest("article.pad") !== null;

    const onIn = (event: FocusEvent) => setFocused(inCard(event.target));
    const onOut = (event: FocusEvent) => setFocused(inCard(event.relatedTarget));

    window.addEventListener("focusin", onIn);
    window.addEventListener("focusout", onOut);
    return () => {
      window.removeEventListener("focusin", onIn);
      window.removeEventListener("focusout", onOut);
    };
  }, []);

  return focused;
}

/** Clicks a control of the card that has focus, so the menu runs exactly what the button runs (and a disabled button does nothing). */
export function clickFocusedCard(action: "play" | "discord"): void {
  const card = document.activeElement?.closest("article.pad");
  card?.querySelector<HTMLButtonElement>(`[data-act="${action}"]`)?.click();
}

/**
 * The browser's context menu is off everywhere in Electron; these are the
 * places that get a native one instead. Cards, the server chip and the
 * picker's rows handle their own right-click first (and mark it handled);
 * text fields are left to main, which has the spelling suggestions.
 */
export function useNativeContextMenu(): void {
  useEffect(() => {
    const bridge = menuBridge();
    if (!bridge) return undefined;

    function onContextMenu(event: MouseEvent) {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;

      event.preventDefault();

      // Behind a dialog, or in the staged Aparência app, only a field has a menu.
      if (overlayOpen() || !(event.target instanceof Element)) return;

      if (window.getSelection()?.toString()) {
        bridge?.selectionContext();
      } else if (event.target.closest("main.scroll")) {
        bridge?.gridContext();
      }
    }

    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);
}
