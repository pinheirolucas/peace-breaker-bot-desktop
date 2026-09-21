# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Peace Breaker Bot's desktop app: a Vite + React + Electron UI for browsing/playing "instants" (short mp3 clips from myinstants.com) and sending them to a Discord bot. It is the frontend for the Go backend in the sibling repository `../peace-breaker-bot` (see `CLAUDE.md` there) — this app has no server of its own and does nothing useful without that backend running.

## Commands

```bash
pnpm start          # runs the Vite dev server + Electron together (waits on :3000)
pnpm react-start    # Vite dev server only, at http://localhost:3000
pnpm react-build    # production build -> build/
pnpm react-test     # Vitest (watch mode; `pnpm react-test run` for a single pass)
pnpm typecheck      # tsc --noEmit (the ONLY thing that type-checks)
pnpm electron-compile # tsup: electron/*.ts -> build/electron.js + build/preload.js
pnpm icons          # regenerate every app icon and favicon from assets/icon/*.svg
pnpm storybook      # the dev-only styleguide on :6006
pnpm build          # react-build, then electron-compile, then electron-build
pnpm release        # react-build, electron-compile, then electron-builder --publish=always
```

Run a single test file with `pnpm react-test run src/SomeFile.test.tsx`. Tests live next to the code they cover, as `*.test.ts`/`*.test.tsx`.

## Toolchain

Everything is TypeScript — `src/`, `electron/`, `scripts/`, and the Vite and tsup configs — under
`strict`. `allowJs` is `false`, so a stray `.js` file is an error rather than something that slips
through unchecked. `tsc --noEmit` (`pnpm typecheck`) is the only thing that type-checks anything:
Vite and tsup both emit through esbuild, which strips types without checking them, so a build
succeeds happily on code that does not compile.

`scripts/*.mts` run under Node 24's native type stripping — `pnpm icons` is plain `node`, no build
step. They are `.mts` rather than `.ts` because the package has no `"type": "module"` and must not
gain one: tsup emits `build/electron.js` as CommonJS, and a package-wide ESM flag would make Electron
load it as ESM. Node's stripping also needs the real extension on relative imports, which is what
`allowImportingTsExtensions` in `tsconfig.json` permits.

Node and pnpm are both pinned in `.tool-versions` (the asdf format, read by asdf and mise alike).
pnpm blocks dependency build scripts by default; the allowlist lives in `pnpm-workspace.yaml`
(pnpm 11 no longer reads settings from the `pnpm` key in `package.json`). Every entry there is
currently `false` and the file explains each one — Electron needs no entry at all (from v44 it
ships no install script and fetches its binary lazily on first `electron .`), and esbuild's is a
verification pass that both Vite and tsup work fine without. Naming them explicitly is what keeps
`pnpm install` from ending in `ERR_PNPM_IGNORED_BUILDS`.

`vite.config.ts` pins `build.target` to the Chromium version the pinned Electron ships. Raise the
two together: too new a target produces a bundle Electron cannot parse, and that failure appears
only in a packaged build, as a blank window.

## Backend connection

`src/service.ts` has no default backend: `getApiUrl()` starts `null` and stays that way until an explicit pick or a discovered server adopts one through `setApiUrl`, which normalizes (trailing slash stripped, base path kept) and refuses anything that is not an http/https URL with a host, so a malformed address is ignored rather than adopted and can never displace a working one. `resetApiUrl()` drops back to that same `null` — not to a remembered address — so a stale pick or an empty discovery list never quietly reactivates a server. Every request function (`playOnDiscord`, `stopPlayingOnDiscord`, `getContent`, `getInstants`, `getProviders`) calls `requireApiUrl()` first, which folds "no active server" into the same connection-failure signal (`markConnectionFailure`, an `ApiError`) a genuinely unreachable one produces, rather than ever attempting a request against nothing. There is still no env-based override.

Under Electron the main process browses for the backend's mDNS advertisement (`_myinstants._tcp` on `local.`, TXT `path=/api` and `api=1`) and pushes the whole **list** of resolved servers to the renderer over the preload bridge. Discovery is an upgrade, never a precondition: it never blocks startup, multicast is lossy and is blocked outright on plenty of networks, and running as a plain web page there is no bridge and no mDNS at all — the absence of `window.instantsDiscovery` is a no-op, and with nothing picked or discovered either the app simply talks to nothing (see below — there is no default address to fall back to).

Which server the app talks to is resolved in `App.tsx` from two inputs, in this order: an explicit choice the user made in the picker (persisted as `selectedServer`, and re-validated through `setApiUrl` so a stale or malformed one falls through), then the first entry of the discovered list. **There is no third fallback** — with neither, the resolution effect calls `resetApiUrl()` and the app is talking to nothing, deliberately: a real server on the network, found or picked, or no active connection at all, never a silent assumption of `localhost:9001`. The list arrives already sorted by `sortServers` — servers on this machine first, then by port, then by address — so the auto-adopted server is the same one on every launch. Without that sort the adopted address follows multicast response order and flips between runs.

