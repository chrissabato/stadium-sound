---
name: release
description: Push a new Stadium Sound release — bump the version, add the in-app What's New changelog entry, commit, tag vX.Y.Z, and push. The tag push triggers GitHub Actions to create the release, build/publish Windows+macOS installers, and update the website version; nothing is built or published locally.
---

# Releasing a new version

A release is a `Bump version to X.Y.Z` commit on `main` plus a `vX.Y.Z` tag.
Pushing the tag triggers `.github/workflows/release.yml`, which does the rest:
creates the GitHub release (auto-generated notes), builds and publishes the
Windows and macOS installers, updates the version/date on the website
(`docs/index.html`), and redeploys Pages. **Never run
`electron-builder --publish` locally.**

## Preconditions — verify before touching anything

- On `main`, in sync with `origin/main` (`git pull` first), working tree clean.
  If there are unrelated uncommitted changes, stop and ask.
- Version: patch bump by default; ask the user only if the changes look
  minor-worthy (new feature area) and they haven't said. Previous version =
  `version` in package.json.

## Steps

1. **Bump**: `npm version X.Y.Z --no-git-tag-version` — updates package.json
   and package-lock.json (both belong in the commit).

2. **Changelog entry** (required — the in-app What's New dialog reads it):
   add a new entry at the TOP of `src/renderer/src/changelog.ts` with the new
   version and today's date. Draft the items from
   `git log v<prev>..HEAD --oneline` — user-facing wording for the person
   running sound at an event, not commit messages; skip internal/dev-only
   changes. Show the user the drafted items before committing.

3. **Gate** — all three must pass before committing; never tag otherwise:
   - `npm run typecheck`
   - `npm run build`
   - Changelog check: the FIRST entry in `src/renderer/src/changelog.ts` has
     `version` exactly equal to the new package.json version. If it doesn't
     (entry forgotten or version mismatch), go back to step 2 — do not
     proceed without it, even if the user is in a hurry; the What's New
     dialog auto-opens for every user after the update and would show them
     the previous release's notes under the new version.

4. **Commit** package.json, package-lock.json, and changelog.ts together:

   ```
   Bump version to X.Y.Z
   ```

   (plus the standard co-author/session footer).

5. **Tag and push** — confirm with the user first; this publishes the release:

   ```
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

   Note: lightweight tag, pushed explicitly — `--follow-tags` would skip it.

6. **Verify**: watch the run with
   `gh run list --workflow=release.yml --limit 1` then `gh run watch <id>`
   (three jobs after create-release: build-windows, build-mac,
   update-website-version). When green, confirm assets exist with
   `gh release view vX.Y.Z`. The website commit
   (`chore: update website version to vX.Y.Z`) lands on `main` — mention that
   the user's local main is now behind.

## If something fails after the tag is pushed

Fix forward: the workflow ran against the tagged commit, so a broken build
means a new patch release, not re-tagging. Only delete the tag/release
(`gh release delete`, `git push origin :refs/tags/vX.Y.Z`) if the user
explicitly wants the release pulled.
