---
name: add-component
description: Use when adding a reusable UI primitive or a new visual component under src/components, or giving an existing one a new variant.
---

# Add a component

1. Look in `src/components/` first. Reuse or extend `Button`/`IconButton`, `Menu`, `Dialog`, `Field`, `Switch`, `Segmented`, `Tooltip` before adding a new one.
2. Styles go in the matching `src/components/*.css`. Name tokens from `src/styles/tokens.css`, never raw colours. Use bare attribute selectors so a subtree can re-theme.
3. Accessibility: icon-only controls use `IconButton`, which requires `label`. Every control is reachable by keyboard.
4. Add a story (`<Name>.stories.tsx`) with a Portuguese title, like the existing ones. Check it with the toolbar globals Tema × Modo × Sistema. Menus and dialogs portal into `body`, and the decorator stamps `<html>`.
5. If you added a token or palette value, update `src/tokens.contrast.test.ts`.
6. Layout depends on window width (tiers at 880/600, `useTier` for portaled content). jsdom has no layout, so check the story in Storybook at 360, 420, 720 and 1280 px, and say so in the PR's Test plan.
7. Run `pnpm typecheck && pnpm react-test run`.