`src/ServerMenu.tsx` is the picker: the server chip in the toolbar — the current address as visible text beside a health dot, or, with no active server at all, the same `server.none` copy ("Nenhum servidor encontrado") the empty discovery list already uses — opening a Radix dropdown that lists the discovered servers, checks the current one, and switches in a single click (no confirm step — switching is cheap and reversible). It shows the current address in its own header rather than as a list row, because the current target need not be in the list at all: a server that dies leaves the list while still being the one in use, and there is no default entry that would always be absent from it either. That header is omitted outright when there is no active server, rather than repeat `server.none` a second time right above the empty list's own row of it — the two states never disagree in this app (no active server means nothing was discovered either), so the list saying it once is enough. A server whose address is one of this machine's own (`os.networkInterfaces()` in the main process) is marked *este computador* — a bot on this machine is discovered at its LAN address, never as `localhost`. In a Tight window (below) the chip leaves the toolbar: its button stays in the DOM, invisible and zero-width beside the overflow menu, only as the anchor the picker opens from, and the overflow menu's first item names the server and opens the picker (`onCloseAutoFocus` on that menu, so focus returning to its button does not dismiss the picker the moment it opens); a badge on the overflow button says when the server is silent or the bot is out of its channel.

Connection health is **passive**: `service.ts` marks itself unhealthy only when `fetch` itself rejects — a genuine network failure, since `fetch` resolves for every HTTP status and throws only when no response ever arrives — and healthy again on any answer, error body included. There is no polling because there is no cheap endpoint to poll: `/instant/list` scrapes myinstants.com and the other three either download or have side effects. Two signals come out of it — `onHealthChange` (transitions, drives the chip's health dot and the offline banner) and `onConnectionError` (every failure, re-shows the toast so a second failed click is never silent). While unhealthy, `openSnackbar` drops panel messages: the connection toast is the accurate one and a panel's generic "Erro desconhecido" would otherwise clobber it, since the panel's `catch` always runs after. Offline, both panels show an in-panel banner and step the grid back visually, but **every playback button stays live**: health is passive, so a click that gets an answer is the only thing that can discover the server is back, and disabling playback would lock the user out of recovering. The chip names itself by its visible address; while silent it carries an explicit `aria-label` of "<address> não está respondendo" — not screen-reader text in a second node, because the accessible-name algorithm drops the whitespace between nodes and it announced "localhost:9001não está respondendo". With no active server at all `getApiUrl()` is `null` rather than an address, so `App.tsx` skips that interpolation and falls back to the same `server.none` string everywhere an address would otherwise go — the chip's label, the menu header, the offline banner, the connection-error toast — since there is nothing for "não está respondendo" to attach to.

**The bot's voice-connection status is the one thing worth polling for.** Unlike general connection health, `GET /bot/status` is cheap and side-effect-free, so `useBotStatus` (`src/useBotStatus.ts`) polls it every 8s for as long as a server is active and exposes `BotStatus | null` — `null` means unknown (still loading, no active server, or an old backend with no `/bot/status` route, which 404s the same as any unknown path) and must never be treated as `{connected: false}`: gating on an unknown status would lock out a server that might not even understand the question yet. `App.tsx` holds the one instance (same place `healthy` already lives) and threads it down to `FavoritesPanel`/`MyInstantsPanel`/`InstantCard` and to `ServerMenu`/`ServerChip`. `cardState` (`src/components/InstantCard.tsx`) gates `discordDisabled` on `botStatus?.connected === false` specifically — never `!botStatus?.connected` — so a click a person could not have known was doomed doesn't need the round trip; `POST /bot/play`'s `409 bot_not_connected` is what actually enforces it, since status can go stale between a poll and a click. `ServerChip` gets a third dot colour for this case (amber, a hardcoded literal like the existing red — a warning has to read as a warning regardless of the active palette) and `ServerMenu`'s header gains a second, muted line naming the bot's channel when connected, or saying it isn't in one when reachable but not — the only place any of this is shown to a sighted user, since the chip itself stays just the address.

The Go backend reports most application errors as **HTTP 200** with a `{label, message}` body and no `data`, so `fetch` resolves normally and an absent `data` — same as a genuine non-2xx status, which `fetch` also resolves rather than rejects — is judged after the fact rather than caught. `requestEnvelope`, the helper shared by `playOnDiscord`/`getContent`/`getInstants`/`getProviders`, wraps only the `fetch` call itself in a try/catch (a real network failure); parsing the JSON body and checking `response.ok`/`body.data` happens outside that catch, so an envelope's own error is never rewritten into the generic fallback that catch exists for. It throws `ApiError(body.label, body.message)` — falling back to a generic string only when the backend supplied none — whether the status was non-ok or the envelope was simply missing `data`. `markHealth(true)` fires as soon as a response arrives, before the envelope is judged — an error body, or any status at all, still means the server answered. `stopPlayingOnDiscord` is the one caller that skips the envelope and returns the raw `Response`, throwing it directly on a non-ok status; nothing reads its resolved value, so the shape of that rejection does not otherwise matter. See **Internationalization** below for how `label` becomes display text.

Both panels catch `getContent` and show `apiErrorMessage(t, err)`. Without that catch its rejection is an unhandled rejection inside a click handler, which is what made a failed play button do and say nothing at all.

## Architecture

- **Build tool**: Vite (`vite.config.ts`). `index.html` lives at the project root and is the build entry, loading `/src/index.tsx` as a module. Files containing JSX use `.tsx`. The React plugin runs with its default `include`; narrowing it would silently take components out of its JSX transform and Fast Refresh. `base: "./"` keeps built asset URLs relative so the packaged app can load them over `file://`, `build.outDir` is `build/`, and `build.target` is pinned to the Chromium version the current Electron ships (see the comment there — getting it wrong shows up only in a packaged build, as a blank window).
- **Two compile targets**: the renderer goes through Vite; `electron/main.ts` and `electron/preload.ts` do not, because Electron requires them as CommonJS. `tsup` (see `tsup.config.ts`) compiles those two to `build/electron.js` and `build/preload.js`. Order matters in `pnpm build`: `vite build` **empties** `build/`, so tsup runs after it and is configured `clean: false` — otherwise whichever ran second would delete the other's output. `public/` still exists and is still copied verbatim, but now holds only `favicon.ico`.
- **Electron shell**: `electron/main.ts` is the Electron main process, compiled to `build/electron.js`; the electron-builder config in `package.json` packages `build/` with `extraMetadata.main` pointing at it. Dev is detected with `!app.isPackaged` — not `electron-is-dev`, which went ESM-only in v3 and cannot be required from this CommonJS file. In dev it loads `http://localhost:3000` with devtools open; in production the built `build/index.html`. The window sets one `webPreferences` override — `preload: path.join(__dirname, "preload.js")`, which now always resolves inside `build/` because both files are tsup output — and keeps `contextIsolation: true` / `nodeIntegration: false`. Auto-update is wired via `update-electron-app` v3, whose config shape is `{ updateSource: { type, repo }, updateInterval }`.
- **Discovery (main process)**: `electron/preload.ts` exposes `window.instantsDiscovery` with `onServers(listener)` — returns an unsubscribe function and replays the last list to a late subscriber — and `refresh()`, which asks the main process to re-query (the picker's "Procurar novamente"). The main process keeps discovered services in a `Map` keyed by fqdn, adding on `up` and removing on `down`, and publishes the sorted list on every change; distinct ports on one host are distinct entries, so two bots on one machine both appear. `electron/main.ts` browses with `bonjour-service` for the life of the window — not a one-shot lookup — re-querying every 30s so a backend started later still turns up, and destroys the browser and bonjour instance on `closed`. `electron/discovery.ts` holds the pure URL building and is what `src/discovery.test.ts` covers. Do not trust the parsed `name`/`type`/`host` fields: the advertised instance name embeds a dot (macOS `os.Hostname()` already ends in `.local`), which makes bonjour-service mis-split the fqdn — `type` comes back as `local-9001` and `host` doubles its suffix. Only `port`, `addresses` and `txt` are usable, so the URL is built from the first non-link-local IPv4 in `addresses` (falling back to a bracketed routable IPv6) plus the server's advertised `txt.path` mount point, gated on TXT `api=1`. The version segment appended after that path (`/v1`) is this client's own choice, not the server's — the server advertises only where its API is mounted, never which version to speak — so it lives in `electron/discovery.ts` as `apiVersionPath`, a standalone constant now that `src/service.ts` has no default URL of its own for it to stay in sync with. The preload runs sandboxed and cannot `require` a sibling module at runtime — which is why the channel names used to be spelled out in both files. tsup **inlines** `./discovery` into `build/preload.js` at build time, so there is now one definition and no runtime require; the built preload requires nothing but `electron`. `hostnameFromService` recovers the display hostname by parsing the fqdn rather than reading `name`, for the same reason.
- **Persistence**: all app state is `localStorage`-backed via hooks defined in `src/storage.ts` — `useInstantsState` (favorited instants), `useThemeState` (the palette), `useColorModeState` (auto/light/dark), `useSelectedServer` (the picked backend address) and `useRegionState` (the MyInstants catalogue's country, read through `useRegion`, which falls back to the default for anything not in `src/regions.ts`). These sit on `src/lib/persisted.ts`, a small typed replacement for `use-persisted-state` (unmaintained, untyped): same `[value, setValue]` shape, same JSON encoding so old backups stay readable, and the same two kinds of sync. **Within a window**, every hook on a key is kept in step through a per-key registry — several components hold the same key at once (`ImportForm` writes `instants` while the favourites grid reads it), and the `storage` event never fires in the window that made the write, so without the registry an import leaves the grid stale. **Across windows**, the `storage` event covers it. **The `theme` key changed meaning** — it held `"light"`/`"dark"` and now holds the palette id, with light/dark living in `colorMode`. `index.html`'s boot guard migrates the old shape. An old backup needs no migration: `ImportForm` only ever restores `instants`, so a backup's `theme` value is never applied. There is no backend persistence; `src/state.ts#exportToJSON` dumps all of `localStorage` to a downloaded JSON file, and `ImportForm.tsx` reads a JSON file back in (with a merge/replace choice for instants) — this import/export pair is the only "backup" mechanism, so when changing what's stored under these keys, keep both in sync.
- **Two playback paths, kept as separate hooks** because they're mutually exclusive but independently stateful:
  - `useAudioPlayer` (`src/useAudioPlayer.ts`) — plays a clip locally via an `HTMLAudioElement`, given the base64 data URI returned by `GET /play?url=` (`service.ts#getContent`).
  - `useDiscordPlayer` (`src/useDiscordPlayer.ts`) — tells the bot to play a clip via `POST /bot/play` (`service.ts#playOnDiscord`), which blocks server-side until playback ends/is stopped and returns an `exitReason`; the hook only clears its "now playing" URL when `exitReason === "end"`.
  Both `FavoritesPanel` and `MyInstantsPanel` instantiate both hooks independently, so each panel's playback state is separate from the other's. Which footer controls are live is decided in one place, `cardState` in `src/components/InstantCard.tsx`, ported from the design canvas: the body plays locally and is inert while anything else plays or while this card plays on Discord, but stays live to replay a clip already playing here; send-to-Discord mirrors it, and is additionally disabled whenever `botStatus?.connected === false` (see "Backend connection" above); stop exists only on the playing card; a playing card locks its own trailing action; and every other card dims.
- **Two main tabs** in `App.tsx`: `FavoritesPanel` (user's saved instants, plus add/remove via `SaveForm`) and `MyInstantsPanel` (paginated/searchable browse of `GET /instant/list`, scraped server-side from whichever provider is active — myinstants.com by default — with a star toggle to add/remove favorites). Both render their cards through the shared `src/components/InstantCard.tsx`; each panel passes its own trailing action as `trail` (remove, or a favourite toggle with `aria-pressed`). Change the card there, not in the panels. **The card body is the play control** — there is no play button. A button cannot sit inside a button, so the clip name is a real `<button>` whose `::after` stretches over the whole card, and the footer sits above it at `z-index: 1`. The card is `isolation: isolate` so that `1` stays inside it; without it the footer buttons of cards behind a dialog painted over the form. A card's colour comes from `slotFor(url)` (`src/lib/slot.ts`), keyed on the url so it never shifts when the list is filtered or paged; its waveform is a deterministic texture from `wavePath(name)`, not the audio.
- **Narrow windows** (`src/styles/shell.css`, `card.css`, `states.css`): the window is the container — `.app` is `container: app / inline-size` — and three tiers answer to its width rather than the viewport's, so the Aparência stage and Storybook resolve the same tier as the real window. **Roomy** (880+) shows every label and the server's address; from 1000px the search capsule is centred on the window itself, below that it takes the space the tabs and the buttons leave. **Snug** (600–879) takes the server chip down to its dot, narrows the search and uses 3 columns. **Tight** (360–599) makes the search a magnifier that opens over the whole toolbar when focused (`:has(.search:focus-within)` hides the other groups; with a query set and the field closed the magnifier is accent-coloured so the filter stays visible), moves the server into the overflow menu, shrinks Concluir to its check and uses 2 columns. The card scales (156 → 148 → 138px) but never changes structure, and `.skel` repeats each footprint. The gutter is one continuous `--g: clamp(16px, 3.2cqw, 40px)` declared on `.scroll` (not on `.app`: `cqw` on a container resolves against *its* ancestor). The grid never drops to one column: at the 360px floor the 16px gutters leave 328px, which is two cards. `main.ts` sets `minHeight: 480` and `minWidth` from `minWindowWidth` — 360, or 400 on Windows, whose caption buttons take 138px of the toolbar. Menus are portaled to `<body>`, outside the container, so a container query never reaches what is in one: `useTier` (`src/hooks/useTier.ts`, the same 880/600 boundaries) measures `.app` for the few things the tier decides in JS — the overflow menu offering the server. Because Tight hides text with `display: none` and hidden text is not part of an accessible name, `ServerChip` (`.srv--server`, address in `.addr`), Concluir and every icon-only control always set an explicit `aria-label`. jsdom has no layout, so none of this is covered by tests: check it in a browser or Storybook at 360, 420, 720 and 1280, per OS. The design canvas has the drawn tiers on its Narrow windows page.
- **App shell** (`App.tsx`, `src/styles/shell.css`): a flex column — one toolbar, and a scroller that owns its own overflow. The toolbar is the title bar, the page header and the tools row in one: the Favoritos/Explorar tabs at the start, the search capsule in the middle, and at the end Adicionar (`AddMenu`, on Favoritos), the server chip and the overflow menu. It replaced the OS title bar, a hero (page title, count line, tabs) and a tools row, which took 164–246px of the top of the window; the toolbar is 44–52px (`--tbh`). The page title and count are no longer drawn: the count is in the search placeholder ("Buscar em N favoritos", or "Buscar em <site>" on Explorar) and the page and count are `document.title`, which is what Mission Control, the taskbar and Alt+Tab read; a visually hidden `aria-live` region still announces the count. The tabs and the panels share one Radix Tabs root (`SegmentedRoot`), since the tab/tabpanel wiring only exists inside a single Root. Search is controlled and debounced 300ms. The search capsule holds `FilterMenu` on Explorar (below). **Adicionar** is a split button: the plus opens the add form and its arrow opens Organizar, Importar and Exportar — Organizar is disabled, with the reason under it, while a clip plays or a search is set, and left out with no favourites. Organizar hides the search and swaps the split button for Concluir, with the hint ("Arraste para reordenar") in the middle; it is Favoritos' alone. The overflow menu holds Aparência (which opens the Aparência shell, next item), Idioma and, off macOS, Check for Updates. Keyboard, per platform (Cmd on macOS, Ctrl elsewhere, no Alt or Shift): F focuses the search, 1 and 2 switch tab, N opens the add form on Favoritos — none while Aparência or a dialog is open. On Windows in a Tight window there is no room beside the caption buttons for Adicionar or the filter, so their contents move into the overflow menu (`foldActions`). Empty states always end on a next step: first launch offers to add; a Favoritos search with no match carries the query to Explorar; Explorar offers to clear the search or retry. `SnackbarContext` (`src/SnackbarContext.ts`) exposes `openSnackbar({ message, actionLabel?, onAction?, duration? })` / `closeSnackbar` over a Radix toast; both are `useCallback`-stable, which matters because `MyInstantsPanel`'s listing effect would otherwise refetch on every App render.
- **Aparência shell** (`src/hooks/useAppearance.ts`, `AppearanceStage`, `AppearanceDock`, `src/components/appearance.css`): where palette and colour mode are picked. It is not a dialog over the app — the whole window turns into the picker. The app shrinks onto a stage and a dock of the eight palettes rises under it; every pick is stamped on `<html>` at once, so the real app, the shell and the native window chrome all repaint live. Nothing is persisted until **Pronto**: `useAppearance` holds a draft that `useTheme`/`useColorMode` stamp in place of the stored values, and **Cancelar** or Escape just drop it — so an abandoned choice never reaches `localStorage` or another window. Three rules keep the app intact while staged. The hero, tools and scroller always render inside `AppearanceStage`'s frame, open or not, so opening never remounts them (a search, a loaded Explorar page, a playing clip all survive). The frame keeps the pixel size the app had and is only *transformed* — measured in a layout effect, so the first open frame is already fitted and nothing reflows. And the dock is a Radix modal dialog rendered **in place, not portaled**: focus stays in it, and everything outside, the staged app included, is hidden from the pointer and assistive tech, so the preview cannot open a second dialog over the shell. A click on the stage deliberately does nothing. The find shortcut is off while the shell is open.
- **Explorar pagination**: the page count is learned from every response, so "Carregar mais" is offered from the first load, and a new search always restarts from page 1. Both used to be wrong — the count was only learned after a search, and the page number survived one — and the old tests asserted them as known bugs.
- **MyInstants region**: the catalogue's country is a client setting, persisted as `region` and sent as `&region=` on every `GET /instant/list`. The backend applies it only to the listing with no search term (myinstants.com's search is global) and rejects anything but two lowercase letters with `invalid_region`; the client sends it regardless and leaves that rule to the backend. `src/regions.ts` is a curated list, each code checked to return a populated listing — myinstants.com answers an unknown code with an empty 200, not an error, so an open-ended field would look like a broken catalogue — labelled through `Intl.DisplayNames` keyed on the active UI language (`regionLabel(region, language)`), defaulting to `br` regardless of language. The region is picked in `FilterMenu`, on the Explorar tab, and only when the active provider supports it (see **Providers** below) — myinstants is the one that does today; changing it restarts the listing from page 1, the same as a new search. The menu is `menu--scroll`, capped to the room Radix measures, because 22 countries do not fit a window.
- **Providers**: the backend behind `GET /api/v1/instants` is no longer only myinstants.com — `pkg/provider` in the Go backend scrapes instants.meme, soundboardguy.com and soundbuttons.io the same way, each behind one `Provider` interface, and `GET /api/v1/providers` lists them as `{key, name, supportsSearch, supportsRegion}`. This is why the tab is `Explorar`/`Explore` rather than `MyInstants` (the tab label used to be that literal, untranslated string, because it named one site; now it names the tab's job, and MyInstants is just the default provider inside it). `useProviders` (`src/useProviders.ts`) fetches the registry once per active server — it never changes mid-session, so unlike `useBotStatus` there is nothing to poll — and returns `null` for "unknown" (still loading, or an old backend with no `/providers` route, which 404s like any unknown path); `null` must never be read as "there is one provider," the same conservative default `useBotStatus` already applies. `useProvider` (`src/hooks/useProvider.ts`) resolves the persisted `provider` key against that registry exactly the way `useRegion` resolves against `src/regions.ts`: a key the registry doesn't contain — a removed provider, a build from before a newer one existed — falls back to `myinstants` silently, never a toast, since the UI only ever persists a key it read from the registry itself. The site is picked in `FilterMenu` too — one icon-only button, the first thing in the search capsule, whose single menu has a Site section (one flat list, rather than `ServerMenu`'s local/remote split, since there is nothing here to discover or type in by hand — just the one small list `GET /api/v1/providers` already gives) and a Region section, stays open between picks (`closeOnSelect={false}`) so both are set in one visit, shows a dot on the icon when either is not the default, and offers "Restaurar padrão". It replaced the `ProviderMenu` and `RegionMenu` chips of the old tools row. `FilterMenuItems` is the content on its own, for the Windows Tight overflow menu. `getInstants` (`src/service.ts`) takes `provider` as a fourth, optional argument; omitted, the backend still defaults to myinstants, so the app behaves exactly as it did before this existed until the registry actually answers.

## Internationalization

The UI ships two languages, pt-BR and en-US, on `i18next` + `react-i18next` as the app's
global singleton — `src/i18n/index.ts` calls `i18next.use(initReactI18next).init(...)` once,
which is enough for `useTranslation()` to resolve everywhere with no `<I18nextProvider>`
wrapper, so no test's bare `render()` call had to change. Catalogs are flat JSON files,
`src/i18n/{en-US,pt-BR}.json`, namespaced by surface (`app.*`, `server.*`, `favorites.*`, …)
rather than by component, so a key survives a component being split; `fallbackLng` is
explicitly `"en-US"`, not `"pt-BR"`, even though pt-BR is the exhaustively-transcribed source
catalog — that keeps a key missing from English from silently showing Portuguese.

**Language resolves like the server address does**: an explicit pick, persisted as
`language` via `useLanguageState` (`src/storage.ts`) and read through the `useLanguage`
wrapper hook (`src/hooks/useLanguage.ts`), always wins once made; unset, `src/i18n/detect.ts`'s
`defaultLocale()` maps the OS's reported locale to one of exactly two buckets — a `pt` primary
subtag (covering `pt-BR`, `pt-PT`, bare `pt`) resolves to `pt-BR`, everything else to `en-US`.
`index.html`'s pre-paint boot guard runs the same rule inline (it cannot import a TS module)
to stamp `data-lang` and set `document.documentElement.lang` before React mounts, mirroring
how it already stamps `data-os`/`data-mode`/`data-theme`/`data-chrome`. Unlike those, this
needs no preload/IPC bridge: `navigator.language` has tracked the OS's preferred UI language
since Electron 9 (electron/electron#23247), well before the Electron this app pins, and it
resolves identically in a plain browser tab — resist the urge to add one. The switcher lives
in `App.tsx`'s overflow menu, beneath Aparência, as two checkable items.

**Errors translate by label, not by rendering the backend's `message` verbatim.** Every
application error the backend answers with already carries a stable machine `label` alongside
its (today, Portuguese) `message` — `service.ts`'s `ApiError` carries both, thrown by
`unwrapData` and every transport `.catch()` in place of a bare `Error`. `src/i18n/apiError.ts`'s
`apiErrorMessage(t, err)` resolves the display text: `t("api." + label, { defaultValue: message })`
for an `ApiError`, so a label this catalog does not yet recognize (an old bot binary, or the
backend adding one before the UI's `api.*` catalog catches up) still shows something instead of
a raw key; anything else falls back to its own `.message`. `useDiscordPlayer`'s `play()` returns
the error object itself, not a string, so the panel can translate it the same way. This is what
lets the UI ship its own wording fixes without redeploying the bot, and what makes it safe for
the backend to switch its own default language later — the UI stopped reading `message` first.

## Design system

`src/styles/tokens.css` is the single source of colour and control geometry. Nine semantic
tokens (`--bg`, `--panel`, `--line`, `--fg`, `--muted`, `--accent`, `--onAccent`, `--ok`, and
per-card `--fill`/`--ink`) resolved across eight palettes × light/dark, plus a four-value
platform layer (`--rctl`, `--hctl`, `--rpad`, `--rbtn`) that resolves per OS. **Components never
name a colour — they name a token.** That is what lets one component sheet cover eight themes
and three platforms. Values are `oklch`.

Selectors are bare attribute selectors (`[data-theme="esmalte"][data-mode="dark"]`) rather than
`:root[...]` on purpose, so the same sheet can theme a subtree — which is what Storybook's
decorator and the Aparência swatches rely on. For a subtree to resolve to *its own* palette,
every token has to be declared on the themed element itself, card slots included: each theme
sets `--p0-fill` … `--p5-ink`, and `.p0`–`.p5` only read them. The old form,
`[data-theme="x"] .p0 { --fill: … }`, matched a slot under *any* themed ancestor, so a swatch
nested in a page of another palette got whichever theme came later in the file.

Three attributes on `<html>` drive everything, and all three are stamped **pre-paint** by the
inline guard at the top of `index.html`, because React mounts too late and every launch would
otherwise flash the wrong ground:
- `data-os` — from the preload bridge (`window.instantsPlatform.os`) when there is one, else UA
  sniffing. Runtime, not build-time: one renderer bundle serves all three Electron targets *and*
  the plain web page, which has no OS to compile against. `?os=mac|win|linux` overrides in dev.
- `data-mode` — `light`/`dark`, resolved from the persisted `colorMode` (`auto` by default).
- `data-theme` — the palette, defaulting to `esmalte`.

`auto` tracks the OS live through `matchMedia("(prefers-color-scheme: dark)")`, which is the
single mechanism on both targets: Electron's renderer honours the OS setting exactly as a
browser does **as long as nothing sets `nativeTheme.themeSource` away from `"system"`**. Nothing
does, and nothing should — forcing it there takes `auto` away and restyles every native dialog
the app opens. jsdom ships no `matchMedia`, so `src/setupTests.ts` stubs it.

The palette is picked in the Aparência shell (⋯ › Aparência), alongside the colour mode, and
defaults to `esmalte` until someone picks another.

## Native window chrome

The toolbar is the title bar. Where Electron merges the window into the OS bar the toolbar takes its
place, with the real window controls drawn over it; where the window manager keeps its own bar, the
toolbar sits under it. The per-platform `BrowserWindow` options live in the pure `electron/chrome.ts` —
unit-tested from `src/chrome.test.ts`, inlined into the preload like `discovery.ts`:

- **macOS** — `hiddenInset` with the real traffic lights at `{ x: 18, y: 20 }` (12px lights centred in
  the 52px toolbar). The toolbar is absolutely positioned over the grid, frosted (`--bg` at 74% plus a
  blur), so cards scroll under it.
- **Windows** — `hidden` with a 48px `titleBarOverlay`, so the OS draws the real caption buttons. The
  toolbar stops short of them by reading the overlay's own geometry (`env(titlebar-area-x)` and
  `-width`), not a hard-coded 138px, and shows the Fita icon and the app name at the start.
- **Linux** — `desktopFor` reads `XDG_CURRENT_DESKTOP`. **GNOME** gets the same overlay at 46px: a
  client-side header bar, with the window controls laid out by the desktop's own button order (Electron
  30.2 draws them on Linux, 43 follows that order, 44 themes the icons; this app pins 44). **KDE Plasma
  and every other desktop** keep the window manager's title bar, and the toolbar (44px) sits under it.
  The preload reports `desktop` alongside `os`, and `data-desktop` is stamped on `<html>` — GNOME also
  stands in when there is no bridge (a browser tab, Storybook).

`chromeKind(platform, desktop)` is `"custom"` on macOS, Windows and GNOME, `"native"` otherwise, and
`data-chrome` is stamped pre-paint so the toolbar's padding is right from the first frame. The toolbar
is the drag region (`-webkit-app-region: drag`), and everything interactive in it opts out. The design
canvas draws fake traffic lights and caption buttons because a static artboard has no OS to ask — do
not bring them back.

The toolbar takes each OS's own dialect through the platform layer in `tokens.css` (`--tbh` toolbar
height and `--tch` control height beside the four existing values) and `[data-os]`/`[data-desktop]`
rules in `shell.css`: accent pills on macOS, a pivot (text with a 3px accent underline) on Windows and
KDE, a grey toggle group on GNOME, whose buttons are also flat. Menus follow in `overlays.css`.

The window controls the OS draws do not follow CSS. `useNativeChrome` sends the resolved `--bg`/`--fg` over
`chrome:set` whenever the palette or mode changes, and the main process calls `setTitleBarOverlay` (Windows and GNOME) and
`setBackgroundColor` — after checking the sender is the main window and the payload is exactly two
opaque hex colours (`isChromeColors`), since the renderer is untrusted. Those OS APIs will not parse
oklch, so `toHex` paints one pixel and reads it back, rather than keeping a second hex table that could
drift from `tokens.css`. The window is created `show: false` and revealed on `ready-to-show`, after
the boot guard has stamped the palette; `defaultChromeColors` covers the frames before that, and
`did-fail-load` shows it too, because `ready-to-show` never fires for a page that failed to load.

`pnpm start` runs under the same userData directory as an installed release — both are named after
`package.json`'s `name` — so a dev run reads and writes the real favourites, and the boot guard's
theme migration rewrites the real stored `theme` key.

## App icon

Fita, the design canvas's default mark: an ink cassette with mustard reels on enamel blue, drawn from
Esmalte's exact values. It deliberately does not follow the palette picker — it is the app's identity in
a dock, not a surface inside it. The masters are SVGs in `assets/icon/`, one per frame, because the
platforms disagree about it: `fita-mac.svg` bakes in the squircle and Apple's 824-on-1024 inset (macOS
no longer masks app icons), `fita-win.svg` is an 8% tile, full bleed, `fita-linux.svg` a circle, and
`favicon.svg` the canvas's 22.4% tile. `fita-mono.svg` is a single-ink cut for a future menu-bar
template image and is wired to nothing.

`pnpm icons` (`scripts/build-icons.mts`) renders every size from the vector *at that size* with sharp
and packs them with the two small writers in `scripts/icon-formats.mts`. There is no packing library on
purpose: those resample every size from one big bitmap, and Fita is weakest at 16px, where its reels
close up. The output is committed, so `pnpm build` never needs sharp — rerun `pnpm icons` after touching
a master. The `.icns` chunk types are exactly the set Apple's own `iconutil` writes: raw ARGB (`ic04`, `ic05`)
at 16 and 32, PNG above. Under `iconutil`, PNG stored as the older `icp4`/`icp5` types reads back at the
right *size* but decodes as pixel noise, and `icp6` reads back as 48px. To verify a change to the packer,
compare pixels, not sizes — and pick the right tool per rung. The PNG rungs round-trip losslessly through
`iconutil -c iconset`. The ARGB rungs do not: `iconutil`'s PNG export of `ic04`/`ic05` is lossy even for
Apple's own files, so decode those planes directly (the PackBits decoder in
`scripts/icon-formats.test.mts`) and compare them with a fresh render of the master.

electron-builder's `directories.buildResources` is `resources/`, not its default `build/`: `build/` is
Vite's `outDir` and is emptied by every `react-build`, so icons there would vanish between the two halves
of `pnpm build`. macOS and Windows read the app icon from the bundle; a Linux window has none, so
`main.ts` passes `public/icon.png` (copied into `build/`) as the window icon on Linux only.

## Components and styleguide

`src/components/` holds the primitives — Button/IconButton, Segmented (and SegmentedChoice, the same
pills as a radio group for a setting), Field, SearchField, Switch, RadioGroup, ServerChip, Dialog,
Toast, Menu, Tooltip, EmptyState, CardSkeleton, OfflineBanner, DropZone, and the Aparência set:
ThemeSwatch (a palette as a tiny window, theming its own subtree), ThemePicker (the eight as one
radio group), AppearanceStage and AppearanceDock — styled by plain global stylesheets
(`controls.css`, `overlays.css`, `states.css`, `appearance.css`) whose class names match the design
canvas one-to-one. Not CSS Modules, on purpose: `tokens.css`
reaches into one component (`[data-theme="contraste"] .pad` gives Alto contraste's pale cards a
border), and hashed class names would silently break that. Dialog, Menu, Toast, Tooltip, Tabs,
Switch and RadioGroup sit on Radix Primitives for focus trapping, portals and ARIA; everything
visible is CSS against the tokens. Icons live in `src/icons/`, lifted from the canvas markup.

`IconButton` requires a `label` and puts it on the button itself as `aria-label`, so
`getByRole("button", { name })` works — the thing MUI's tooltip wrapper made impossible.

The dialog footer is cancel-then-confirm in the DOM everywhere; `[data-os="win"] .dlg .df` reverses
it visually, because primary sits right on macOS and Linux and left on Windows. That reversal is the
reason a dialog footer is a component rather than a layout.

**Radix portals render into `document.body`, outside any themed subtree.** In the app that is fine,
because the three data attributes live on `<html>` and everything inherits them. Anything that
themes a *subtree* instead — Storybook's decorator is the one case — must also stamp `<html>`, or a
portaled dialog resolves every token to nothing and `[data-os="win"]` never matches. The decorator
does this in a `useLayoutEffect` so the portal never paints once unthemed.

`pnpm storybook` runs Storybook 10 (`@storybook/react-vite`) on :6006. Three toolbar globals —
Tema × Modo × Sistema — give every story 48 renderings, which is the only practical way to keep
eight palettes honest; a fourth, Desktop (GNOME or KDE Plasma), only matters with Sistema on Linux. It is dev-only: there is deliberately no `build-storybook` script, and since
`vite build` bundles only what `src/index.tsx` reaches and nothing imports a story, none of it can
land in `build/`. Stories stay in `tsconfig.json`'s `include`, so a story that stops compiling
fails `pnpm typecheck`.

Archivo is self-hosted via `@fontsource-variable/archivo`. It must stay self-hosted (the packaged
app loads over `file://` with no network) and must stay the **variable** cut (the type ramp uses
weight 650, which the static 400/500/600/700 cut silently rounds to 700).

## Notes

- No MUI. React 19, Radix Primitives for behaviour, plain CSS against the tokens for everything visible.
  Every button has an accessible name of its own, so tests query with `getByRole("button", { name })` and
  cards with `getByRole("article", { name })` (the card is labelled by its clip-name heading). Radix Switch
  reports `role="switch"`; Radix Tabs activate on `mousedown`, so anything driving the real DOM (a
  puppeteer probe) has to send a real mouse click — a synthetic `.click()` never switches tabs.
- jsdom lacks APIs Radix uses — `matchMedia`, `ResizeObserver`, `scrollIntoView`, pointer capture — and
  `src/setupTests.ts` stubs each. Pointer capture is stubbed on `Element`, not `HTMLElement`, because the
  pointerdown target can be an `<svg>` inside a button.
