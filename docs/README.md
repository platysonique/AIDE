
# 1. README.md

**Agentic AI for VSCodium/VSCode—built for the Intel Arc community, free for all.**

## 🚀 What Is AIDE?

AIDE is an open-source, privacy-first AI companion for Codium/VSCode. It delivers code review, document ingestion, hybrid web/local search, GPU acceleration, speech input, and more—all with no Conda or manual complexity. If you use it, please credit **platysonique**.

## ✨ Features

- **Intelligent Coding Assistant:** Instant help and proactive suggestions.
- **GPU Acceleration:** Optimized for Intel Arc, with CPU fallback.
- **Offline-First:** Features run locally; online search is opt-in.
- **Easy Search Integration:** Hybrid search from Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo—no local search engines needed.
- **Speech \& Document UI:** Use your voice or upload documents at any time.
- **Reliable Code Review \& Debugging:** Automated fixes and guided debugging.
- **For the Community:** Free to use, extend, or remix—just mention platysonique!


## 🛠 Prerequisites

Install these before continuing:

- **Node.js** (v20+)
- **npm**
- **TypeScript** (install globally: `npm install -g typescript`)
- **Pixi** (Python package/env manager)
- **Python** (>=3.9, <3.12; Pixi manages this)

**Quick install (Linux/macOS):**

```sh
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
sudo apt-get install -y nodejs
npm install -g typescript
curl -fsSL https://pixi.sh/install.sh | bash
```

*For Windows, see each tool's official guides.*

## 📦 How to Set Up \& Build

1. **Clone the repository:**

```sh
git clone https://github.com/platysonique/AIDE.git
cd AIDE
```

2. **Configure AIDE (Important!):**

Edit `src/backend/config.yaml` *before* installing:
    - Set your search order (`online_search`, `fallback_order`) with options like perplexity, duckduckgo, wikipedia, wolframalpha, open-meteo.
    - Add any API keys or AppIDs required.
    - No need to host your own search engine—everything works out of the box with these public/free APIs.
3. **Install and Build:**

```sh
bash scripts/setup.sh                 # Python environment via Pixi
cd src/extension
npm install --legacy-peer-deps        # Installs node modules for build
npm run bundle                        # Builds the extension
npx vsce package --out aide.vsix      # Creates the VSIX installer
```

4. **Install the Extension:**
    - In Codium/VSCode: Extensions sidebar → (…) menu → “Install from VSIX…” → select `aide.vsix`
    - Or via terminal:

```sh
codium --install-extension build/aide.vsix
# or
code --install-extension build/aide.vsix
```

5. **Start Using AIDE:**
    - If backend is not running, launch:

```sh
pixi shell
pixi run python src/backend/api.py
```

    - Launch AIDE features from the command palette inside Codium/VSCode (“AIDE: …”).

## 🔍 Search Features (No Extra Installs Required)

- **APIs included:** Perplexity, DuckDuckGo, Wikipedia, Wolfram Alpha, Open-Meteo (all via free/public APIs—just paste keys as needed in `config.yaml`).
- **No SearxNG or other local search servers required!**
- **Flexible order:** Control priority/redundancy in `config.yaml`.
- **Automatic fallback:** If the first search fails, AIDE automatically moves to the next.


## 🙌 Use Policy, Credit, and Community

- **Free for everyone.**
- If you use AIDE as a tool or underpinning for any project (commercial or otherwise), just credit **platysonique** (e.g., “Built with AIDE by platysonique”).
- **Do NOT** resell, redistribute, or bundle AIDE itself as a standalone or embedded component within another product, commercial or otherwise.
- Commercial projects that use AIDE as a development or automation aide/tool are welcome—credit is all that’s needed!
- Want to show support?
**Buy me a coffee or a “lambo” via Cash App: \$thereisnofork**. Thank you!


## 💡 Helpful Q\&A

**Q: Do I need a local search server?**
A: No! All free APIs are included—just paste keys where needed.

**Q: Where do my search keys go?**
A: `src/backend/config.yaml`, under the appropriately labeled fields.

**Q: Can I use AIDE in a commercial project I build?**
A: Absolutely! As long as AIDE is playing a supporting (aide) role, not getting embedded or distributed on its own. Just mention “Built with AIDE by platysonique.”

**Q: Can I sell or bundle AIDE itself?**
A: No. If you want to redistribute, embed, or sell AIDE (standalone or as an embedded/packaged component), please **contact platysonique for licensing**. This is how we keep AIDE free for the community while giving all commercial partners a chance to do things fairly! Reach out via GitHub or project issues.

**Q: What if I want my company/product to embed AIDE as part of a commercial offering?**
A: Please get in touch to discuss a license. This ensures the project (and Intel-landia!) can keep improving for everyone.

## 📝 GitHub Repo

Main home:
[https://github.com/platysonique/AIDE.git](https://github.com/platysonique/AIDE.git)

**Built by the community, for the community.
Empowering coders—especially in Intel-landia—with AI that puts you first.**

*If you want to fuel the next features (or a coffee/lambo): \$thereisnofork on Cash App. Thank you!*

