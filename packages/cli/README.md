# @repomap/cli

**AI-powered documentation generator for multi-repo projects.**

Point repomap at your repos, wait 2-5 minutes, get a framework-quality HTML site: overview, per-service pages, integrations, interactive graph, Mermaid diagrams with pan/zoom.

## Install

```bash
npm install -g @repomap/cli
```

You also need:
- **Node.js ≥ 18**
- **graphify CLI** — `pipx install graphifyy` (or `uv tool install graphifyy`)
- **Claude Code** authenticated (`claude` on PATH) — or `ANTHROPIC_API_KEY` for the API adapter

## Quick start

```bash
cd ~/workspaces/my-platform   # parent dir with your repos
repomap doctor                # verify your setup
repomap init                  # create repomap.config.yml
# edit repomap.config.yml to point at your repos
repomap generate              # AST + LLM → HTML (~2-5 min)
repomap serve                 # http://localhost:4040
```

## Commands

| Command | What it does | LLM call? |
|---------|--------------|:---------:|
| `repomap init` | Create a starter `repomap.config.yml` | – |
| `repomap doctor` | Check Node, graphify, config, repos, AI provider, output | – |
| `repomap generate` | Full pipeline: analyze + LLM + write HTML | yes |
| `repomap render` | Re-render HTML from cached `knowledge.json` (iterate on design) | – |
| `repomap watch` | Auto-update docs when code changes | partial |
| `repomap serve` | Local server + browser open, with live-reload | – |
| `repomap status` | Last generate, cache size, debug dumps, repos | – |
| `repomap clean` | Wipe caches (or `--all` for HTML too) | – |
| `repomap hooks install` | Install `post-merge` git hook to auto-regenerate | – |

Useful flags on `generate`:
- `--ai claude-code | claude` — pick provider
- `--model sonnet | opus` — pick model
- `--verbose` — show adapter, model, paths
- `--debug` — dump prompt + raw LLM response to `<output>/.repomap-debug/`

## Full docs

See the [main README](https://github.com/Yeinthony/repomap#readme) for configuration reference, detectors, troubleshooting, and how it works under the hood.

## License

MIT
