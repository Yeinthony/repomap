# @repomap/adapter-claude-code

Claude Code CLI adapter for [repomap](https://github.com/Yeinthony/repomap).

Uses your local `claude` binary (Pro/Max subscription) — **no API key required**. This is the default adapter for local development.

For CI/CD where the Claude Code CLI isn't available, use [`@repomap/adapter-claude`](https://www.npmjs.com/package/@repomap/adapter-claude) (API-key based).

## Usage

You typically don't import this directly — the [`@repomap/cli`](https://www.npmjs.com/package/@repomap/cli) picks the adapter based on `ai.provider` in your `repomap.config.yml`:

```yaml
ai:
  provider: claude-code   # default
  # model: sonnet         # 'sonnet' (fast) | 'opus' (best) | full id
  # binary: claude        # path to claude binary if not on PATH
  # maxBudgetUsd: 1.00    # safety cap per call
```

See the [main README](https://github.com/Yeinthony/repomap#readme) for the full picture.

## License

MIT
