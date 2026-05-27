# @repomap/adapter-ollama

[Ollama](https://ollama.com) adapter for [repomap](https://github.com/Yeinthony/repomap).

Talks to a local Ollama HTTP server — **no API key, no data leaves your machine**. Recommended for private code, air-gapped environments, or zero-spend setups.

## Prereqs

1. Install Ollama: `brew install ollama` (macOS) or download from [ollama.com/download](https://ollama.com/download).
2. Pull a model: `ollama pull qwen2.5-coder:7b` (recommended) or `ollama pull llama3.1:8b`.
3. Make sure the server is running: `ollama serve` (the desktop app starts it automatically).

## Usage

You don't normally import this directly — the [`@repomap/cli`](https://www.npmjs.com/package/@repomap/cli) picks the adapter based on `ai.provider` in your `repomap.config.yml`:

```yaml
ai:
  provider: ollama
  model: qwen2.5-coder:7b      # must be already pulled with `ollama pull`
  baseUrl: http://localhost:11434   # optional override
```

## Model recommendations

| Model | Why | RAM |
|-------|-----|-----|
| `qwen2.5-coder:7b` | **Default.** Tuned for software dev. Good structured-output adherence. | ~6 GB |
| `llama3.1:8b` | More general-purpose. Slightly more verbose prose. | ~6 GB |
| `qwen2.5-coder:14b` | Higher quality if you have the RAM. | ~12 GB |
| `deepseek-r1:7b` | Reasoning model. Slower but follows the docs schema more carefully. | ~6 GB |

Bigger models = better prose, more accurate technical details, slower (≥5min vs ~1-2min for 7b on M-series Macs).

## Trade-offs vs Claude

- **+** Free, private, offline-capable
- **+** Fits CI runners without secrets
- **−** Output quality is below frontier models (Sonnet/Opus) — analogies and prose are noticeably less polished
- **−** Slower per call
- **−** No prompt caching, so each `generate` re-uses the full token budget

See the [main README](https://github.com/Yeinthony/repomap#readme) for the full picture.

## License

MIT
