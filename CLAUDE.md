# CLAUDE.md

Desktop UI (Vite + React 19 + Electron 44) for Peace Breaker Bot: browse and favourite "instants" (short mp3 clips from several sites), play them locally, or tell the Discord bot to play them. The backend is the sibling repo `../peace-breaker-bot`; this app has no server of its own and does nothing without it.

## Commands

`pnpm start` (Vite + Electron) · `pnpm react-start` (Vite only, :3000) · `pnpm typecheck` · `pnpm react-test run [file]` · `pnpm electron-compile` · `pnpm react-build` · `pnpm icons` · `pnpm storybook` (:6006, dev-only). Tests sit next to the code as `*.test.ts(x)`.

- Before a PR run `pnpm typecheck`, `pnpm react-test run` and `pnpm electron-compile`. `tsc --noEmit` is the only type check: Vite and tsup strip types through esbuild, so a build passes on code that does not compile.
- `pnpm start` shares userData with an installed release: a dev run edits your real favourites and settings.

## Toolchain

- All TypeScript under `strict`, `allowJs: false`. `scripts/*.mts` run on Node 24 type stripping. The package must not gain `"type": "module"`: tsup emits CommonJS `build/electron.js` and `build/preload.js` for Electron. `scripts/afterPack.cjs` is CommonJS on purpose, for electron-builder.
- Node and pnpm are pinned in `.tool-versions` (CI reads it). Dependency build scripts are allowlisted in `pnpm-workspace.yaml`.
- `vite.config.ts` `build.target` is the Chromium of the pinned Electron. Bump them together, or a packaged build is a blank window.
- `vite build` empties `build/`, so tsup runs after it with `clean: false`. electron-builder's `buildResources` is `resources/`, not `build/`.

## Workflow

- Branch `type/kebab-slug` (`feat`, `fix`, `chore`, `test`, `docs`, `ci`, `i18n`); number a series (`provider/01-…`, `phase-N`). One concern per PR; a big change is a stack, each PR based on the previous one ("Stacked on #N").
- Commit subject: imperative, sentence case, no prefix, no period; the body says what and why. Merge with a merge commit, never squash.
- PR body: `## Summary` (bullets), `## Test plan` (the commands you ran, with test counts), `## Not verified` (anything not exercised for real: live bot, another OS), and `Other repo: none | peace-breaker-bot#N`. For UI changes, check Storybook or the browser at 360, 420, 720 and 1280 per OS (jsdom has no layout) and link an artifact with screenshots.
- New backend surface or a big UI choice: publish the design as an artifact first, iterate there, implement after the go-ahead. UI alternatives go in separate PRs or stories; close the ones not picked.
- Backend changes land first; the desktop PR that uses them follows and references it.
- Comments only where the code can't say it: a one-line doc on exported members; none in tests; reasoning goes in the PR body.
- Releases: Actions › Cut Release (patch/minor/major; prerelease gives `vX.Y.Z-rcN`; dry run first), iterating rc → final. Never run `pnpm release`, create tags or trigger workflows unless asked.

## Update together

- Stored key ↔ `settingsKeys`, `exportToJSON`/`ImportForm`, `resetSettings` (which never clears `instants`).
- New bot error label ↔ `api.<label>` in both `src/i18n/en-US.json` and `pt-BR.json`.
- New IPC channel ↔ a constant in a pure `electron/*.ts` module inlined into the preload, plus a validator the main process runs on every request.
- Palette or token value ↔ `src/tokens.contrast.test.ts` must still pass.
- Icon master in `assets/icon/` ↔ rerun `pnpm icons` and commit the output.

## Contract with the bot

Source of truth: `../peace-breaker-bot/pkg/server/v1/openapi.yaml` (also served at `GET /api/v1/openapi.yaml`). Read it before touching `src/service.ts`; do not restate routes here. Rules this client owns:

- Discovery: mDNS `_myinstants._tcp` on `local.`, TXT `path=/api` and `api=1`, instance name `<hostname>-<port>`. The dot in that name makes bonjour-service mis-split the fqdn, so use only `port`, `addresses` and `txt`. The `/v1` suffix is this client's choice (`apiVersionPath` in `electron/discovery.ts`).
- No default server, never `localhost:9001`. Resolution: the user's pick (persisted, revalidated by `setApiUrl`) → the first discovered server (`sortServers`) → nothing. A server can also be added by address (`src/lib/manualServer.ts`).
- Responses are `{data}` or `{label, message}` with a real 4xx/5xx status. `requestEnvelope` also tolerates a 200 without `data` from old bots. Only the `fetch` call sits inside the try/catch. Errors translate by `label` (`apiErrorMessage`), with `message` as the fallback.
- Health is passive: unhealthy only when `fetch` rejects. Playback buttons stay live while offline, because a click that gets an answer is how the app notices the server is back.
- `GET /bot/status` is polled every 8s; under Electron the main process polls once and broadcasts to every window. `BotStatus | null`: null means unknown, never `{connected: false}`; gate only on `connected === false`. `POST /bot/play` answering 409 `bot_not_connected` is the real enforcement.
- `GET /providers` → `null` means unknown. An unknown persisted provider key falls back to `myinstants` silently. Region is sent only for providers with `supportsRegion`; the backend validates it (`invalid_region`).

