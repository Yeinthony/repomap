# @repomap/adapter-claude

Anthropic Claude API adapter for [repomap](https://github.com/Yeinthony/repomap).

Uses the `@anthropic-ai/sdk` and requires `ANTHROPIC_API_KEY` in the environment. Recommended for CI/CD, where the Claude Code CLI isn't typically available.

For local use on a developer machine, prefer [`@repomap/adapter-claude-code`](https://www.npmjs.com/package/@repomap/adapter-claude-code) — it uses your Pro/Max subscription via the local `claude` binary.

## Usage

You typically don't import this directly — the [`@repomap/cli`](https://www.npmjs.com/package/@repomap/cli) picks the adapter based on `ai.provider` in your `repomap.config.yml`:

```yaml
ai:
  provider: claude
  # apiKey: optional — usually ANTHROPIC_API_KEY env var
```

See the [main README](https://github.com/Yeinthony/repomap#readme) for the full picture.

## License

MIT
