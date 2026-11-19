# AGENTS.md

Ringpad: an open-source Windows soundboard with instant voice replay. Rust engine, Tauri 2 shell,
React + TypeScript UI. MIT licensed. Windows 10/11 only.

## Layout
- `crates/core` the audio engine, no OS code. One audio thread owns `Engine`; everything else talks
  to it through `EngineHandle` (lock-free queues and atomics). Nothing there may block or allocate
  on the audio thread. Most audio behaviour is tested here with plain sample buffers.
- `crates/windows` WASAPI streams, per-app loopback capture, device polling, Raw Input hotkeys.
  Has `probe` and `loopcheck` examples.
- `app` the Tauri shell (`tauri.conf.json`, commands and events, settings, tray; installer hooks in `app/windows/hooks.nsh`).
- `ui` React + TypeScript (Vite, port 1420), an npm workspace. Tokens in `ui/src/styles/tokens.css`;
  the interface stays monochrome in both themes. Tests run against the fake engine `ui/src/engine/fakeApi.ts`.
- `docs/IPC.md` the command and event contract; `docs/SETUP.md` user setup; `docs/brand`, `docs/images`.
- `third_party/vb-cable` VB-CABLE Pack45, bundled unchanged. Also `CONTRIBUTING.md`, `SECURITY.md`.
- `site` the download page (Next.js static export, its own npm project, not a workspace). Its look
  is copied from briertradinggroup.com (prop-firm `platform/apps/web/src/app/ui.css`); every word
  and link is in `site/src/content/site.ts`. Media in `site/public/media` comes from the UI's fake engine.

## Setup
- Windows, Rust stable 1.90 or newer, Node 22, WebView2 runtime, MSVC Build Tools.
- `npm install` at the repo root (installs the Tauri CLI and the `ui` workspace).

## Build, test, check
- `npm run dev` runs the app with hot reload. `npm run dev --workspace ui` runs the UI alone at
  http://localhost:1420 with a fake engine.
- `npm run build` builds the NSIS installer into `target/release/bundle/nsis`.
- Before a PR (CI runs the same):
  ```
  cargo fmt --all --check
  cargo clippy --workspace --all-targets -- -D warnings
  cargo test --workspace
  npm run typecheck --workspace ui
  npm run coverage --workspace ui
  npm run e2e --workspace ui
  ```
- `npm run e2e --workspace ui` runs Playwright (`ui/e2e`) against the fake engine in light and
  dark, including an AA contrast check; it starts Vite itself. Run `npx playwright install chromium`
  in `ui` once.
- `npm test` runs the UI tests only. `tauri::generate_context!` needs the built UI at compile time,
  so run `npm run build --workspace ui` before clippy or cargo test on a fresh checkout.
- Site: `cd site`, `npm install`, then `npm run dev` (port 3240), `npm run typecheck`, `npm run coverage`,
  `npm run build` (writes `site/out`) and `npm run e2e` (run `npx playwright install chromium` once).
- `cargo run -p ringpad-windows --example probe` lists devices and apps and prints hotkey presses
  (letters, digits and space stay hidden unless `--all-keys` is passed).

## Release / deploy
- CI (`.github/workflows/ci.yml`) runs on pushes to `main` and on pull requests.
- Release (`.github/workflows/release.yml`) runs on a `v*` tag, or by hand (installer artifact only).
  1. Set the new version in `app/tauri.conf.json`; the workflow fails if the tag does not match it.
     Keep the workspace version in `Cargo.toml` and `ui/package.json` in step.
  2. Merge to `main` with CI green, tag `vX.Y.Z` on that commit and push the tag.
  3. The workflow builds the installer and creates a DRAFT GitHub release with the `.exe` and
     `SHA256SUMS.txt`. A person reviews and publishes it.
- Installers are unsigned.
- On a new version, set `VERSION` and `INSTALLER_BYTES` in `site/src/content/site.ts` (a test holds
  the version to `app/tauri.conf.json`). The site deploys on Vercel from `site/` (project root `site`).

## Conventions
- Commits: `type: summary` (feat, fix, refactor, docs, test, chore, perf, ci). No Co-Authored-By
  trailer. Push after every commit. Never force-push. Never skip commit hooks.
- Rust: rustfmt defaults, no `unwrap` outside tests, errors with `thiserror`.
- TypeScript: strict, no `any`, small components, immutable updates.
- Keep `docs/IPC.md` and `ui/src/engine/types.ts` in step with any command or event change.
- Interface text: short, plain words, sentence case; say what a control does, not how it works.
- New code comes with tests.

## Traps
- COM work runs on its own thread: initialising MTA on the UI thread breaks tao's OleInitialize.
- Do not kill an installed `ringpad.exe` while someone is in a game or call: their mic may be the
  virtual cable (CABLE Output), so killing it cuts their voice. Only stop your own dev runs.
- A running Ringpad grabs F-keys and mouse buttons and passes mic audio into the cable. Stop your dev
  build before a game starts, and clear `%APPDATA%\Ringpad\settings.json` after testing so the
  first launch shows setup.
- `third_party/vb-cable` is binary (see `.gitattributes`): the `.cat` signs the INF bytes, so do not
  edit it or let line-ending conversion touch it.
- Settings use `serde(default)`: give new fields defaults so old settings files still load.
- Playwright under CDP emulates focus and visibility, so "calm mode" (pauses animation after the
  window loses focus) cannot be checked that way; count rAF frames instead.
- To drive the real app: set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<port>`
  (any free port; 9222 is often taken), run `cargo run -p ringpad`, then connect Playwright with
  `connectOverCDP`. The debug build loads the Vite server on :1420.
- Injected key presses (SendInput) reach no app while the screen is locked or the screen saver is on,
  so hotkey and talk-key checks need someone at the PC.
- Audio and hotkey code is hard to unit test: verify on a real Windows machine when touching `crates/windows`.
