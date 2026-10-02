# Schmeckt’s?

Read `PROJECT.md` before changing stored data, sync, storage or the server.

## Rules

- Local first. The app does everything without the server. The server is an optional add-on for sync and AI photo
  recognition: never make a feature depend on it, and never describe it as the place where the data lives.
- Stored values, field names and the sync protocol stay compatible. A phone or a server one version behind keeps
  working.
- Less is more, in code and in text. A comment only for a reason the code cannot show, one line where possible. No
  comments that restate the code, tell its history or point to PROJECT.md.
- `PROJECT.md` changes only with architecture, stored data, the protocol or the server API, never with wording or
  layout.
- Tests cover behaviour. Do not pin exact wording or pixel sizes unless that is what the change is about.
- The interface is German, plain, as people talk. Code, comments and commit messages are English.
- Commits and pull requests: short and plain, no trailers, no footers, no emoji, no long dash. One pull request at a
  time.

## Commands

- Cloud sessions get the test tools from `.claude/hooks/session-start.sh`. Elsewhere: Node 22, Go, and
  `pip install -r tests/requirements.txt`.
- `scripts/lint.sh` before every push.
- `scripts/test.sh <suites>` while working, only what the change touches: `node` for pure modules (`smart`, `glance`,
  `ocr`, `derive`), `ui design` for views and CSS, `storage sync go` for store, sync and server, `files` for
  packaging and versions. All suites before pushing.
- `scripts/setup-build-env.sh` and `scripts/prepare.py` only to build the APK.