## Architecture

- Renderer (`src/`) is built by Vite; `electron/*.ts` by tsup. The preload is sandboxed and cannot `require` siblings at runtime, so pure modules (`chrome`, `discovery`, `settings`, `shortcuts`, `presence`, `quickAccess`, `clip`, `menuState`, `updates`) are inlined into it. Renderers are untrusted: main validates every request with the module's guard.
- Windows: main, Configurações (`#/settings`), and quick access (frameless, under the tray icon). The settings window only WRITES stored values. It never mounts hooks that push to main (`useGlobalShortcuts`, `useQuickAccessShortcut`, presence reporting), and main refuses those requests from it (`fromAppWindow`).
- Presence: main owns one `PresenceStore` and the `/bot/status` poll. The tray glyph and menu, Dock menu, Jump List and quick access are views of it (`presenceHost.ts`, `trayMenu.ts`).
- Native menus are pure builders in `menuTemplates.ts` over state the renderer reports (`menuState.ts`). Commands come back through `useMenuBridge`.
- Drag-out: pressing a card prepares the clip as a temp file (`clipStore.ts`); the drag only hands the OS a path. The folder is swept at launch and removed on quit.
- Updates: `electron-updater`, checked hourly and silent unless the user asked.
- State is `localStorage` through `src/lib/persisted.ts` hooks. A per-key registry syncs hooks within a window; the `storage` event syncs across windows.
- Two playback hooks, local (`useAudioPlayer`) and Discord (`useDiscordPlayer`), mutually exclusive. `cardState` in `InstantCard.tsx` decides what every control may do, and is the only gate: buttons, favourite keys, global keys and the palette all go through it.
- The card body is the play control: the name button's `::after` covers the card, the footer sits above it, and the card has `isolation: isolate`.
- Layout answers to the window: `.app` is the container, with tiers at 880 and 600. Radix menus portal outside it, so JS uses `useTier`. Icon-only and Tight-mode controls always set `aria-label`.
- Favoritos' tab content is `forceMount` so keys work from Explorar. `SnackbarContext` callbacks must stay `useCallback`-stable, or `MyInstantsPanel` refetches on every render.
- Aparência: the app frame never remounts and is transformed, not reflowed. The dock is a Radix dialog rendered in place, not portaled. Nothing persists until Pronto. The command palette previews through the same `useAppearance` draft, and its preview effect is keyed on the payload, not the row (keying on the row loops).
- Global keys: pure rules in `electron/shortcuts.ts`. Ctrl+Alt is not the default off macOS because it is AltGr on ABNT2. The Wayland `GlobalShortcutsPortal` flag is not verified against the pinned Electron.
- i18n: an i18next singleton with `fallbackLng` en-US on purpose, so a missing English key never shows Portuguese. Language is the explicit pick, else the OS bucket (`pt*` → pt-BR, else en-US). The `index.html` boot guard repeats that rule inline.
- Design system: components name tokens, never colours (`src/styles/tokens.css`). Selectors are bare attributes, so a subtree can theme itself. Never set `nativeTheme.themeSource`. Archivo stays self-hosted and variable (weight 650).
- Window chrome: the toolbar is the title bar (`chromeKind` is custom on macOS, Windows and GNOME). OS overlay colours must be hex, so use `toHex`. The window shows on `ready-to-show` or `did-fail-load`.
- Storybook is dev-only. Radix portals render into `body`, so the decorator must stamp `<html>`.

## Gotchas

- Radix Tabs activate on `mousedown`: a DOM probe needs a real click.
- jsdom stubs (`matchMedia`, `ResizeObserver`, pointer capture on `Element`) live in `src/setupTests.ts`.
- `IconButton` requires `label`.

## Keeping this file honest

- Change CLAUDE.md in the same commit as the behaviour it describes. Write it as the current state, never history ("used to", "replaced").
- Add a line only if it is non-obvious from the code AND can't be enforced by a test, typecheck or hook. If it can be enforced, write the check instead.
- When the user corrects the same thing twice, promote the correction to a rule here (or to a check), not only to personal memory.
- Never restate bot routes or payloads here. The bot's openapi.yaml is the source of truth; only client-owned rules belong in "Contract with the bot".
- Keep the file under ~110 lines. When it grows past that, move procedures into .claude/skills.
