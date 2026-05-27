# GitHub Actions example

Drop-in workflow for running `repomap generate` in CI on every push to `main` (or on manual dispatch), with three strategies for handling the generated docs.

## Setup

1. Copy `repomap.yml` from this directory to `.github/workflows/repomap.yml` in your repo.
2. Add `ANTHROPIC_API_KEY` to repo Settings → Secrets and variables → Actions.
3. Make sure `repomap.config.yml` is at the root of your repo (run `repomap init` locally to create one).

## Picking a strategy

The example workflow has three options commented inline — keep one, delete the others:

| Strategy | When | Trade-off |
|----------|------|-----------|
| **A** — commit docs back | Internal repos where docs travel with code | Every doc regen is a commit; pollutes history |
| **B** — open a PR | Public/OSS repos, want a review step | Adds friction; PR sits open until merged |
| **C** — deploy to Pages | Want a hosted site at `*.github.io/<repo>` | Output is decoupled from source — extra hop to read it |

## Composite action inputs

If you want to write your own workflow against the action directly:

```yaml
- uses: Yeinthony/repomap@v1
  with:
    config-path: repomap.config.yml      # default: repomap.config.yml
    output-path: ./repomap-docs          # default: ./repomap-docs
    ai-provider: claude                  # default: claude (use `claude` in CI; `claude-code` needs the local CLI)
    model: sonnet                        # optional: 'sonnet' | 'opus' | full id
    lang: en                             # optional: 'en' | 'es'
    format: html                         # optional: 'html' | 'markdown' | 'json'
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    repomap-version: latest              # default: latest published @repomap/cli on npm
    node-version: '20'                   # default: '20'
    python-version: '3.11'               # default: '3.11'
```

Outputs:
- `output-path` — absolute path to the generated docs directory (use this for downstream steps like Pages deploy).
