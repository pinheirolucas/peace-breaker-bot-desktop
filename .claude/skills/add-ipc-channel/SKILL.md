---
name: add-ipc-channel
description: Use when the renderer needs something only Electron's main process can do, or main needs to push something to a window. Covers new ipcMain/ipcRenderer channels and window.instants* bridges.
---

# Add an IPC channel

1. Declare the channel name and payload types in the pure module that owns the feature (`electron/<feature>.ts`, e.g. `electron/quickAccess.ts`), as `export const fooChannel = "feature:foo"`.
2. If the renderer sends a payload, write an `isFoo(x: unknown): x is Foo` guard next to it, like `isQuickAccessAction` or `isChromeColors`. The renderer is untrusted.
3. In the preload (`electron/preload.ts`), import only constants and types from pure modules. tsup inlines them, and the sandboxed preload can't `require` siblings at runtime. Expose it on the feature's `window.instants*` bridge with `contextBridge.exposeInMainWorld`. For `ipcRenderer.on`, return an unsubscribe that calls `removeListener`.
4. Type the bridge in the `interface Window` block in `src/hooks/usePlatform.ts`.
5. In `electron/main.ts`, check the sender first: `fromMainWindow` / `fromAppWindow` (or the settings-window check), then the guard, and drop anything else silently.
6. The settings window only writes stored values. It never mounts hooks that push state to main.
7. Test: unit-test the guard in `src/<feature>.test.ts`, and extend `src/preload.test.ts` if the bridge shape changed.
8. Run `pnpm typecheck && pnpm react-test run && pnpm electron-compile`. Compile catches preload-inlining breaks.
