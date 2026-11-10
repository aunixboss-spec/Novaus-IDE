<div align="center">

# Novaus IDE

Lightweight desktop IDE with built-in bytecode decompilation and autonomous AI agent.

[![Release](https://img.shields.io/badge/release-v1.0-blue?style=flat-square)](https://github.com/aunixboss-spec/Novaus-IDE/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey?style=flat-square)]()
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F?style=flat-square&logo=electron)]()

<br><br>

<img src="src/assets/IMG_20261110_134436.jpg" alt="Novaus IDE Workspace" width="900" />

</div>

## Overview

**Novaus IDE** is a minimal, fast development environment built on Electron and Monaco Editor. It combines standard editing and script execution with an embedded reverse-engineering workspace, allowing you to disassemble and decompile compiled binaries alongside your source tree.

## Supported Decompiler Formats

| File Extension | Target Ecosystem | Backend Tool | Status / Prerequisite |
| :--- | :--- | :--- | :--- |
| **`.wasm`** | WebAssembly | Bundled WABT | Built-in (works offline out of the box) |
| **`.class`** | JVM / Java | JDK `javap` or CFR | JDK configured in `PATH` or local `cfr.jar` |
| **`.pyc`, `.pyo`** | Python Bytecode | Python `dis` | Python 3.x available in `PATH` |
| **`.dll`, `.exe`** | .NET Assemblies | ILSpy (`ilspycmd`) | `dotnet tool install -g ilspycmd` |

<br>

<div align="center">
  <img src="src/assets/IMG_20261110_134450.jpg" alt="Novaus IDE Decompiler & AI" width="900" />
</div>

## Features

* **Monaco Editor** — Multi-tab editing powered by VS Code's core engine with syntax highlighting for 25+ languages, change indicators, and file-type icons.
* **Autonomous AI Copilot** — Connects to any OpenAI-compatible API endpoint (Groq, OpenRouter, OpenAI):
  * **Agent Mode** — AI can read/modify workspace files and execute terminal commands.
  * **Model Auto-Discovery** — Instant API key validation and model loading.
  * **Code Insertion** — Transfer generated snippets directly into the open editor tab.
* **Integrated PowerShell Terminal** — Terminal instance bound to the workspace directory with `↑`/`↓` command navigation.
* **Instant Script Runner (`F5`)** — Fast execution of Python and Node.js files with output streamed directly into the bottom drawer.
* **Session Persistence** — Automatically restores workspace directories, open tabs, terminal history, and AI conversations across launches.

## AI Configuration

1. Open the AI Copilot pane (<kbd>Ctrl</kbd> + <kbd>I</kbd>).
2. Click **Settings** (⚙) and set your custom Base URL (e.g. `https://api.groq.com/openai/v1`), Model name, and API key.
3. Click **Check Key & Load Models** to validate credentials and populate models.

API credentials remain strictly local at `%APPDATA%\Novaus IDE\config.json`.

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save current file |
| <kbd>F5</kbd> | Execute current script (Python / Node.js) |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Toggle Project Explorer |
| <kbd>Ctrl</kbd> + <kbd>I</kbd> | Toggle AI Copilot panel |

## License

Licensed under the [MIT License](LICENSE).
