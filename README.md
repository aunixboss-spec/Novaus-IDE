<div align="center">

# ⚡ Novaus IDE

### *The Ultimate Engineering Experience. Power Your Code. Unleash Your Potential.*

Next-generation desktop IDE blending raw Electron speed, sleek aesthetics, autonomous AI agents, and a dedicated native binary decompiler suite.

[![Release](https://img.shields.io/badge/release-v1.0-blue?style=for-the-badge)](https://github.com/aunixboss-spec/Novaus-IDE/releases)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-black?style=for-the-badge)]()
[![Electron](https://img.shields.io/badge/built%20with-Electron-47848F?style=for-the-badge&logo=electron)]()

<br><br>

<img src="src/assets/IMG_20261110_134436.jpg" alt="Novaus IDE Workspace" width="1000" />

</div>

---

## 💎 Overview

**Novaus IDE** isn't just another text editor — it’s a lightweight powerhouse crafted for developers and reverse engineers who refuse to compromise between speed, aesthetics, and pure functionality. Built from the ground up around the legendary **Monaco Editor engine**, Novaus delivers instant responsiveness and eliminates the bloat of traditional heavy IDEs.

Inspect compiled assemblies, orchestrate self-directed AI agents, stream CLI execution, and reverse-engineer binaries — all within a single, unified, dark-glass interface.

---

## 🔮 Supported Decompiler Formats

Stop context-switching between third-party decompilers. Novaus IDE embeds a high-performance reverse-engineering pipeline directly beside your active code buffer:

| Format | Target Platform | Backend Engine | Integration Level |
| :--- | :--- | :--- | :--- |
| **`.wasm`** | WebAssembly | **WABT** (Native) | ⚡ **Zero Setup** — Works fully offline out of the box |
| **`.class`** | JVM / Java Bytecode | **javap** / **CFR** | 🚀 Native JDK PATH or instant local JAR hook |
| **`.pyc`, `.pyo`** | Python Bytecode | Python **dis** Engine | 🐍 Direct disassembly through local Python runtime |
| **`.dll`, `.exe`** | .NET Ecosystem | **ILSpy** (`ilspycmd`) | 🛠 High-speed C# / IL reconstruction |

<br>

<div align="center">
  <img src="src/assets/IMG_20261110_134450.jpg" alt="Novaus IDE Decompiler & AI" width="1000" />
</div>

---

## ⚡ Elite Features

* **Monaco Core** — The unmatched performance of VS Code’s editing engine featuring syntax highlighting across 25+ programming languages, granular change indicators, and bespoke file iconography.
* **Autonomous AI Copilot** — Elevate your workflow with any OpenAI-compatible provider (Groq, OpenRouter, OpenAI, local LLMs):
  * **True Agent Mode** — Grants the AI agency to inspect file hierarchies, commit changes, and trigger shell pipelines autonomously.
  * **Dynamic Auto-Discovery** — Instant API handshake with live model list fetching straight from your endpoint.
  * **Zero-Friction Insertion** — Seamlessly beam generated code snippets straight into your active workspace tab.
* **Embedded PowerShell Console** — Low-latency terminal anchored directly to your project root with deep command history navigation (`↑`/`↓`).
* **Instant Runner (`F5`)** — High-speed script execution for Python and Node.js with zero configuration and live output streaming.
* **Intelligent Session Persistence** — Effortlessly resumes your creative flow: every tab, open directory, terminal command, and Copilot context is restored instantly on launch.

---

## 🔑 AI Engine Configuration

1. Toggle the AI Copilot pane (<kbd>Ctrl</kbd> + <kbd>I</kbd>).
2. Click **Settings** (⚙) and input your Base URL (e.g. `https://api.groq.com/openai/v1`), preferred model identifier, and API secret.
3. Click **Check Key & Load Models** for instantaneous verification.

> 🔒 *Absolute Privacy: Your API credentials never leave your machine — saved locally at `%APPDATA%\Novaus IDE\config.json`.*

---

## ⌨️ Command Shortcuts

| Hotkey | Command |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save Active Buffer |
| <kbd>F5</kbd> | Execute Script (Python / Node.js) |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Toggle Project Explorer |
| <kbd>Ctrl</kbd> + <kbd>I</kbd> | Summon AI Copilot |

---

## 📜 License

Distributed under the [MIT License](LICENSE).
