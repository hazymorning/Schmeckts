# Schmeckt’s?

Read `PROJECT.md` before changing stored data, sync, storage or the server.

## Rules

- Local first. The app does everything without the server. The server is an optional add-on for sync and AI photo
  recognition: never make a feature depend on it, and never describe it as the place where the data lives.
- Stored values, field names and the sync protocol stay compatible. A phone one version behind keeps working, and
  the installed server keeps working with every new app version: a release never needs a server update. Change the
  server only when the task is about it.
- Less is more, in code and in text. A comment only for a reason the code cannot show, one line where possible. No
  comments that restate the code, tell its history or point to PROJECT.md.
- `PROJECT.md` changes only with architecture, stored data, the protocol or the server API, never with wording or
  layout.
- Tests cover behaviour. Do not pin exact wording or pixel sizes unless that is what the change is about.
- For cats only. The interface says „Katze“, never „Tier“, and nothing is built for other animals.
- The interface is German, plain, as people talk. Code, comments and commit messages are English. The words are
  „füttern“, never „servieren“, and „Sorte“, never „Futter“ or „Produkt“ for a variety.
- Code earns its place by being seen. What users rarely see does not go in.
- Made for 390 to 412px width. At 360px only one thing counts: nothing is cut off.
- A new type style, distance or building block only after asking.
- When a wanted design change breaks a test, the test changes. No special rule for it.
- Commits and pull requests: short and plain, no trailers, no footers, no emoji, no long dash. One pull request at a
  time.

## Finishing work

Do all of this without being asked, and do not stop before the end:

1. Lint and all suites green locally, commit, push.
2. Open the pull request yourself (this file is the standing permission), then watch its checks and fix every
   failure until they are green.
3. When the task is a new version: raise `version` in `app/package.json` and both `version` fields of
   `app/package-lock.json` in the same pull request, the server's version only if the server changed. Once the checks
   are green, give the owner two steps: merge the pull request, then open
   `https://github.com/hazymorning/Schmeckts/releases/new?tag=v<version>&title=v<version>` and publish.

## Commands

- Cloud sessions get the test tools from `.claude/hooks/session-start.sh`. Elsewhere: Node 22, Go,
  `pip install -r tests/requirements.txt` and `python3 -m playwright install chromium`.
- `scripts/lint.sh` before every push.
- `scripts/test.sh <suites>` while working, only what the change touches: `node` for pure modules (`smart`, `glance`,
  `ocr`, `derive`), `ui design` for views and CSS, `storage sync go` for store, sync and server, `files` for
  packaging and versions. All suites before pushing.
- `scripts/setup-build-env.sh` and `scripts/build-apk.sh` only to build the APK.
