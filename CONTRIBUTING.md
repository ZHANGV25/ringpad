# Contributing to Ringpad

Bug reports, fixes and small features are welcome. For anything large, open an issue first so we
can agree on the approach before you spend time on it.

## Build

You need Windows 10 or 11, Rust (stable, 1.90 or newer), Node 22 and the WebView2 runtime.

```bash
npm install
npm run dev                      # the app, with hot reload for the interface
npm run dev --workspace ui       # the interface alone at http://localhost:1420, with a fake engine
npm run build                    # the NSIS installer, in target/release/bundle/nsis
```

`cargo run -p ringpad-windows --example probe` lists audio devices and apps and prints hotkey
presses, which helps when a device or a mouse button misbehaves.

## Test

Run these before opening a pull request. CI runs the same checks.

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
npm run typecheck --workspace ui
npm run coverage --workspace ui
```

New code comes with tests. The engine in `crates/core` has no OS code, so most audio behaviour can
be tested there with plain sample buffers. The interface tests run against the fake engine in
`ui/src/engine/fakeApi.ts`.

## Layout

- `crates/core`: the engine. One audio thread owns `Engine`; the rest of the app talks to it
  through `EngineHandle` (lock-free queues and atomics). Nothing here may block or allocate on the
  audio thread.
- `crates/windows`: WASAPI streams, per-app loopback capture, device polling and Raw Input
  hotkeys.
- `app`: the Tauri shell. Commands and events follow `docs/IPC.md`; keep that file and
  `ui/src/engine/types.ts` in step with any change.
- `ui`: React and TypeScript. Colours and spacing come from `ui/src/styles/tokens.css`; the
  interface stays monochrome in both themes.

## Style

- Rust: `rustfmt` defaults, no `unwrap` outside tests, errors with `thiserror`.
- TypeScript: strict mode, no `any`, small components, immutable updates.
- Interface text: short, plain words, sentence case. Say what a control does, not how it works.
- Commits: `type: summary` (feat, fix, refactor, docs, test, chore, perf, ci).

## License

By contributing you agree that your work is released under the [MIT License](LICENSE).
