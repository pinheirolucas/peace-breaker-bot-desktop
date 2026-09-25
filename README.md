# Peace Breaker Bot (desktop)

Desktop app (Electron + React, built with Vite) for browsing, favoriting, and playing "instants" (short audio clips, like the ones on [myinstants.com](https://www.myinstants.com)) — either locally or by sending them to a Discord bot. This is the UI half of the project; it talks to the backend service in the sibling repo [`peace-breaker-bot`](https://github.com/pinheirolucas/peace-breaker-bot), which must be running for anything here to work.

## Features

- **Favoritos and Explorar**: save clips, and browse or search several sites (MyInstants, SoundboardGuy, Sound Buttons) with a region filter where the site supports one.
- Play a clip locally, or send it to the Discord bot to play in a voice channel.
- **Keys**: give a favourite a key to play it, with optional global keys that work while another app has focus, plus a command palette (Cmd/Ctrl+K).
- **Appearance**: eight palettes, each in auto, light or dark.
- **Servers**: finds the backend on the network automatically, or add one by address. The server chip in the toolbar shows its health and the bot's voice status.
- **Tray and quick access**: a tray menu and a small quick-access window for playing favourites without the main window.
- **Configurações**: a settings window, plus import/export of favourites and settings as a JSON file.

## Requirements

- Node.js and [pnpm](https://pnpm.io/) (both pinned in `.tool-versions`, which asdf and mise both read)
- The [`peace-breaker-bot`](https://github.com/pinheirolucas/peace-breaker-bot) backend running and reachable on the network (see [Backend connection](#backend-connection))

## Installation

```bash
git clone https://github.com/pinheirolucas/peace-breaker-bot-desktop.git
cd peace-breaker-bot-desktop
pnpm install
```

## Usage

Start the backend first (see its README), then:

```bash
pnpm start
```

This runs the Vite dev server and opens the Electron window pointed at it. To run only the React app in a browser instead:

```bash
pnpm react-start
```

then open http://localhost:3000.

### Backend connection

There is no default backend address. The Electron app finds the backend automatically through mDNS, and you pick between servers from the server chip in the toolbar. When discovery can't see it (multicast blocked, another network), add the server by address from the same menu or from Configurações.

## Building

```bash
pnpm build      # production React build + packaged Electron app
pnpm release    # production build + publish via electron-builder (GitHub releases)
```

Packaged builds are published to GitHub releases and picked up automatically by the app's built-in auto-updater.

## Development

```bash
pnpm react-start   # Vite dev server only, at http://localhost:3000
pnpm react-test    # run the test suite (Vitest, watch mode)
pnpm typecheck     # tsc --noEmit, the only type check
pnpm react-build   # production build to build/
```

## License

[MIT](./LICENSE)
