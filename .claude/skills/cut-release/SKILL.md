---
name: cut-release
description: Cut a desktop release candidate or final release through the Cut Release workflow.
disable-model-invocation: true
---

# Cut a release

Only when the user runs `/cut-release`. The project denies `gh workflow run` and `git tag` for agents, so hand the user each command to run with `!`.

1. Check that `main` is green: `gh run list --workflow ci.yaml --branch main --limit 1`.
2. Dry run to preview the version:
   `gh workflow run cut-release.yaml -f bump=patch -f prerelease=true -f dry_run=true`
3. Release candidate: the same command without `dry_run`. It runs `npm version`, pushes the `vX.Y.Z-rcN` tag, and dispatches `release.yaml`, which runs typecheck and tests, builds on macOS, Windows and Linux, and publishes the GitHub release.
4. Verify with `gh run watch`. The release should have dmg, zip, exe, AppImage, blockmaps and `latest*.yml`, because the auto-updater reads `latest*.yml`.
5. The user installs and smoke-tests the rc. If something is wrong, fix it on `main` and cut the next rc (v0.1.15 took rc1–rc5).
6. Final release: `-f prerelease=false`, same bump. The version drops the `-rcN`.
