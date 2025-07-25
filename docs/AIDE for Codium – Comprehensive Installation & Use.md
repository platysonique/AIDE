<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" class="logo" width="120"/>

# AIDE for Codium – Comprehensive Installation \& User Guide (2025+)

## What is AIDE?

AIDE is a privacy-first, agentic AI assistant for VSCodium/VSCode, developed for the Intel Arc community but usable by anyone. It enables seamless code review, document ingestion, hybrid online/offline search (with multiple free APIs), robust code intelligence, speech control, and GPU acceleration—without Conda or complex tooling. It’s fully open, and free, and just asks for visible credit to **platysonique** if used.

## Prerequisites

Install these before setup:

- **Node.js** (v20+)
- **npm**
- **TypeScript** (install globally: `npm install -g typescript`)
- **Pixi** (Python/package manager)
- **Python** (>=3.9, <3.12; Pixi manages this for you)

**Quick Install Commands (Linux/macOS):**

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
sudo apt-get install -y nodejs
npm install -g typescript
curl -fsSL https://pixi.sh/install.sh | bash
```

*On Windows, follow official install guides for each tool.*

## Installation \& Build Guide

### 1. Clone the Repository

```sh
git clone https://github.com/platysonique/AIDE.git
cd AIDE
```


### 2. Configure Your API Keys \& Search

**Critical: Edit `src/backend/config.yaml` first!**

- Set the search providers/order (`online_search`, `fallback_order`).
- Paste your API keys/AppIDs for Perplexity, Wolfram Alpha, etc., as documented in the config file.
- No need to run your own search server—just use free/public APIs!


### 3. Install Dependencies and Build

```sh
bash scripts/setup.sh              # Sets up Python env using Pixi
cd src/extension
npm install                        # NodeJS extension dependencies
npm run bundle                     # Builds the VSCode/Codium extension
cd ../../build
npx vsce package --out aide.vsix   # Packages the VSIX installer
```


### 4. Install the Extension in VSCodium/VSCode

- **GUI:** Extensions sidebar > "..." > "Install from VSIX…" > pick `aide.vsix`
- **CLI:**

```sh
codium --install-extension build/aide.vsix
# or
code --install-extension build/aide.vsix
```


### 5. Start Backend \& Use

If not started automatically:

```sh
pixi shell
pixi run python src/backend/api.py
```

Open the extension's command palette—look for "AIDE: …" controls, code review, ingest, and more.

## Usage \& Features

### Key Features

- **GPU Acceleration:** Intel Arc support with fallback to CPU.
- **Hybrid Search:** Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo—controlled in your config.
- **Speech \& Document UI:** Use voice or upload docs with a click.
- **Agentic Automation:** Context-aware code review, batch fixes, debugging.
- **Privacy-first:** Core features work offline with opt-in online search.


### File Placement

- **Models:** Place required models in `/models/` (this folder is empty by default, not version-controlled).
- **Config:** All search keys/settings go in `src/backend/config.yaml`.
- **Never commit API keys or model binaries to GitHub; provide a `config.yaml.example` for others if desired.**


## Credit, License \& Commercial Use

- **Free for everyone.**
- Credit required: “Built with AIDE by platysonique”.
- You may NOT resell, repackage, or embed AIDE itself (VSIX, module, or bundled) as part of another product or platform without **explicit permission**. For such use, contact platysonique to discuss licensing.
- You ARE free to use AIDE as an aide/tool in any commercial or personal project (including SaaS and apps), as long as AIDE is not itself distributed, sold, or bundled.
- Donations: **Buy me a coffee or a “lambo”: \$thereisnofork** on Cash App.


## FAQ Quick Reference

| **Question** | **Answer** |
| :-- | :-- |
| Do I need my own search engine? | No. Just use the free API integrations—add your API keys to the config as needed. |
| Where do my API keys go? | `src/backend/config.yaml` in the labeled fields. |
| Can I use AIDE to build a commercial product? | Yes! Just mention “Built with AIDE by platysonique” and don’t sell/distribute/embed AIDE itself. |
| Can I bundle/distribute/embed AIDE as is? | No. Contact platysonique if you want to license AIDE for embedding or distribution as part of your own product or system. |
| What about support or OEM? | Reach out for custom deals, SLAs, feature requests, or high-volume integration via GitHub Issues or email. |

## GitHub Repository

[https://github.com/platysonique/AIDE.git](https://github.com/platysonique/AIDE.git)

- MIT License (with custom addendum—see LICENSE for distribution/embedding policy)
- Authored \& maintained by **platysonique**
- Community, code, and support for all in “Intel-landia” and beyond.

**If you want to help keep AIDE growing (or just buy me a coffee or lambo): \$thereisnofork on Cash App. THANK YOU!**

*This document is current as of July 2025 and reflects all migration away from Conda, now using Pixi for modern environment management and free, open search/AIGC integrations.*

<div style="text-align: center">⁂</div>

[^1]: AIDE-for-Codium-Full-Unabridged-Project-Guide.md

[^2]: AIDE-for-Codium_-Project-Overview-with-Hybrid-Kno.md

