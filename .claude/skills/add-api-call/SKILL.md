---
name: add-api-call
description: Use when calling a bot endpoint the desktop doesn't call yet, changing how an existing call reads its response, or handling a new bot error label.
---

# Add an API call

1. Sync and read the contract first:
   `node scripts/sync-bot-contract.mts` (reads `../peace-breaker-bot`), then read the route in `../peace-breaker-bot/pkg/server/v1/openapi.yaml`. Never guess a shape from memory or from CLAUDE.md.
2. Add the function to `src/service.ts`:
   - Build the URL from `requireApiUrl()`. There is no default server.
   - Go through `requestEnvelope<T>()`. It folds non-2xx and 200-without-`data` into an error that carries `label`.
   - Put try/catch only around `fetch`. Let label errors propagate.
   - For an optional route that older bots don't serve, the hook that reads it maps any failure to `null` ("unknown"), never a made-up default. See `src/useBotStatus.ts` and `src/useProviders.ts`.
3. If the bot added labels, add `api.<label>` to both `src/i18n/en-US.json` and `src/i18n/pt-BR.json`. The UI shows them through `apiErrorMessage`.
4. If the route was listed in `knownUnused` in `src/botContract.json`, remove it from that list.
5. Test in `src/service.test.ts` with msw, covering success, non-2xx with a label, 200 without `data`, and a network failure.
6. Run `pnpm typecheck && pnpm react-test run`. `src/botContract.test.ts` fails if a called path isn't served or a label has no translation.
7. In the PR body, write `Other repo: peace-breaker-bot#N` for the backend PR this depends on. The backend PR merges first.
