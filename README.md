# AIDE for Codium — Comprehensive README (Pixi \& DeepSeek R1 7B Qwen Edition)

**Agentic AI for VSCodium/VSCode—built for the Intel Arc community, free for all.**

## 🚀 What Is AIDE?

AIDE is an open-source, privacy-first AI companion for Codium/VSCode. It delivers code review, document ingestion, hybrid web/local search, GPU acceleration, speech input, and more—with no Conda or manual complexity. If you use it, please credit **platysonique**.

## ✨ Features

- **Intelligent Coding Assistant:** Instant help and proactive suggestions.
- **GPU Acceleration:** Optimized for Intel Arc, with CPU fallback.
- **Offline-First:** Features run locally; online search is opt-in.
- **Easy Hybrid Search:** Out-of-the-box support for Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo—no local search engines needed.
- **Speech \& Document UI:** Use your voice or upload documents at any time.
- **Robust Code Review \& Debugging:** Automated fixes and guided debugging.
- **Community Driven:** Free to use, extend, or remix—just mention platysonique!


## 🛠 Prerequisites

- **Node.js** (v20+)
- **npm**
- **TypeScript** (`npm install -g typescript`)
- **Pixi** (Python package/env manager)
- **Python** (>=3.9, <3.12; managed by Pixi)


### Quick Install (Linux/macOS)

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
sudo apt-get install -y nodejs
npm install -g typescript
curl -fsSL https://pixi.sh/install.sh | bash
```

*For Windows, see each tool's official guides.*

## 📂 Project Structure

```
aide-codium-extension/
├── build/
│   └── bundle.sh
├── docs/
│   └── README.md                # ← This file
├── scripts/
│   ├── scaffold.sh
│   ├── setup.sh
│   └── create_extension.sh
├── src/
│   ├── extension/
│   ├── backend/
│   └── ingest/
├── models/
├── pixi.toml
├── pixi.lock
```


## ⚙️ Setup \& Build Instructions

For maintainability and debugging, setup uses clearly separated scripts.

### 1. Scaffold the Project

```sh
bash scaffold.sh
mv scaffold.sh scripts/
mv setup.sh scripts/
mv create_extension.sh scripts/
```

*Always run subsequent scripts from `scripts/`.*

### 2. Environment Setup

```sh
bash scripts/setup.sh
```

- Sets up the Pixi environment and all Python dependencies.
- Optionally checks for Intel GPU drivers if on Linux.
- Validates project files and prerequisites.


### 3. Build \& Package the Extension

```sh
bash scripts/create_extension.sh
```

- Installs Node.js dependencies.
- Compiles TypeScript sources.
- Bundles the extension (Webpack).
- Packages extension as `.vsix` with `vsce` (installs globally if missing).


### 4. Install the Extension

**In VSCodium:**

```sh
codium --install-extension build/dist/aide-codium.vsix --force
```

**In VS Code:**

```sh
code --install-extension build/dist/aide-codium.vsix --force
```

Run both if you use both editors.

### 5. Place Model Files

Copy your DeepSeek R1 7B Qwen model files into the `models/` directory.

- For multi-model support, modify the `model:` path in `src/backend/config.yaml`.


### 6. Activate Environment, Launch Backend

To open a Pixi dev shell:

```sh
pixi shell
```

To run the backend directly:

```sh
pixi run python src/backend/api.py
```


## 🔍 Search Features (No Extra Installs Required)

- **APIs included:** Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo (all via public APIs).
- **No SearxNG or other local search servers required!**
- **Flexible priority:** Set order and specify API keys in `src/backend/config.yaml`.
- **Automatic fallback:** If one search fails, AIDE moves to the next.


## 📜 System Features Overview

| Feature | Description | Offline/Hybrid |
| :-- | :-- | :-- |
| Large Language Model | DeepSeek R1 7B Qwen local model | Offline |
| Retrieval Augmented Gen. | Local Qdrant/ChromaDB indexed search | Offline |
| Speech-to-Text (STT) | Whisper and Vosk with Intel GPU acceleration | Offline |
| Text-to-Speech (TTS) | Coqui TTS and Chatterbox | Offline |
| Online Search | Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo | Hybrid (opt-in) |
| Code Review / Fix | AI-powered code insight and automated fixes | Offline/Hybrid |
| Debug Guide | Conversational, context-based debugging | Hybrid |
| Document Ingestion | PDF, EPUB, TXT, MD, DOCX, JPG, PNG support | Offline |
| GPU Utilization | Intel oneAPI, PyTorch-XPU for Arc A770 | Offline |
| Backend Launch | Pixi environment-managed backend process | Offline |

## 🙌 Use Policy, Credit, and Community

- **Free for everyone.**
- If AIDE powers your project (commercial/hobby), just credit **platysonique** (e.g., “Built with AIDE by platysonique”).
- **Do NOT** resell, redistribute, or bundle AIDE itself (standalone or embedded) in other products.
- Commercial projects using AIDE as a tool/aid are welcome—credit is all that's needed!
- To redistribute, embed, or sell AIDE itself, **contact platysonique for licensing.**
- Want to show support? Buy a coffee or a “lambo”: Cash App \$thereisnofork.


## 💡 Helpful Q\&A

- **Do I need a local search server?**
No! All APIs are included—just paste keys in `config.yaml` as needed.
- **Where do my search keys go?**
`src/backend/config.yaml`, under the relevant fields.
- **Can I use AIDE in a commercial project I build?**
Absolutely! If AIDE is playing a supporting (aide) role—not distributed directly—just mention "Built with AIDE by platysonique."
- **Can I sell or bundle AIDE itself?**
No. If you want to redistribute, embed, or sell AIDE (standalone/component), contact platysonique for a fair license.
- **My company wants to embed AIDE in a product. How do we proceed?**
Contact for licensing. This ensures AIDE stays free and improving for all!


## 📝 GitHub Repo

Main home:
[https://github.com/platysonique/AIDE.git](https://github.com/platysonique/AIDE.git)

*Built by the community, for the community. Empowering coders—especially in Intel-landia—with AI that puts you first.*

If you want to fuel new features—or buy me a latte/lambo: \$thereisnofork (Cash App). Thank you!


