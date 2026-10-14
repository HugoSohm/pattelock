# Contributing to Pattelock

Thank you for your interest in contributing to Pattelock! We are an open-source project and welcome contributions of all kinds: bug reports, ideas, code, new cat coats.

## How to Contribute

### 1. Reporting Bugs
- Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template.
- Provide a clear description and steps to reproduce.
- Mention your operating system, and on Linux whether you use X11 or Wayland: key blocking works differently on each.
- Check if the issue has already been reported.

### 2. Suggesting Features
- Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template.
- Describe the feature and why it would be useful.

### 3. Submitting Pull Requests
1. **Fork** the repository.
2. **Create a new branch** for your feature or bugfix: `git checkout -b feature/my-new-feature`.
3. **Commit** your changes carefully.
4. **Run the checks** listed below.
5. **Push** your branch to your fork.
6. **Open a Pull Request** to the `main` branch.

## Development Workflow

### Requirements
- Node.js 24 or later.
- Rust (latest stable version).
- The [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for your OS.

### Commands
- Run in dev mode: `npm run dev`.
- Run the interface alone in a browser, with a fake backend: `npm run frontend:dev`.
- Build for production: `npm run build`.
- Regenerate the app and tray icons from the cat sprite: `npm run icons`.
- Regenerate the standalone animation demo: `npm run demo:build`.

### Checks
Pull requests run the same checks in CI, on Windows, macOS and Linux:
- `npm run lint` and `npm run typecheck` for the frontend.
- `npm run format:rs`, `npm run lint:rs -- -- -D warnings` and `npm run test:rs` for Rust.

### Code Style
- **Frontend**: [Biome](https://biomejs.dev/) formats and lints `src/` (`npm run lint:fix`). TypeScript runs in strict mode.
- **Rust**: `cargo fmt` and `cargo clippy` with no warnings, on every OS. Code that only exists on one OS must not leave dead code on the others.
- **Pixel art**: the cat only moves by whole pixels. Animations change frames or shift by whole sprite pixels, never rotate, blur or use sub-pixel positions.
- **UI text**: the interface is in French. Do not use em dashes in UI strings.
- Keep modules small and add comments where logic is complex, especially in the keyboard hooks.

### Adding a Cat Coat
Coats are a simple palette table in [`src/cat/skins.ts`](src/cat/skins.ts). Add an entry with the outline, fur, muzzle, pink, eye and highlight colors. For patterns such as stripes, use the optional `S` color: sprite pixels marked `S` fall back to the fur color on coats that don't define it.

### Working on the Keyboard Hooks
Blocking lives in [`src-tauri/src/keyguard/`](src-tauri/src/keyguard/), with one module per OS behind a shared trait. A few rules keep users safe:
- The hook never blocks and never calls Tauri: it only reads atomics and sends events through a non-blocking channel.
- In whole-keyboard mode, the unlock shortcut must be detected by the hook itself.
- If the hook fails, keys must go through.

Please test your changes on the OS you touch, and say in the pull request which systems you could test.

---

By contributing, you agree that your contributions will be licensed under the project's [GNU AGPLv3 License](LICENSE).
