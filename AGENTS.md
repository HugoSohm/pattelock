# Agent Instructions & Project Standards - Pattelock

This document provides context and critical rules for AI agents working on the Pattelock project.

## 1. Project Overview
Pattelock is a small desktop app built with **Tauri v2**, **Vite** and **TypeScript** (no framework). It temporarily disables keyboard keys (F1 to F12, Print Screen, Scroll Lock, Pause, or the whole keyboard) so that a cat lying on the keyboard triggers nothing. It runs on Windows, macOS and Linux (X11 and Wayland), lives in the tray, and shows an animated pixel art cat. The visual reference is [`docs/maquette/`](docs/maquette/).

## 2. Useful Commands
*   `npm run dev` : Starts the full development environment (Vite + Tauri Dev).
*   `npm run build` : Builds production-ready bundles for the current platform.
*   `npm run frontend:dev` : Runs only the Vite frontend with a fake backend (URL parameters: `?etat=pause|tout`, `?vue=reglages`, `?theme=dark`, `?langue=en`, `?plateforme=macos`).
*   `npm run icons` : Regenerates the app and tray icons from the cat sprite.
*   `npm run demo:build` : Regenerates `docs/maquette/anim-demo.html`.
*   **Frontend Validation & Linting**:
    *   `npm run typecheck` : Runs the TypeScript type-checker (`tsc --noEmit`).
    *   `npm run lint` : Runs Biome on `./src`.
    *   `npm run lint:fix` : Automatically formats and fixes Biome warnings.
*   **Backend Validation & Formatting (Rust)**:
    *   `npm run check:rs` : Runs `cargo check`.
    *   `npm run lint:rs` : Runs `cargo clippy` (CI uses `-D warnings`).
    *   `npm run test:rs` : Runs the Rust unit tests.
    *   `npm run format:rs` : Verifies formatting with `cargo fmt --check`.
    *   `npm run format:rs:fix` : Formats all Rust sources in `src-tauri`.

## 3. Architecture
*   **The state lives in Rust.** [`src-tauri/src/core.rs`](src-tauri/src/core.rs) owns the mode (`off`, `fkeys`, `all`), the settings and the counter. The frontend only displays it: it calls commands and listens to `state-changed`, `total-changed` and `key-intercepted`. Never add state that the frontend decides on its own, except pure UI state (current view, recording).
*   **Keyboard hooks** live in [`src-tauri/src/keyguard/`](src-tauri/src/keyguard/), one module per OS behind the `KeyGuard` trait. The hook thread only reads atomics (`Shared`) and sends events through a non-blocking channel. It never locks, allocates in the hot path, or calls Tauri.
*   **Safety nets are mandatory**: in whole-keyboard mode, the unlock shortcut is detected inside the hook; whole-keyboard mode is never restored on restart; a hook failure lets keys through.
*   **Cross-OS code**: code compiled on one OS only must not leave dead code on the others. Use `#[cfg_attr(not(target_os = "..."), allow(dead_code))]` on OS-specific items, and keep pure mapping tables testable on every OS.

## 4. Tauri v2 Specifics
*   **Version Fidelity**: Tauri v2 only. Never use v1 APIs or config (`allowlist`, `tauri::api::*`, `SystemTray`, `@tauri-apps/api/tauri`). Permissions go in `src-tauri/capabilities/*.json`.
*   **Plugins**: global-shortcut, autostart, single-instance, store and log. Do not add plugins without asking.
*   **Main window**: created in Rust ([`window.rs`](src-tauri/src/window.rs)), hidden until the frontend calls `ui_ready`, sized to about one third of the screen's work area and centered.
*   **No network**: strict CSP, fonts embedded, no CDN. Never use `innerHTML` or `style` attributes in the frontend; set styles through the CSSOM.

## 5. Design & Code Style
*   **Pixel art**: everything moves by frames or by whole sprite pixels, with `steps()` timings. No rotation, blur or sub-pixel movement. Sprites are drawn on canvas with an integer pixel size.
*   **Sizing**: all CSS is in `rem`, with `html { font-size: calc(100vw / 47.5) }` (1 rem = 16 px at 760 px wide).
*   **Theming**: colors come from CSS variables in [`tokens.css`](src/styles/tokens.css), with a light and a dark set. Dark is not an inversion: same roles, other values.
*   **UI language**: the interface is in French and English. Every UI string lives in [`src/i18n.ts`](src/i18n.ts), in both languages. The Rust core never sends sentences to the UI: it sends codes (guard status reasons, shortcut errors) that the frontend translates. Only the tray menu is translated in Rust ([`tray.rs`](src-tauri/src/tray.rs)). Never use em dashes (« — ») in UI strings.
*   **Accessibility**: real `<button>` elements, `aria-pressed` on keys and on the cat, visible focus.
*   **Code Quality & Formatting (Biome)**: the frontend strictly uses **Biome** (`biome.json`). Always run `npm run lint` or `npm run lint:fix` before finalizing a frontend task.

## 6. Communication & Workflow
*   **Tone**: Concise, technical, and direct.
*   **Version-Specific Validation**: Before proposing any configuration change, check `package.json` or `Cargo.toml` for exact dependency versions, and verify the matching official documentation instead of relying on memory.
*   **Testing**: say explicitly which OS you could test. Hook code for an OS you cannot run must at least pass `cargo check` and `cargo clippy` for that target.
*   **Code Hygiene**: Systematically remove unused imports and debug code before finalizing a task.
*   **Changelog Writing**: When editing `Changelog.md`, write clear, concise, user-facing entries. Avoid technical jargon, framework details, code snippets or internal names.
